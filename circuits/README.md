# circuits/

Noir circuits for zk-memory-authorization.

## zkma-auth

Proves the user holds a fresh, audience-pinned, email-verified Google-signed JWT issued to an email the org admin pre-committed to. The output proof's commitment is what the user writes into `zkma:proof-commitment` on their ENS subname; the gateway re-verifies it on every memory query.

### What a valid proof attests to

When the gateway also pins the modulus to Google's published JWKS (it does, by default - see `apps/gateway/src/jwks.ts`):

1. The JWT was signed by an RSA key Google currently publishes.
2. The JWT's `email` claim equals the public input `expected_email` (the email the org admin set at onboarding).
3. The JWT's `email_verified` claim is `true` (Google has confirmed inbox ownership).
4. The JWT's `aud` claim equals the public input `expected_aud` (your OAuth client_id).
5. The JWT's `iat` is within `[iat_lower, iat_upper]` - bounded freshness.

### Build

Requires `nargo 1.0.0-beta.15` exactly. Newer nargo (>= beta.16) removed `std::wrapping_add`, which `sha512 v0.1.0` (transitively pulled by noir-jwt v0.5.1 -> noir_rsa v0.9.1) still calls. Until noir-jwt bumps to noir_rsa v0.10.0 + sha512 v0.1.1, we stay on beta.15.

```bash
noirup -v 1.0.0-beta.15
cd circuits/zkma-auth
nargo check
nargo compile        # emits target/zkma_auth.json (~1.4 MB)
```

`nargo compile` prints brillig-soundness advisories from noir-jwt's upstream deps (sha256, noir-bignum). They are warnings, not errors - exit 0, artifact written. Track upstream noir-jwt for the fix.

### Public vs private inputs

| Visibility | Field | Source | Purpose |
|---|---|---|---|
| public | `pubkey_modulus_limbs` | Google JWKS at the time of signing | RSA modulus the JWT was signed with; gateway pins this to Google |
| public | `redc_params_limbs` | derived from modulus | Modular reduction parameters for the bignum lib |
| public | `expected_email` | onboarding flow | Binds the proof to one specific email |
| public | `expected_aud` | onboarding flow | Pins the JWT to a specific OAuth client_id (anti-replay across apps) |
| public | `iat_lower` / `iat_upper` | gateway clock | Freshness window |
| private | `data` | user's signed JWT | base64 `header.payload` bytes |
| private | `base64_decode_offset` | derived from JWT | base64 decode start within `data` |
| private | `signature_limbs` | user's signed JWT | RSA-2048 signature limbs |

The JWT itself never leaves the user's browser. The admin only knows the email (because they typed it during onboarding); the gateway only sees the proof and its public inputs.

### Public input layout (matters for the gateway's JWKS check)

Order in main.nr's signature determines the order of fields in `proofData.publicInputs`:

| Indices | Field | Notes |
|---|---|---|
| 0..17 | `pubkey_modulus_limbs[18]` | gateway compares each limb against Google JWKS |
| 18..35 | `redc_params_limbs[18]` | informational |
| 36..136 | `expected_email` | 100 bytes storage + length |
| 137..266 | `expected_aud` | 128 bytes storage + length |
| 267 | `iat_lower` | u64 |
| 268 | `iat_upper` | u64 |

If you reorder parameters in `main.nr`, update `LIMB_COUNT` / `modulusFromPublicInputs` in `apps/gateway/src/jwks.ts`.

### Defenses outside the circuit

The circuit does **not** prove:

- That the modulus is Google's. The gateway must check this against `https://www.googleapis.com/oauth2/v3/certs`. See `apps/gateway/src/jwks.ts`.
- That the user owns the wallet bound to their ENS subname. The gateway checks a per-request ECDSA signature against the subname's `addr` resolver record.
- That the proof commitment matches what the user wrote on ENS. The gateway checks `keccak256(proof || publicInputs)` against `zkma:proof-commitment`.

### Known limitations / future work

- **Email is in the public inputs as plaintext bytes.** v0.2 should switch to a Poseidon hash so observers see only `expected_email_hash`.
- **No selective-disclosure mode.** "I have any `*@hospital.org` Google account" requires in-circuit `@`-splitting; deferred.
- **Brillig soundness warnings** from noir-jwt's transitive deps (sha256, noir-bignum, noir_string_search). Upstream concern, not introduced by zkma.
