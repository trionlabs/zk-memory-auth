//! zkma-auth: prove a user holds a fresh Google-signed JWT for a known email.
//!
//! What this proof attests to (when the gateway also pins the modulus to
//! Google's published JWKS):
//!
//!   1. The JWT was signed by the RSA key whose modulus appears in the
//!      pubkey_modulus_limbs public input. The gateway verifies that this
//!      modulus is one Google currently publishes - that ties the proof to
//!      Google specifically.
//!   2. The JWT's `email` claim equals expected_email. The org admin set
//!      this email at user-onboarding time.
//!   3. The JWT's `email_verified` claim is true (Google has confirmed
//!      ownership of the inbox).
//!   4. The JWT's `aud` claim equals expected_aud. This stops a JWT issued
//!      for a different OAuth client from being replayed against zkma.
//!   5. The JWT's `iat` claim is within [iat_lower, iat_upper] - freshness.
//!
//! What is *not* proved here and must be enforced elsewhere:
//!   - That pubkey_modulus_limbs is actually a Google JWKS modulus
//!     (gateway-side check via Google's JWKS endpoint).
//!   - That the user owns the wallet bound to their ENS subname
//!     (gateway checks a per-request ECDSA signature).

use jwt::JWT;

global MAX_PARTIAL_DATA_LENGTH: u32 = 1024;
global MAX_EMAIL_LENGTH: u32 = 100;
global MAX_AUD_LENGTH: u32 = 128;

fn main(
    data: BoundedVec<u8, MAX_PARTIAL_DATA_LENGTH>,
    base64_decode_offset: u32,
    signature_limbs: [u128; 18],
    pubkey_modulus_limbs: pub [u128; 18],
    redc_params_limbs: pub [u128; 18],
    expected_email: pub BoundedVec<u8, MAX_EMAIL_LENGTH>,
    expected_aud: pub BoundedVec<u8, MAX_AUD_LENGTH>,
    iat_lower: pub u64,
    iat_upper: pub u64,
) {
    let jwt = JWT::init(
        data,
        base64_decode_offset,
        pubkey_modulus_limbs,
        redc_params_limbs,
        signature_limbs,
    );

    jwt.verify();

    jwt.assert_claim_string("email".as_bytes(), expected_email);
    jwt.assert_claim_bool("email_verified".as_bytes(), true);
    jwt.assert_claim_string("aud".as_bytes(), expected_aud);

    let iat: u64 = jwt.get_claim_number("iat".as_bytes());
    assert(iat >= iat_lower);
    assert(iat <= iat_upper);
}
