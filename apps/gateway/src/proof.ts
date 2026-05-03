import { keccak256, toBytes } from "viem";
import { env } from "./env.js";

/**
 * Verify a Noir proof against the user's ENS-anchored commitment.
 *
 * v0.1: stub. Hashes (proof || publicInputs) and asserts it matches the
 * 32-byte commitment from `zkma:proof-commitment`. The actual Noir verifier
 * call (Barretenberg WASM via @aztec/bb.js) lands once the circuit's
 * verification key is exported - tracked in circuits/zkma-auth/README.md.
 *
 * In skip mode (ZKMA_SKIP_PROOF_VERIFY=1), accepts any non-empty proof.
 * Demo only - flagged in logs every request so we never miss it on prod.
 */
export async function verifyProof(args: {
  proof: `0x${string}`;
  publicInputs: `0x${string}`;
  expectedCommitment: `0x${string}`;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (env.skipProofVerify) {
    if (!args.proof || args.proof === "0x") {
      return { ok: false, reason: "skip mode but proof empty" };
    }
    return { ok: true };
  }

  const candidate = keccak256(
    new Uint8Array([...toBytes(args.proof), ...toBytes(args.publicInputs)]),
  );
  if (candidate !== args.expectedCommitment) {
    return { ok: false, reason: "proof commitment mismatch" };
  }

  // TODO: call bb.js verify(vk, proof, publicInputs) and gate on its result.
  return { ok: true };
}
