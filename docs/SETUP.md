# Setup and demo runbook

End-to-end instructions for getting the zk-memory-authorization stack up locally and walking through the demo. Tested on macOS + Docker Desktop.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | 20 or 22 | runs gateway, scripts, admin UI |
| pnpm | 9.0+ | workspace package manager |
| Docker | 25+ | runs vendored mem0 (postgres, qdrant, mem0 server) |
| Foundry (forge) | latest | builds and tests `ZkmaResolver` |
| nargo | exactly `1.0.0-beta.15` | compiles the Noir circuit |
| bbup -> bb | resolved by `bbup` to match nargo | proof generation |

Install nargo + bb via the Noir toolchain manager:

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup -v 1.0.0-beta.15
bbup   # auto-resolves the matching bb version (3.0.0-nightly.20251104 at time of writing)
```

`circuits/.tool-versions` pins the nargo version per project for asdf-style managers.

## One-time install

```bash
pnpm install
( cd contracts && forge install )
( cd circuits/zkma-auth && nargo compile )
```

`nargo compile` writes `circuits/zkma-auth/target/zkma_auth.json`. The gateway reads this artifact when verifying proofs; if it is missing the verifier path will throw at first request.

## Run the stack

The stack has four moving parts. Open four terminals or use a process manager.

### 1. mem0 (docker)

mem0 needs an LLM provider for memory extraction. For demo+test we point it at a local stub instead of paying for OpenAI.

```bash
# .env for mem0 (one-time)
cat > services/mem0/server/.env <<'EOF'
OPENAI_API_KEY=sk-stub-not-real
OPENAI_BASE_URL=http://host.docker.internal:9999/v1
JWT_SECRET=zkma-dev-secret
ADMIN_API_KEY=zkma-admin-dev
AUTH_DISABLED=true
DASHBOARD_URL=http://localhost:3000
APP_DB_NAME=mem0_app
MEM0_TELEMETRY=false
MEM0_DEFAULT_LLM_MODEL=gpt-4.1-nano-2025-04-14
MEM0_DEFAULT_EMBEDDER_MODEL=text-embedding-3-small
EOF

cd services/mem0/server
docker compose -f docker-compose.yaml up -d --build
# mem0 REST on http://localhost:8888
# dashboard on http://localhost:3000
```

### 2. stub-openai

Tiny local server that responds to mem0's `/v1/embeddings` calls with deterministic 1536-dim vectors (and `/v1/chat/completions` defensively, though `infer=false` short-circuits it).

```bash
pnpm --filter @zkma/gateway stub:openai
# listens on :9999
```

If you have a real `OPENAI_API_KEY`, drop the stub and set `OPENAI_BASE_URL=https://api.openai.com/v1` (or remove it entirely). mem0 will then do real LLM extraction and real embeddings.

### 3. Gateway

```bash
PORT=8787 \
  MEM0_BASE_URL=http://localhost:8888 \
  MEM0_AGENT_ID=zkma \
  SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  pnpm --filter @zkma/gateway dev
```

The gateway lazy-initializes the bb.js verifier on first `POST /v1/memories/search`. The first call eats ~10 seconds (CRS download + backend init); subsequent calls are sub-second.

#### Verifier env vars (security-relevant)

| Var | Default | Purpose |
|---|---|---|
| `ZKMA_GOOGLE_JWKS_URL` | `https://www.googleapis.com/oauth2/v3/certs` | Where the gateway fetches Google's RSA pubkeys for the modulus pin |
| `ZKMA_SKIP_JWKS` | unset | `=1` skips the JWKS fetch entirely. Combine with `ZKMA_EXTRA_MODULI` for tests. **Production must leave this unset.** |
| `ZKMA_EXTRA_MODULI` | unset | Comma-separated hex moduli to allow in addition to JWKS. Test-only. |
| `ZKMA_SKIP_PROOF_VERIFY` | unset | `=1` skips bb.js verification entirely. Loud warning logged at startup. **Production must leave this unset.** |

The default behavior of `verifyProof` is fail-closed in three layers: commitment hash match, modulus in Google JWKS, bb.js cryptographic verify. All three must pass.

### 4. Admin UI (optional for the demo narrative)

```bash
pnpm dev
# http://localhost:3030
```

## Tests

All tests live under `apps/gateway/scripts/` and are wired up as pnpm scripts. They each prove a different layer:

```bash
# 1. unit tests for the policy evaluator (no network)
pnpm --filter @zkma/policy test

# 2. cryptographic core: real Noir UltraHonk proof, gateway verifyProof
pnpm --filter @zkma/gateway test:proof

# 3. HTTP surface: fastify.inject with fake ENS + fake mem0 deps
pnpm --filter @zkma/gateway test:http

# 4. real-mem0 integration (requires #1 stub-openai running and mem0 docker up)
pnpm --filter @zkma/gateway test:mem0
```

