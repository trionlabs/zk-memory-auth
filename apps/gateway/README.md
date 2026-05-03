# @zkma/gateway

A drop-in proxy in front of mem0. Every memory request goes through four cryptographic gates - the request passes only if all four agree:

1. The submitted Noir proof's `keccak256(proof || publicInputs)` equals the user's `zkma:proof-commitment` ENS record.
2. The proof's RSA modulus matches one Google currently publishes via JWKS.
3. The proof verifies under bb.js UltraHonk against the compiled circuit.
4. The proof's `expected_email` hashes to the user's `zkma:email-hash` ENS record (admin-onboarded).
5. A per-request wallet signature recovers to the subname's `addr`.

After all gates pass the policy package decides which mem0 hits the principal can see, and metadata is locked on writes.

## Run locally

```bash
# 1. start mem0 (see services/README.md and docs/SETUP.md)
cd services/mem0/server && docker compose -f docker-compose.yaml up

# 2. start the gateway with the security-critical env (production values shown)
cd apps/gateway
pnpm install
PORT=8787 \
  MEM0_BASE_URL=http://localhost:8888 \
  MEM0_AGENT_ID=zkma \
  SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  ZKMA_EXPECTED_AUD=<your-google-oauth-client-id> \
  ZKMA_GATEWAY_DOMAIN=zkma:gateway:prod-eu \
  pnpm dev
```

`ZKMA_EXPECTED_AUD` must be set or every search returns 403 with `"ZKMA_EXPECTED_AUD env not set"`. `ZKMA_GATEWAY_DOMAIN` defaults to `"zkma:gateway:dev"` for local; production deployments must use a unique value to prevent cross-deployment signature replay.

## Env vars

### Required

| Var | Purpose |
|---|---|
| `MEM0_BASE_URL` | URL of the mem0 server (default `http://localhost:8888`) |
| `MEM0_AGENT_ID` | mem0 `agent_id` scope for every zkma write/search (default `zkma`) |
| `SEPOLIA_RPC_URL` | RPC for ENS resolution (default the public-node URL) |
| `ZKMA_EXPECTED_AUD` | the platform's Google OAuth client_id; gateway pins `expected_aud` from publicInputs to this value |

### Optional / security-relevant

| Var | Default | Purpose |
|---|---|---|
| `ZKMA_EXPECTED_ISS` | `https://accounts.google.com` | JWT issuer pin |
| `ZKMA_IAT_MAX_AGE_SECS` | `604800` (7d) | how old `iat_lower` may be |
| `ZKMA_GATEWAY_DOMAIN` | `zkma:gateway:dev` | per-deployment domain separator on the signed challenge |
| `ZKMA_GOOGLE_JWKS_URL` | `https://www.googleapis.com/oauth2/v3/certs` | Google JWKS endpoint |
| `ZKMA_SKIP_JWKS` | unset | `=1` skips the live JWKS fetch (test-only); combine with `ZKMA_EXTRA_MODULI` |
| `ZKMA_EXTRA_MODULI` | unset | comma-separated hex moduli to allow on top of JWKS (test-only) |
| `ZKMA_SKIP_PROOF_VERIFY` | unset | `=1` skips the bb.js cryptographic call. JWKS + claim pins still run. Loud warning logged. |
| `ZKMA_CIRCUIT_PATH` | `circuits/zkma-auth/target/zkma_auth.json` | path to the nargo-compiled artifact |
| `MEM0_API_KEY` | unset | `Authorization: Token` header for mem0 if configured upstream |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | liveness |
| `GET` | `/challenge?subname=aysel.zkmemory-istanbulhospital.eth` | issue a single-use nonce (60s TTL) |
| `POST` | `/v1/memories/search` | mem0-compatible search; results filtered through `@zkma/policy` |
| `POST` | `/v1/memories` | mem0-compatible write; metadata locked to principal's caps |

### Search request shape

```jsonc
// headers
"x-zkma-nonce": "0x...",
"x-zkma-sig":   "0x...",  // personal_sign of keccak256(domainHash || nonce || keccak256(JSON(body)))

// body
{
  "subname": "aysel.zkmemory-istanbulhospital.eth",
  "proof": "0x...",
  "publicInputs": "0x...",
  "query": "what is patient 304's medication schedule"
}
```

