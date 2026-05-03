import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { recoverMessageAddress, keccak256 } from "viem";
import { env } from "./env.js";
import { resolvePrincipal } from "./ens.js";
import { verifyProof } from "./proof.js";
import { searchAndFilter } from "./mem0.js";

/**
 * Per-request flow (PRD section 15.3):
 *   1. Client GET /challenge?subname=... -> nonce.
 *   2. Client signs keccak256(nonce || keccak256(body)) with subname's wallet.
 *   3. Client POST /v1/memories/search with proof + sig + nonce headers.
 *   4. Gateway resolves ENS -> principal, checks revoke/expiry, verifies
 *      proof commitment, verifies wallet sig, forwards to mem0 with policy
 *      filter applied to results.
 */

type Nonce = { value: string; expiresAt: number };
const nonceStore = new Map<string, Nonce>();
const NONCE_TTL_MS = 60_000;

function issueNonce(subname: string): string {
  const value = "0x" + randomBytes(32).toString("hex");
  nonceStore.set(`${subname}:${value}`, {
    value,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return value;
}

function consumeNonce(subname: string, nonce: string): boolean {
  const key = `${subname}:${nonce}`;
  const entry = nonceStore.get(key);
  if (!entry) return false;
  nonceStore.delete(key);
  return entry.expiresAt > Date.now();
}

const fastify = Fastify({ logger: true });

fastify.get<{ Querystring: { subname?: string } }>("/challenge", async (req, reply) => {
  const subname = req.query.subname;
  if (!subname) return reply.code(400).send({ error: "subname required" });
  return { nonce: issueNonce(subname) };
});

type SearchBody = {
  query: string;
  subname: string;
  proof: `0x${string}`;
  publicInputs: `0x${string}`;
};

fastify.post<{ Body: SearchBody }>("/v1/memories/search", async (req, reply) => {
  const body = req.body;
  const sig = req.headers["x-zkma-sig"] as string | undefined;
  const nonce = req.headers["x-zkma-nonce"] as string | undefined;

  if (!body?.subname || !body?.proof || !body?.publicInputs || !body?.query) {
    return reply.code(400).send({ error: "subname, proof, publicInputs, query required" });
  }
  if (!sig || !nonce) {
    return reply.code(401).send({ error: "x-zkma-sig and x-zkma-nonce required" });
  }
  if (!consumeNonce(body.subname, nonce)) {
    return reply.code(401).send({ error: "nonce invalid or expired" });
  }

  const resolved = await resolvePrincipal(body.subname);
  if (!resolved) return reply.code(403).send({ error: "ens unresolved" });
  if (resolved.revoked) return reply.code(403).send({ error: "revoked" });
  if (resolved.expiry > 0 && resolved.expiry < Math.floor(Date.now() / 1000)) {
    return reply.code(403).send({ error: "expired" });
  }
  if (!resolved.proofCommitment) {
    return reply.code(403).send({ error: "no proof commitment on ens" });
  }

  const proofCheck = await verifyProof({
    proof: body.proof,
    publicInputs: body.publicInputs,
    expectedCommitment: resolved.proofCommitment,
  });
  if (!proofCheck.ok) return reply.code(403).send({ error: proofCheck.reason });

  const requestHash = keccak256(
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const challenge = keccak256(
    new Uint8Array([
      ...Buffer.from(nonce.replace(/^0x/, ""), "hex"),
      ...Buffer.from(requestHash.replace(/^0x/, ""), "hex"),
    ]),
  );
  const recovered = await recoverMessageAddress({
    message: { raw: challenge },
    signature: sig as `0x${string}`,
  });
  if (recovered.toLowerCase() !== resolved.walletAddress.toLowerCase()) {
    return reply.code(401).send({ error: "wallet signature mismatch" });
  }

  const hits = await searchAndFilter(resolved.principal, body.query);
  return { results: hits };
});

fastify.get("/healthz", async () => ({ ok: true }));

fastify.listen({ port: env.port, host: "0.0.0.0" }, (err, addr) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`zkma gateway listening on ${addr}`);
  if (env.skipProofVerify) {
    fastify.log.warn("ZKMA_SKIP_PROOF_VERIFY=1 - proofs are not being verified");
  }
});

