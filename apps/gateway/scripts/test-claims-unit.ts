/**
 * Unit tests for apps/gateway/src/claims.ts. Synthesizes publicInputs[]
 * arrays directly so we can hit branches that real proof generation cannot
 * reach (oversized bounded vec lengths, malformed bytes, BigInt-overflow
 * iat values, etc).
 *
 * Run: cd apps/gateway && pnpm test:claims
 */

import { checkClaims, EXPECTED_PUBLIC_INPUT_COUNT } from "../src/claims.js";

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

function field(n: bigint | number): string {
  const v = typeof n === "bigint" ? n : BigInt(n);
  return "0x" + v.toString(16).padStart(64, "0");
}

function encodeBoundedVec(
  arr: string[],
  storageStart: number,
  capacity: number,
  lengthIndex: number,
  value: string,
  overrideLen?: bigint,
): void {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > capacity) {
    throw new Error(`encodeBoundedVec: ${value.length} > ${capacity}`);
  }
  for (let i = 0; i < capacity; i++) {
    arr[storageStart + i] = field(i < bytes.length ? bytes[i]! : 0);
  }
  arr[lengthIndex] = field(overrideLen ?? BigInt(bytes.length));
}

type Opts = {
  email?: string;
  aud?: string;
  iss?: string;
  iatLower?: bigint;
  iatUpper?: bigint;
  audLenOverride?: bigint;
  issByteAt?: { index: number; value: bigint };
};

function makePublicInputs(opts: Opts = {}): string[] {
  const pi = new Array<string>(EXPECTED_PUBLIC_INPUT_COUNT).fill(field(0));

  // Modulus + redc are unused by checkClaims; leave as zeros.
  encodeBoundedVec(
    pi,
    EMAIL_STORAGE_OFFSET,
    MAX_EMAIL_LENGTH,
    EMAIL_LENGTH_OFFSET,
    opts.email ?? "alice@test.com",
  );
  encodeBoundedVec(
    pi,
    AUD_STORAGE_OFFSET,
    MAX_AUD_LENGTH,
    AUD_LENGTH_OFFSET,
    opts.aud ?? "test-aud",
    opts.audLenOverride,
  );
  encodeBoundedVec(
    pi,
    ISS_STORAGE_OFFSET,
    MAX_ISS_LENGTH,
    ISS_LENGTH_OFFSET,
    opts.iss ?? "https://accounts.google.com",
  );
  if (opts.issByteAt) {
    pi[ISS_STORAGE_OFFSET + opts.issByteAt.index] = field(opts.issByteAt.value);
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  pi[IAT_LOWER_OFFSET] = field(opts.iatLower ?? now - 60n);
  pi[IAT_UPPER_OFFSET] = field(opts.iatUpper ?? now);
  return pi;
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ok    ${label}${detail ? ` - ${detail}` : ""}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
    fail++;
  }
}

async function main(): Promise<void> {
  // Set the env defaults the tests expect.
  process.env.ZKMA_EXPECTED_AUD = "test-aud";
  process.env.ZKMA_EXPECTED_ISS = "https://accounts.google.com";
  delete process.env.ZKMA_IAT_MAX_AGE_SECS;

  console.log("[case] happy path");
  {
    const r = checkClaims(makePublicInputs());
    check("ok=true", r.ok, r.ok ? "" : r.reason);
  }

  console.log("\n[case] short publicInputs array");
  {
    const r = checkClaims([field(0)]);
    check("rejected with length reason", !r.ok && r.reason.includes("expected"));
  }

  console.log("\n[case] ZKMA_EXPECTED_AUD unset -> fail-closed");
  {
    delete process.env.ZKMA_EXPECTED_AUD;
    const r = checkClaims(makePublicInputs());
    check("rejected", !r.ok && r.reason.includes("ZKMA_EXPECTED_AUD"));
    process.env.ZKMA_EXPECTED_AUD = "test-aud";
  }

  console.log("\n[case] aud mismatch");
  {
    const r = checkClaims(makePublicInputs({ aud: "other-aud" }));
    check("rejected", !r.ok && r.reason.startsWith("aud mismatch"));
  }

  console.log("\n[case] iss mismatch");
  {
    const r = checkClaims(makePublicInputs({ iss: "https://login.microsoft.com" }));
    check("rejected", !r.ok && r.reason.startsWith("iss mismatch"));
  }

  console.log("\n[case] iat_lower > iat_upper");
  {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const r = checkClaims(
      makePublicInputs({ iatLower: now, iatUpper: now - 100n }),
    );
    check("rejected", !r.ok && r.reason === "iat_lower > iat_upper");
  }

  console.log("\n[case] iat_lower too old");
  {
    const r = checkClaims(makePublicInputs({ iatLower: 0n, iatUpper: 1n }));
    check("rejected", !r.ok && r.reason.includes("too old"));
  }

  console.log("\n[case] iat_upper too far in the future");
  {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const r = checkClaims(makePublicInputs({ iatLower: now, iatUpper: now + 3600n }));
    check("rejected", !r.ok && r.reason.includes("in the future"));
  }

  console.log("\n[case] iat_upper at +60s skew is allowed (boundary)");
  {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const r = checkClaims(makePublicInputs({ iatLower: now, iatUpper: now + 60n }));
    check("ok=true", r.ok, r.ok ? "" : r.reason);
  }

  console.log("\n[case] bounded vec length above capacity rejected");
  {
    const r = checkClaims(
      makePublicInputs({ audLenOverride: BigInt(MAX_AUD_LENGTH + 1) }),
    );
    check(
      "rejected with decode error",
      !r.ok && r.reason.includes("exceeds capacity"),
    );
  }

  console.log("\n[case] bounded vec byte > 255 rejected");
  {
    const r = checkClaims(
      makePublicInputs({ issByteAt: { index: 0, value: 256n } }),
    );
    check(
      "rejected with decode error",
      !r.ok && r.reason.includes("byte out of range"),
    );
  }

  console.log("\n[case] BigInt iat_upper above Number.MAX_SAFE_INTEGER still rejected as future");
  {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const huge = (1n << 60n) + 1n;
    const r = checkClaims(makePublicInputs({ iatLower: now, iatUpper: huge }));
    check("rejected", !r.ok && r.reason.includes("in the future"));
  }

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  process.exit(fail === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
