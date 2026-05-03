import { keccak256, recoverMessageAddress } from "viem";
import type { FastifyRequest } from "fastify";
import { resolvePrincipal, type ResolvedPrincipal } from "./ens.js";
import { verifyProof } from "./proof.js";

export type AuthOk = { ok: true; resolved: ResolvedPrincipal };
export type AuthFail = { ok: false; status: number; error: string };

type AuthBody = {
  subname?: string;
  proof?: `0x${string}`;
  publicInputs?: `0x${string}`;
};

/**
 * Runs every gate before forwarding to mem0:
 *   1. Body shape (subname, proof, publicInputs).
 *   2. Nonce is single-use and unexpired (consumed by caller).
 *   3. ENS resolves to a principal.
 *   4. Principal is not revoked and not expired.
 *   5. Submitted proof matches the on-ENS commitment.
 *   6. Wallet sig recovers to the subname's `addr` over keccak256(nonce || keccak256(body)).
 *
 * Caller is responsible for consuming the nonce (so a failure here doesn't burn it).
 */
export async function authenticate(
  req: FastifyRequest,
  body: AuthBody,
  consumedNonce: string,
): Promise<AuthOk | AuthFail> {
  if (!body?.subname || !body?.proof || !body?.publicInputs) {
    return { ok: false, status: 400, error: "subname, proof, publicInputs required" };
  }

  const sig = req.headers["x-zkma-sig"] as string | undefined;
  if (!sig) return { ok: false, status: 401, error: "x-zkma-sig required" };

  const resolved = await resolvePrincipal(body.subname);
  if (!resolved) return { ok: false, status: 403, error: "ens unresolved" };
  if (resolved.revoked) return { ok: false, status: 403, error: "revoked" };
  if (resolved.expiry > 0 && resolved.expiry < Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 403, error: "expired" };
  }
  if (!resolved.proofCommitment) {
    return { ok: false, status: 403, error: "no proof commitment on ens" };
  }

  const proofCheck = await verifyProof({
    proof: body.proof,
    publicInputs: body.publicInputs,
    expectedCommitment: resolved.proofCommitment,
  });
  if (!proofCheck.ok) {
    return { ok: false, status: 403, error: proofCheck.reason };
  }

  const requestHash = keccak256(new TextEncoder().encode(JSON.stringify(body)));
  const challenge = keccak256(
    new Uint8Array([
      ...Buffer.from(consumedNonce.replace(/^0x/, ""), "hex"),
      ...Buffer.from(requestHash.replace(/^0x/, ""), "hex"),
    ]),
  );
  const recovered = await recoverMessageAddress({
    message: { raw: challenge },
    signature: sig as `0x${string}`,
  });
  if (recovered.toLowerCase() !== resolved.walletAddress.toLowerCase()) {
    return { ok: false, status: 401, error: "wallet signature mismatch" };
  }

  return { ok: true, resolved };
}
