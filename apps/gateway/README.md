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
| `POST` | `/v1/memories/search` | mem0-compatible search; gated by ENS + proof + sig |

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

## Known gaps

- **No Noir verifier.** `src/proof.ts` confirms the commitment hashes match but does not run the bb.js verifier. Wire that in once the circuit's verification key is exported from nargo.
- **No write path.** Only `/v1/memories/search` is implemented. Writes need their own policy: a principal can only write at or below their `max-tag` and within their namespaces.
- **Nonce store is in-process.** Single-instance only. Multi-instance deployments need shared state (Redis or similar).
- **mem0's metadata filter API is bypassed.** We forward the query unfiltered and filter in TS post-hoc. Slower but correct across mem0 versions.
