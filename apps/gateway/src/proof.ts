import { keccak256, toBytes } from "viem";
import { readFileSync } from "node:fs";
import { UltraHonkBackend } from "@aztec/bb.js";
import { env } from "./env.js";
import {
  getAllowedModuliLimbs,
  modulusFromPublicInputs,
  moduliMatch,
} from "./jwks.js";
import { checkClaims } from "./claims.js";

/**
 * Lazy-init the bb.js backend on first verify. CRS download + backend init takes
 * a few seconds, and we'd rather pay that cost when the first request lands than
 * at startup (so /healthz comes up immediately).
 */
let backendPromise: Promise<UltraHonkBackend> | null = null;

async function getBackend(): Promise<UltraHonkBackend> {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    const artifact = JSON.parse(
      readFileSync(env.circuitArtifactPath, "utf8"),
    ) as { bytecode: string };
    if (typeof artifact.bytecode !== "string") {
      throw new Error(
        `circuit artifact at ${env.circuitArtifactPath} missing bytecode field`,
      );
    }
    return new UltraHonkBackend(artifact.bytecode);
  })();
  return backendPromise;
}

/**
 * Public inputs come over the wire as a single hex blob (32-byte chunks
 * concatenated). bb.js wants a string[] of 0x-prefixed field values.
 */
function hexToFieldStrings(hex: `0x${string}`): string[] {
  const buf = Buffer.from(hex.replace(/^0x/, ""), "hex");
  if (buf.length % 32 !== 0) {
    throw new Error(`publicInputs length ${buf.length} not a multiple of 32`);
  }
  const out: string[] = [];
  for (let i = 0; i < buf.length; i += 32) {
    out.push("0x" + buf.subarray(i, i + 32).toString("hex"));
  }
  return out;
}

/**
 * Verify a Noir UltraHonk proof against the user's ENS-anchored commitment.
 *
 * Two layers:
 *   1. (cheap) keccak256(proof || publicInputs) must equal the commitment
 *      written to `zkma:proof-commitment` on the user's ENS subname. This
 *      catches a wholesale proof swap before we pay for the backend call.
 *   2. (real) bb.js UltraHonkBackend.verifyProof against the circuit's
 *      verification key (derived from the compiled bytecode).
 *
 * In skip mode (ZKMA_SKIP_PROOF_VERIFY=1) only layer 1 runs. Logged at startup.
 */
export async function verifyProof(args: {
  proof: `0x${string}`;
  publicInputs: `0x${string}`;
  expectedCommitment: `0x${string}`;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!args.proof || args.proof === "0x") {
    return { ok: false, reason: "proof empty" };
  }

  const candidate = keccak256(
    new Uint8Array([...toBytes(args.proof), ...toBytes(args.publicInputs)]),
  );
  if (candidate !== args.expectedCommitment) {
    return { ok: false, reason: "proof commitment mismatch" };
  }

  let publicInputFields: string[];
  try {
    publicInputFields = hexToFieldStrings(args.publicInputs);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  // JWKS pin: the proof's pubkey_modulus_limbs (publicInputs[0..18]) must
  // match a modulus Google currently publishes (or one allowlisted via
  // ZKMA_EXTRA_MODULI for tests). Without this check, anyone could prove a
  // JWT signed with their own RSA key. Runs ALWAYS, including in skip mode,
  // because skipping bb.js is cheap-iteration; skipping JWKS would let
  // anyone past the gate.
  try {
    const proofModulus = modulusFromPublicInputs(publicInputFields);
    const allowed = await getAllowedModuliLimbs();
    if (!allowed.some((m) => moduliMatch(m, proofModulus))) {
      return { ok: false, reason: "modulus not in JWKS allowlist" };
    }
  } catch (e) {
    return { ok: false, reason: `jwks check failed: ${(e as Error).message}` };
  }

  // Claim pinning: stop the user from picking arbitrary aud/iss/iat values.
  // Same rationale as JWKS: never skipped.
  let claims;
  try {
    claims = checkClaims(publicInputFields);
  } catch (e) {
    return { ok: false, reason: `claims check failed: ${(e as Error).message}` };
  }
  if (!claims.ok) return { ok: false, reason: claims.reason };

  // Skip the bb.js cryptographic call only when explicitly requested. The
  // start-up warning in index.ts logs this state. JWKS + claim pins above
  // still ran, so skip mode is no longer a full bypass.
  if (env.skipProofVerify) return { ok: true };

  const backend = await getBackend();
  const valid = await backend.verifyProof({
    proof: toBytes(args.proof),
    publicInputs: publicInputFields,
  });
  if (!valid) return { ok: false, reason: "proof failed bb.js verification" };
  return { ok: true };
}
