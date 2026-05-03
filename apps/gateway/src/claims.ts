/**
 * Decoders + pin checks for the BoundedVec / numeric public inputs the
 * circuit emits. These exist because the user-side prover supplies these
 * values; the gateway must constrain them to its own configured values
 * (or to its clock) - otherwise the user can prove anything they want.
 *
 * Public-input layout matches `circuits/zkma-auth/src/main.nr` parameter
 * order. If you reorder parameters there, update the offsets here.
 */

import { env } from "./env.js";

// Layout: see circuits/zkma-auth/src/main.nr.
const MODULUS_LIMBS = 18;
const REDC_LIMBS = 18;
const MAX_EMAIL_LENGTH = 100;
const MAX_AUD_LENGTH = 128;
const MAX_ISS_LENGTH = 64;

const MODULUS_OFFSET = 0;
const REDC_OFFSET = MODULUS_OFFSET + MODULUS_LIMBS;
const EMAIL_STORAGE_OFFSET = REDC_OFFSET + REDC_LIMBS;
const EMAIL_LENGTH_OFFSET = EMAIL_STORAGE_OFFSET + MAX_EMAIL_LENGTH;
const AUD_STORAGE_OFFSET = EMAIL_LENGTH_OFFSET + 1;
const AUD_LENGTH_OFFSET = AUD_STORAGE_OFFSET + MAX_AUD_LENGTH;
const ISS_STORAGE_OFFSET = AUD_LENGTH_OFFSET + 1;
const ISS_LENGTH_OFFSET = ISS_STORAGE_OFFSET + MAX_ISS_LENGTH;
const IAT_LOWER_OFFSET = ISS_LENGTH_OFFSET + 1;
const IAT_UPPER_OFFSET = IAT_LOWER_OFFSET + 1;

export const EXPECTED_PUBLIC_INPUT_COUNT = IAT_UPPER_OFFSET + 1;

function fieldToBigInt(hex: string | undefined): bigint {
  if (typeof hex !== "string") {
    throw new Error("missing public input field");
  }
  return BigInt(hex);
}

function decodeBoundedVec(
  publicInputs: string[],
  storageStart: number,
  storageLen: number,
  lengthIndex: number,
): string {
  const lenBig = fieldToBigInt(publicInputs[lengthIndex]);
  if (lenBig < 0n || lenBig > BigInt(storageLen)) {
    throw new Error(`bounded vec length ${lenBig} exceeds capacity ${storageLen}`);
  }
  const len = Number(lenBig);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const vBig = fieldToBigInt(publicInputs[storageStart + i]);
    if (vBig < 0n || vBig > 255n) {
      throw new Error(`byte out of range at ${storageStart + i}`);
    }
    bytes[i] = Number(vBig);
  }
  return new TextDecoder().decode(bytes);
}

export type ClaimsCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Constrains every user-controlled public input to the gateway's expectations.
 *
 *   - `expected_aud` must equal the platform's OAuth client_id (env)
 *   - `expected_iss` must equal Google's id-token issuer (env)
 *   - `iat_lower` cannot be older than `now - iatMaxAgeSecs`
 *   - `iat_upper` cannot be in the future
 *   - `iat_lower <= iat_upper`
 *
 * Without these checks, a user could mint a proof with arbitrary aud / iss /
 * iat window and replay any JWT they ever held against zkma.
 */
export function checkClaims(publicInputs: string[]): ClaimsCheckResult {
  if (publicInputs.length < EXPECTED_PUBLIC_INPUT_COUNT) {
    return {
      ok: false,
      reason: `expected ${EXPECTED_PUBLIC_INPUT_COUNT} public inputs, got ${publicInputs.length}`,
    };
  }

  if (!env.expectedAud) {
    return {
      ok: false,
      reason: "ZKMA_EXPECTED_AUD env not set; refusing to accept any proof",
    };
  }

  let aud: string;
  let iss: string;
  try {
    aud = decodeBoundedVec(
      publicInputs,
      AUD_STORAGE_OFFSET,
      MAX_AUD_LENGTH,
      AUD_LENGTH_OFFSET,
    );
    iss = decodeBoundedVec(
      publicInputs,
      ISS_STORAGE_OFFSET,
      MAX_ISS_LENGTH,
      ISS_LENGTH_OFFSET,
    );
  } catch (e) {
    return { ok: false, reason: `claim decode failed: ${(e as Error).message}` };
  }

  if (aud !== env.expectedAud) {
    return { ok: false, reason: `aud mismatch: ${aud}` };
  }
  if (iss !== env.expectedIss) {
    return { ok: false, reason: `iss mismatch: ${iss}` };
  }

  const iatLower = fieldToBigInt(publicInputs[IAT_LOWER_OFFSET]);
  const iatUpper = fieldToBigInt(publicInputs[IAT_UPPER_OFFSET]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (iatLower > iatUpper) {
    return { ok: false, reason: "iat_lower > iat_upper" };
  }
  const earliest = now - BigInt(env.iatMaxAgeSecs);
  if (iatLower < earliest) {
    return { ok: false, reason: `iat_lower ${iatLower} too old` };
  }
  // Allow a small future skew (60s) for clock drift between client and gateway.
  if (iatUpper > now + 60n) {
    return { ok: false, reason: `iat_upper ${iatUpper} in the future` };
  }
  return { ok: true };
}
