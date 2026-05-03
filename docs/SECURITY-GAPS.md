# Open security gaps

A ruthless self-audit run as four parallel reviews surfaced the issues below. Items marked **FIXED** are closed in this branch; the rest are tracked for the next iteration. Each item links to the exact files involved.

## Fixed in this branch

- **FIXED. Skip-mode bypassed JWKS + claim pins.** `apps/gateway/src/proof.ts` now runs the JWKS modulus check and `checkClaims` *before* the `ZKMA_SKIP_PROOF_VERIFY` short-circuit. Skip mode now only skips the bb.js cryptographic call.
- **FIXED. `fieldToNumber` precision loss for u64 iat.** `apps/gateway/src/claims.ts` uses `BigInt` end-to-end; the iat-window comparison no longer rounds at `Number.MAX_SAFE_INTEGER`.
- **FIXED. `_resetCache` was a benign-looking production export.** Renamed to `__zkmaTestResetJwksCache` in `apps/gateway/src/jwks.ts` so a grep makes it obvious any caller is test-only.
- **FIXED. Nonce store unbounded growth.** `apps/gateway/src/server.ts` adds a `setInterval(... 30s)` sweeper that walks the map and deletes expired entries. `unref`'d so it does not keep the process alive.
- **FIXED. mem0 errors leaked as 500 with stack traces.** Both `POST /v1/memories/search` and `POST /v1/memories` wrap the upstream call in `try/catch` and return a sanitized `502 upstream * failed` while logging the full error server-side.
- **FIXED. Dead `void evaluate` import in `server.ts`.** Deleted.

## Open: structural

### 1. `expected_email` is in publicInputs but the gateway does not bind it to the subname's identity

`circuits/zkma-auth/src/main.nr` proves the JWT's `email` claim equals whatever bytes the prover put in `expected_email`. The gateway never compares those bytes against an authoritative record of "what email is supposed to belong to this subname." `apps/gateway/src/ens.ts` reads no such record. `contracts/src/zkma/ZkmaResolver.sol` has no `zkma:email` text record key.

In practice this means a user with their own valid Google JWT for *any* email can mint a commitment for that email and write it to the `zkma:proof-commitment` record on a subname they already control. The gateway accepts the proof because everything cryptographically lines up - but the identity Google attested to is not necessarily the one the org admin onboarded.

**Mitigations until fixed:**
- The user must own the wallet bound to the subname (per-request signature).
- The user must already be allowlisted as a subname owner by the org admin.
- So an attacker cannot cross-impersonate a *different* subname; this is a "did the user prove with the email the admin expected?" gap, not a cross-subname bypass.

**Fix path** (next contract change):
1. Add `zkma:email` text record (admin-set, like `zkma:role`).
2. Admin UI asks for the email at registration time.
3. Gateway's `resolvePrincipal` reads `zkma:email`.
4. Gateway's `checkClaims` decodes `expected_email` from publicInputs (offsets already laid out in `claims.ts`) and asserts equality against the resolved record.

### 2. `redc_params_limbs` is taken verbatim from the prover (TENTATIVE)

The circuit accepts user-supplied Barrett-reduction params alongside the modulus. If `noir-jwt` v0.5.1's transitive bignum library trusts those params rather than deriving them in-circuit from the modulus, a malicious prover could pair a real Google modulus with crafted redc params and forge an RSA verification. Status: needs verification by reading the bignum dep source.

If real, fix is either to derive the redc params in-circuit from the modulus, or to derive them at the gateway and assert publicInputs[18..36] match.

### 3. Domain separator can be empty

`apps/gateway/src/env.ts` allows `ZKMA_GATEWAY_DOMAIN=""`. `keccak256("")` is well-defined and provides no separation. Add a startup-time non-empty check before binding the route.

### 4. Reachable DoS via observable nonce burning

`/challenge` returns a 32-byte plaintext nonce. An on-path observer who sees a `(subname, nonce)` pair can race the legitimate user by POSTing a junk-signed request first - the gateway consumes the nonce before validating the signature, then 401s the legitimate request. Shape: cheap denial-of-service per legitimate request.

Trade-off: consuming the nonce *after* signature validation re-introduces a brief replay window inside the validation call. EIP-712 with a per-user-monotonic counter would close this cleanly; out of scope for v0.1.

### 5. Multi-instance gateway breaks auth

Nonce store is a `Map`. Challenge issued by node A, posted to node B → 401. Production needs a shared store (Redis or similar). Documented inline in `server.ts` and here.

### 6. `JSON.stringify(body)` is non-canonical

Per-request signed challenge mixes in `keccak256(JSON.stringify(body))`. If a non-V8 client serializes keys in a different order, sigs from that client fail with no clear diagnostic. Fix path: hash the raw request bytes pre-parse, or use a canonical JSON serializer.

## Open: testing

### 7. `POST /v1/memories` write path has zero integration tests

The entire write surface (`server.ts`'s second route) ships untested at the integration level. `checkWrite` is unit-tested through the policy package, but the route's nonce flow, signature verification, namespace+tag enforcement, and `infer=false` forwarding to mem0 are not.

### 8. `claims.ts` has no unit test file

The new module's offset constants will silently rot if `circuits/zkma-auth/src/main.nr` reorders parameters. A bare unit test passing fixed `publicInputs[]` arrays would catch any drift.

### 9. `IAT = Math.floor(Date.now() / 1000) - 60` makes proof tests time-dependent

Both `test-real-proof.ts` and `test-http-flow.ts` use a wall-clock-relative iat. A slow machine where `nargo execute` + bb.js prove takes more than `iatMaxAgeSecs - 60` would flake.

### 10. Solidity tests do not assert events fire

`contracts/test/ZkmaResolver.t.sol` has no `vm.expectEmit` calls. The off-chain admin UI and any future indexer rely on `OrgRegistered`, `UserRegistered`, `UserUpdated`, `UserRevoked`, `ProofCommitmentSet`, `PartnersSet`. A regression that drops an event is invisible to the test suite. Also no test for `updateUser` or `revokeUser`.

## Open: docs

### 11. `contracts/README.md` describes a different architecture

Lines 1-19, 26, 43, 89-106 describe a v1 platform-parent-name model (`zkmemoryauthorization.eth` with org subnames `istanbulhospital.zkmemoryauthorization.eth`) that no longer exists. The actual contract enforces a flat `zkmemory-<orgname>.eth` model. References a non-existent `getSepoliaDeployment` async function. Needs a rewrite.

### 12. `apps/gateway/README.md` is a generation behind

Calls bb.js verification a TODO; it is implemented and tested. Layout section omits `src/jwks.ts`, `src/claims.ts`, `src/server.ts`. `MEM0_AGENT_ID`, `ZKMA_EXPECTED_AUD`, `ZKMA_EXPECTED_ISS`, `ZKMA_IAT_MAX_AGE_SECS`, `ZKMA_GATEWAY_DOMAIN` env vars unmentioned even though setting them wrong returns silent 401/403 to every search request.

### 13. ~~Live Sepolia deployment ≠ source code~~ FIXED 2026-05-03

Redeployed at `0x842719526d0265f169a066DE6Dd4451b31141043` (block 10781677). Source and bytecode now match: `zkmemory-` prefix, `zkma:*` text records, `emailHash` field. Smoke test passes.

### 14. `contracts/README.md` and `packages/contracts-types/src/index.ts` disagree on `zkma:org` vs `zkma:version`

The contract serves `zkma:org`; `ZkmaTextKeys` exports `Version: "zkma:version"`; the contract has no `zkma:version` handler. `ZkmaTextKeys.Version` resolves to empty string at runtime.
