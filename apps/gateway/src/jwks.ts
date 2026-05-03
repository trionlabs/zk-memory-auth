/**
 * JWKS pinning - the gateway-side check that ties a Noir proof to Google.
 *
 * The circuit can verify any JWT signed by any RSA-2048 key whose modulus is
 * passed in as a public input. That alone proves nothing about *who* signed
 * the JWT - the user could have signed it themselves. This module fetches
 * Google's published JWKS and exposes a function that the proof verifier
 * uses to assert the modulus in publicInputs is one Google currently
 * publishes.
 *
 * Env (read each call so tests can override):
 *   ZKMA_GOOGLE_JWKS_URL  default: https://www.googleapis.com/oauth2/v3/certs
 *   ZKMA_SKIP_JWKS=1      skip the live fetch entirely (combine with ZKMA_EXTRA_MODULI for tests)
 *   ZKMA_EXTRA_MODULI     comma-separated hex moduli to allow in addition to JWKS
 */

const LIMB_BITS = 120n;
export const LIMB_COUNT = 18;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Google rotates every few weeks; 24h is plenty.

function envSnapshot() {
  return {
    googleJwksUrl:
      process.env.ZKMA_GOOGLE_JWKS_URL ??
      "https://www.googleapis.com/oauth2/v3/certs",
    skipJwks: process.env.ZKMA_SKIP_JWKS === "1",
    extraModuliHex: process.env.ZKMA_EXTRA_MODULI ?? "",
  };
}

function modulusToLimbs(n: bigint): bigint[] {
  const mask = (1n << LIMB_BITS) - 1n;
  const limbs: bigint[] = [];
  let cur = n;
  for (let i = 0; i < LIMB_COUNT; i++) {
    limbs.push(cur & mask);
    cur >>= LIMB_BITS;
  }
  return limbs;
}

function base64UrlToBigInt(s: string): bigint {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  const buf = Buffer.from(b64 + "=".repeat(pad), "base64");
  let n = 0n;
  for (const byte of buf) n = (n << 8n) | BigInt(byte);
  return n;
}

function hexToBigInt(s: string): bigint {
  const t = s.startsWith("0x") ? s : "0x" + s;
  return BigInt(t);
}

type CacheEntry = { limbs: bigint[][]; expiresAt: number };
let cache: CacheEntry | null = null;
let cachedSnapshot = "";

/**
 * Returns the list of allowed RSA moduli, each as 18 little-endian 120-bit limbs.
 * Order matches the circuit's pubkey_modulus_limbs public input.
 *
 * Result is cached for CACHE_TTL_MS, but invalidates if env changes (so tests
 * that flip ZKMA_SKIP_JWKS / ZKMA_EXTRA_MODULI between cases see fresh state).
 */
export async function getAllowedModuliLimbs(): Promise<bigint[][]> {
  const snap = envSnapshot();
  const snapKey = JSON.stringify(snap);
  if (cache && cachedSnapshot === snapKey && Date.now() < cache.expiresAt) {
    return cache.limbs;
  }

  const out: bigint[][] = [];

  for (const hex of snap.extraModuliHex
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    out.push(modulusToLimbs(hexToBigInt(hex)));
  }

  if (!snap.skipJwks) {
    const res = await fetch(snap.googleJwksUrl);
    if (!res.ok) {
      throw new Error(`google JWKS fetch failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { keys?: Array<{ n: string; kty: string }> };
    for (const key of body.keys ?? []) {
      if (key.kty !== "RSA" || typeof key.n !== "string") continue;
      out.push(modulusToLimbs(base64UrlToBigInt(key.n)));
    }
  }

  cache = { limbs: out, expiresAt: Date.now() + CACHE_TTL_MS };
  cachedSnapshot = snapKey;
  return out;
}

/**
 * Pulls the 18-limb modulus out of the proof's public-inputs array. Order
 * is fixed by `circuits/zkma-auth/src/main.nr`: pubkey_modulus_limbs is the
 * first public parameter so it occupies positions 0..17.
 */
export function modulusFromPublicInputs(publicInputs: string[]): bigint[] {
  const limbs = publicInputs.slice(0, LIMB_COUNT).map((hex) => hexToBigInt(hex));
  if (limbs.length !== LIMB_COUNT) {
    throw new Error(
      `expected ${LIMB_COUNT} modulus limbs in publicInputs, got ${limbs.length}`,
    );
  }
  return limbs;
}

export function moduliMatch(a: bigint[], b: bigint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Test-only - reset the in-memory cache (used by negative tests). */
export function _resetCache(): void {
  cache = null;
  cachedSnapshot = "";
}
