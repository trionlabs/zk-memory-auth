import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { env } from "./env.js";
import { authenticate } from "./auth.js";
import { searchAndFilter, postMemory, checkWrite } from "./mem0.js";
import type { Tag } from "@zkma/policy";

/**
 * Per-request flow (PRD section 15.3):
 *   1. Client GET /challenge?subname=... -> nonce.
 *   2. Client signs keccak256(nonce || keccak256(body)) with subname's wallet.
 *   3. Client POST with proof + sig + nonce headers.
 *   4. Gateway resolves ENS -> principal, checks revoke/expiry, verifies
 *      proof commitment, verifies wallet sig, forwards to mem0 with policy
 *      filter applied to results (read) or metadata locked (write).
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
  const nonce = req.headers["x-zkma-nonce"] as string | undefined;

  if (!body?.query) return reply.code(400).send({ error: "query required" });
  if (!nonce) return reply.code(401).send({ error: "x-zkma-nonce required" });
  if (!consumeNonce(body.subname, nonce)) {
    return reply.code(401).send({ error: "nonce invalid or expired" });
  }

  const auth = await authenticate(req, body, nonce);
  if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

  const hits = await searchAndFilter(auth.resolved.principal, body.query);
  return { results: hits };
});

type WriteBody = {
  subname: string;
  proof: `0x${string}`;
  publicInputs: `0x${string}`;
  content: string;
  namespace: string;
  tag: Tag;
  sharedWith?: string[];
};

fastify.post<{ Body: WriteBody }>("/v1/memories", async (req, reply) => {
  const body = req.body;
  const nonce = req.headers["x-zkma-nonce"] as string | undefined;

  if (!body?.content || !body?.namespace || !body?.tag) {
    return reply.code(400).send({ error: "content, namespace, tag required" });
  }
  if (!nonce) return reply.code(401).send({ error: "x-zkma-nonce required" });
  if (!consumeNonce(body.subname, nonce)) {
    return reply.code(401).send({ error: "nonce invalid or expired" });
  }

  const auth = await authenticate(req, body, nonce);
  if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

  const writeCheck = checkWrite(auth.resolved.principal, {
    content: body.content,
    namespace: body.namespace,
    tag: body.tag,
    sharedWith: body.sharedWith ?? [],
  });
  if (!writeCheck.allow) {
    return reply.code(403).send({ error: writeCheck.reason });
  }

  // mem0 user_id keys per-user memories. The subname is a stable, cryptographically
  // bound identifier, so use it directly.
  const upstream = await postMemory(writeCheck.meta, body.content, body.subname);
  return upstream;
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
