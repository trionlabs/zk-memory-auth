# @zkma/gateway

A drop-in proxy in front of mem0. For every memory request: resolves the user's ENS subname, checks revocation/expiry, verifies a Noir proof against the on-ENS commitment, verifies a per-request wallet signature on a server-issued nonce, then forwards to mem0 with the policy filter applied to results.

## Run locally

```bash
# 1. start mem0 (see services/README.md)
cd services/mem0/server && docker compose -f docker-compose.yaml up

# 2. start the gateway
cd apps/gateway
pnpm install
PORT=8787 \
  MEM0_BASE_URL=http://localhost:8888 \
  SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  ZKMA_SKIP_PROOF_VERIFY=1 \
  pnpm dev
```

`ZKMA_SKIP_PROOF_VERIFY=1` short-circuits the Noir verifier (the bb.js path is still TODO - see `src/proof.ts`). It is logged on startup.

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
"x-zkma-sig":   "0x...",  // personal_sign of keccak256(nonce || keccak256(JSON(body)))

// body
{
  "subname": "aysel.zkmemory-istanbulhospital.eth",
  "proof": "0x...",
  "publicInputs": "0x...",
  "query": "what is patient 304's medication schedule"
}
```

The sig is recovered against the address returned by the subname's `addr` resolver record. The proof commitment is checked against the `zkma:proof-commitment` text record.

## Layout

- `src/env.ts` - loads env, defaults, the skip flag
- `src/ens.ts` - viem-based ENS resolver -> typed `Principal` (consumes `@zkma/policy`)
- `src/proof.ts` - commitment check now, Noir verify (`bb.js`) is the TODO
- `src/mem0.ts` - HTTP forward to mem0 + post-hoc policy filter on results
- `src/index.ts` - Fastify server: nonce store, sig verify, orchestration

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

## Tests

```bash
cd apps/gateway
pnpm test:proof   # bb.js verifier path against a real Noir proof
pnpm test:http    # HTTP path: fastify.inject with fake ENS + fake mem0
```

`test:proof` signs a JWT with the noir-jwt test key, generates a real UltraHonk proof for the zkma-auth circuit, runs it through `verifyProof`, and confirms tampered proofs / wrong commitments are rejected. ~10-15 seconds (most of it is proof generation).

`test:http` boots the gateway via `buildServer()` with a fake ENS resolver + fake mem0, then drives it through `fastify.inject`. Real proof, real wallet sig, real keccak. Covers happy path, revoked principal, missing commitment, expired, wrong wallet sig, nonce replay, missing nonce header.

## Architecture for testability

`src/server.ts` exports `buildServer(deps)` - a factory that takes optional injectable deps (`resolvePrincipal`, `searchAndFilter`, `postMemory`, `verifyProof`). Tests pass fakes; `src/index.ts` is a thin entry that uses defaults and calls `.listen()`.

## Toolchain pins

- `nargo 1.0.0-beta.15` (matches `circuits/.tool-versions`)
- `@aztec/bb.js@3.0.0-nightly.20251104` (the bb version `bbup` resolves for this nargo)
- `@noir-lang/noir_js@1.0.0-beta.15`

bb.js, noir_js, and the bb native binary all need to match the nargo version that compiled the circuit. Pinning them by exact version is the only way to keep the witness/proof formats compatible. When bumping nargo, run `bbup` and bump these three together.

## Known gaps

- **Nonce store is in-process.** Single-instance only. Multi-instance deployments need shared state (Redis or similar).
- **mem0's metadata filter API is bypassed.** We forward the query unfiltered and filter in TS post-hoc. Slower but correct across mem0 versions.
- **CRS download blocks first verify.** bb.js fetches the trusted-setup CRS lazily on first call. ~5-10 seconds. Acceptable for hackathon, fix for prod by bundling the CRS.
