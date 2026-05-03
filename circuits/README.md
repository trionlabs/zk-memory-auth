# circuits/

Noir circuits for zk-memory-authorization.

## zkma-auth

Proves the user holds a fresh Google-signed JWT issued to an email the org admin pre-committed to, without revealing the JWT or signature. The output proof (its commitment) is what the user writes into `zkma:proof-commitment` on their ENS subname; the gateway re-verifies it on every memory query.

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
| public | `pubkey_modulus_limbs` | Google JWKS at the time of signing | Anchors the verifier to Google's current RSA key |
| public | `redc_params_limbs` | derived from modulus | Modular reduction parameters |
| public | `expected_email` | onboarding flow | Binds the proof to one specific email; admin commits to this in advance |
| public | `iat_lower` / `iat_upper` | gateway clock | Freshness window so old JWTs are rejected |
| private | `data` | user's signed JWT | The base64 `header.payload` bytes |
| private | `base64_decode_offset` | derived from JWT | Where to start base64 decoding inside `data` |
| private | `signature_limbs` | user's signed JWT | RSA-2048 signature limbs |

The JWT itself never leaves the user's browser. The admin only knows the email hash (because they typed it during onboarding); the gateway only sees the proof, the public inputs, and the ENS-anchored commitment.

### What's missing (TODO before demo)

- Public-input layout decisions: do we expose `iat` itself, or just the window? Bigger window = more privacy, smaller window = stronger replay defense.
- Selective email-domain disclosure (e.g. prove `*@hospital.org`, hide local part). Today we bind to the full email hash. Domain-only would need an in-circuit `@` split + sub-hash.
- A canonical commitment scheme tying `(proof || public_inputs)` to the bytes32 written on ENS - currently the gateway is expected to do this hashing in TS.
- A separate `zkma-roles` circuit if we ever want roles to come from the JWT itself rather than a side-channel admin assertion.