`domainHash = keccak256(ZKMA_GATEWAY_DOMAIN)`. The sig is recovered against the address returned by the subname's `addr` resolver record. The commitment is checked against `zkma:proof-commitment`. The email hashed from publicInputs.expected_email is checked against `zkma:email-hash`.

### Write request shape

```jsonc
// headers same as search
"x-zkma-nonce": "0x...",
"x-zkma-sig":   "0x...",

// body
{
  "subname": "aysel.zkmemory-istanbulhospital.eth",
  "proof": "0x...",
  "publicInputs": "0x...",
  "content": "patient 304 prescribed amoxicillin 500mg tid",
  "namespace": "clinical",
  "tag": "confidential",
  "sharedWith": []
}
```

Write rules (`src/mem0.ts::checkWrite`): tag must be at-or-below the principal's `max-tag`; namespace must be in the principal's namespaces; `owner_org` is forced to the principal's org (no impersonation); `shared_with` is whatever the writer chooses.

## Layout

```
apps/gateway/src/
  env.ts        # lazy env getters, security-critical defaults
  ens.ts        # viem-based ENS resolver -> typed Principal + emailHash + commitment
  jwks.ts       # Google JWKS fetch + cache + modulus-allowlist check
  claims.ts     # publicInputs decoders + aud/iss/iat pin + email-binding pin
  proof.ts     # bb.js UltraHonk verifier wrapper, runs all four gates
  mem0.ts       # HTTP client to mem0 + post-hoc policy filter on results + checkWrite
  server.ts     # Fastify factory, nonce store, sig verify, orchestration
  index.ts      # thin entry that calls buildServer().listen()
apps/gateway/scripts/
  test-claims-unit.ts   # claims.ts isolated unit tests
  test-real-proof.ts    # full proof gen + verify, every reject path
  test-http-flow.ts     # fastify.inject with fake ENS + fake mem0
  test-mem0-real.ts     # boots stub-openai, drives gateway against real mem0 docker
  stub-openai.ts        # deterministic /v1/embeddings + /v1/chat/completions stub
```

## Tests

```bash
cd apps/gateway
pnpm test:claims  # unit: claims.ts decoders, offsets, BigInt-precision iat
pnpm test:proof   # crypto: real Noir proof + every reject path (8 cases)
pnpm test:http    # http: every gate fires (16 cases, fake ENS/mem0)
pnpm test:mem0    # integration: real mem0 docker, real metadata round-trip (10 cases)
```

`test:mem0` requires Docker running and `pnpm stub:openai` (or set `OPENAI_BASE_URL` to real OpenAI). See `docs/SETUP.md` for the full sequence.

## Architecture for testability

`src/server.ts` exports `buildServer(deps)` - a factory accepting optional fakes for `resolvePrincipal`, `searchAndFilter`, `postMemory`, `verifyProof`. Tests pass fakes; `src/index.ts` is a thin entry that uses defaults and calls `.listen()`.

## Toolchain pins

- `nargo 1.0.0-beta.15` (matches `circuits/.tool-versions`)
- `@aztec/bb.js@3.0.0-nightly.20251104` (the bb version `bbup` resolves for this nargo)
- `@noir-lang/noir_js@1.0.0-beta.15`

bb.js, noir_js, and the bb native binary all need to match the nargo version that compiled the circuit. Pinning them by exact version is the only way to keep the witness/proof formats compatible. When bumping nargo, run `bbup` and bump these three together.

## Known gaps

- **Nonce store is in-process.** Single-instance only. Multi-instance deployments need shared state (Redis or similar). A 30s TTL sweeper caps memory in the meantime.
- **mem0's metadata filter API is bypassed.** We forward the query unfiltered and filter in TS post-hoc. Slower but correct across mem0 versions.
- **CRS download blocks first verify.** bb.js fetches the trusted-setup CRS lazily on first call (~5-10s). Acceptable for hackathon; for prod, bundle the CRS.
- **Email is plaintext in publicInputs.** v0.2 should switch the circuit's `expected_email` to a Field (Poseidon) commitment so observers see only a hash.
- **`POST /v1/memories` write path has no integration test yet.** Tracked in `docs/SECURITY-GAPS.md`.