Test 4 is the most important: it exercises the gateway against a real mem0 daemon, with real metadata round-tripping through pgvector, and asserts that nurse / admin / insurer see different slices of the same memory store.

## Live demo flow (the launch-video version)

The hackathon demo runs the same data through three personas. With mem0 + stub + gateway running:

```bash
# Wipe + seed 18 healthcare memories spanning every (namespace, tag) cell
MEM0_BASE_URL=http://localhost:8888 pnpm --filter @zkma/gateway exec tsx ../../scripts/seed-memories.ts
```

Then drive the gateway from any client. Without browser proof gen wired up yet (see "Known gaps" below), use `apps/gateway/scripts/test-mem0-real.ts` as the reference - it builds a server with an injected fake ENS resolver and runs three queries that show:

1. Nurse Aysel asks about the patient's meds -> ok.
2. Nurse Aysel asks about the patient's psych eval -> denied (`tag restricted > max-tag confidential`).
3. Hospital admin asks the same question -> ok.
4. Insurer asks for the claim ICD codes -> ok (`shared_with` contains the insurer org).
5. Insurer asks for the patient's psych history -> denied (cross-org, not shared).
6. Insurer asks for the hospital's other contracts -> denied (`executive` namespace, never shared).

## Smart contracts

The `ZkmaResolver` source already targets the `zkmemory-` prefix and `zkma:*` text records, but the live Sepolia deployment at `0x418D97d0bA1BF82B79e51C0C1c36FB7105E821DE` still carries the **old** prefix and key namespace from before the rename. To redeploy:

```bash
cd contracts
cp .env.example .env
# fill SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, PLATFORM_KEY (Sepolia ETH for gas)
source .env

forge script script/Bootstrap.s.sol:Bootstrap --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
bash script/export-types.sh   # mirrors the new address into packages/contracts-types
```

Then in the admin UI, register `zkmemory-<orgname>.eth` and mint user subnames. Each user subname carries the `zkma:role`, `zkma:namespaces`, `zkma:max-tag`, `zkma:expiry`, `zkma:revoked`, and `zkma:proof-commitment` text records.

To verify wildcard ENS resolution end-to-end on live Sepolia:

```bash
cd contracts
node script/smoke.mjs
```

## Security model (what the proof actually attests to)

A `verifyProof` success means **all four** are true:

1. The proof's `keccak256(proof || publicInputs)` equals the commitment in the user's `zkma:proof-commitment` ENS record. (Cheap layer 1.)
2. The proof's `pubkey_modulus_limbs` matches an RSA modulus Google currently publishes in its JWKS. (Layer 2 - gateway-side pin.)
3. The Noir circuit verifies cryptographically: signature valid for that modulus, `email` claim matches `expected_email`, `email_verified` is true, `aud` matches `expected_aud`, `iat` is in the freshness window. (Layer 3 - bb.js.)
4. The user signed a per-request ECDSA challenge that recovers to the wallet address bound to their ENS subname. (Layer 4 - challenge in the gateway.)

Any single layer fails -> 401/403. Documented in `circuits/README.md` "Defenses outside the circuit".

## Known gaps

- **Browser proof generation** (`/refresh` page) is not yet wired. The cryptographic core works (proof gen + verify) - what's missing is a UI that takes a Google JWT, runs noir-jwt + bb.js in the browser, and writes the resulting commitment to ENS. Until then, proofs are generated in `apps/gateway/scripts/test-real-proof.ts` and `test-mem0-real.ts` injects a fake `verifyProof` because the test focuses on the search path.
- **Email is plaintext in publicInputs.** v0.2 should hash it (Poseidon) so observers of the proof see only a commitment, not the email itself. Out of scope for this iteration.
- **Sepolia contract still has the old prefix.** Source code uses `zkmemory-` and `zkma:*`; deployed contract uses `zkcontext-` and `zkca:*`. Redeploy steps above.
- **stub-openai's embeddings are deterministic-by-content but content-blind to semantics.** Vector similarity ranks are arbitrary. Fine for showing that metadata filtering works; not fine for testing search-relevance quality.

## Resetting state between runs

```bash
# wipe mem0 memories (keeps schema)
curl -s -X POST http://localhost:8888/reset

# nuke postgres volume entirely
cd services/mem0/server && docker compose down -v
```

## Toolchain pin notes (do not change without coordination)

- `circuits/.tool-versions` pins `nargo 1.0.0-beta.15` so `noir-jwt v0.5.1` -> `noir_rsa v0.9.1` -> `sha512 v0.1.0` still compiles. Newer nargo removed `std::wrapping_add` which sha512 v0.1.0 calls.
- `apps/gateway/package.json` pins `@aztec/bb.js@3.0.0-nightly.20251104` and `@noir-lang/noir_js@1.0.0-beta.15` to match nargo. When bumping nargo, run `bbup` and re-pin all three together.
