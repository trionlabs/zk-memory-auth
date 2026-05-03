//! zkma-auth: prove a user holds a fresh Google-signed JWT for a known email.
//!
//! Public inputs bind the proof to (a) Google's current RSA key, (b) the
//! email the org admin pre-committed to during onboarding, and (c) a
//! freshness window on the JWT's iat claim. The gateway hashes the proof
//! together with the public inputs, then checks the hash matches the
//! `zkma:proof-commitment` text record on the user's ENS subname.

use jwt::JWT;

global MAX_PARTIAL_DATA_LENGTH: u32 = 1024;
global MAX_EMAIL_LENGTH: u32 = 100;

fn main(
    data: BoundedVec<u8, MAX_PARTIAL_DATA_LENGTH>,
    base64_decode_offset: u32,
    signature_limbs: [u128; 18],
    pubkey_modulus_limbs: pub [u128; 18],
    redc_params_limbs: pub [u128; 18],
    expected_email: pub BoundedVec<u8, MAX_EMAIL_LENGTH>,
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

    let iat: u64 = jwt.get_claim_number("iat".as_bytes());
    assert(iat >= iat_lower);
    assert(iat <= iat_upper);
}
