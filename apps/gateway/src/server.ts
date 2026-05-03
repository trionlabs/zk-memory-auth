import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { keccak256, recoverMessageAddress } from "viem";
import {
  isTag,
  type MemoryMeta,
  type Principal,
  type Tag,
} from "@zkma/policy";
import { resolvePrincipal as realResolvePrincipal, type ResolvedPrincipal } from "./ens.js";
import { searchAndFilter as realSearch, postMemory as realPost, checkWrite } from "./mem0.js";
import { verifyProof as realVerifyProof } from "./proof.js";
import { env } from "./env.js";

/**
 * Injection points for tests. In prod, defaults to the real ENS resolver,
 * the real mem0 HTTP client, and the real bb.js verifier.
 */
export type ServerDeps = {
  resolvePrincipal?: (subname: string) => Promise<ResolvedPrincipal | null>;
  searchAndFilter?: (principal: Principal, query: string) => Promise<unknown[]>;
  postMemory?: (meta: MemoryMeta, content: string, userId: string) => Promise<unknown>;
  verifyProof?: typeof realVerifyProof;
  /** Logger override (defaults to fastify's default logger). Set to false in tests. */
  logger?: boolean;
};

type Hit = { id: string; memory: string; metadata?: Record<string, unknown> | null };

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const resolve = deps.resolvePrincipal ?? realResolvePrincipal;
  const search = deps.searchAndFilter ?? (realSearch as (p: Principal, q: string) => Promise<Hit[]>);
  const write = deps.postMemory ?? realPost;
  const verify = deps.verifyProof ?? realVerifyProof;

  const fastify = Fastify({ logger: deps.logger ?? true });

  type Nonce = { value: string; expiresAt: number };
  const nonceStore = new Map<string, Nonce>();
  const NONCE_TTL_MS = 60_000;
  const SWEEP_INTERVAL_MS = 30_000;

  // In-process Map: single-instance only. Multi-instance gateway needs a
  // shared store (Redis). The sweeper below caps memory in the meantime.
  const sweeper = setInterval(() => {
    const cutoff = Date.now();
    for (const [key, entry] of nonceStore) {
      if (entry.expiresAt <= cutoff) nonceStore.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

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

  /**
   * Runs every gate before forwarding to mem0. Caller must consume the nonce
   * before calling this so a failing gate doesn't burn an unused nonce.
   */
  async function authenticate(args: {
    headers: Record<string, string | undefined>;
    body: { subname?: string; proof?: `0x${string}`; publicInputs?: `0x${string}` };
    consumedNonce: string;
  }): Promise<{ ok: true; resolved: ResolvedPrincipal } | { ok: false; status: number; error: string }> {
    const { body, headers, consumedNonce } = args;
    if (!body?.subname || !body?.proof || !body?.publicInputs) {
      return { ok: false, status: 400, error: "subname, proof, publicInputs required" };
    }
    const sig = headers["x-zkma-sig"];
    if (!sig) return { ok: false, status: 401, error: "x-zkma-sig required" };

    const resolved = await resolve(body.subname);
    if (!resolved) return { ok: false, status: 403, error: "ens unresolved" };
    if (resolved.revoked) return { ok: false, status: 403, error: "revoked" };
    if (resolved.expiry > 0 && resolved.expiry < Math.floor(Date.now() / 1000)) {
      return { ok: false, status: 403, error: "expired" };
    }
    if (!resolved.proofCommitment) {
      return { ok: false, status: 403, error: "no proof commitment on ens" };
    }

    const proofCheck = await verify({
      proof: body.proof,
      publicInputs: body.publicInputs,
      expectedCommitment: resolved.proofCommitment,
      expectedEmailHash: resolved.emailHash,
    });
    if (!proofCheck.ok) return { ok: false, status: 403, error: proofCheck.reason };

    const requestHash = keccak256(new TextEncoder().encode(JSON.stringify(body)));
    // Domain separator: a sig for one deployment cannot be replayed against
    // another that uses a different ZKMA_GATEWAY_DOMAIN value.
    const domainHash = keccak256(new TextEncoder().encode(env.gatewayDomain));
    const challenge = keccak256(
      new Uint8Array([
        ...Buffer.from(domainHash.replace(/^0x/, ""), "hex"),
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

  fastify.get<{ Querystring: { subname?: string } }>(
    "/challenge",
    async (req, reply) => {
      const subname = req.query.subname;
      if (!subname) return reply.code(400).send({ error: "subname required" });
      return { nonce: issueNonce(subname) };
    },
  );

  type SearchBody = {
    query: string;
    subname: string;
    proof: `0x${string}`;
    publicInputs: `0x${string}`;
  };

  fastify.post<{ Body: SearchBody }>(
    "/v1/memories/search",
    async (req, reply) => {
      const body = req.body;
      const nonce = req.headers["x-zkma-nonce"] as string | undefined;

      if (!body?.query) return reply.code(400).send({ error: "query required" });
      if (!nonce) return reply.code(401).send({ error: "x-zkma-nonce required" });
      if (!consumeNonce(body.subname, nonce)) {
        return reply.code(401).send({ error: "nonce invalid or expired" });
      }

      const auth = await authenticate({
        headers: req.headers as Record<string, string | undefined>,
        body,
        consumedNonce: nonce,
      });
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });

      try {
        const hits = await search(auth.resolved.principal, body.query);
        return { results: hits };
      } catch (e) {
        // Sanitize: log full error server-side, return a generic 502 so we
        // never leak upstream tokens, traces, or internal addresses.
        fastify.log.error({ err: e }, "mem0 search failed");
        return reply.code(502).send({ error: "upstream search failed" });
      }
    },
  );

  type WriteBody = {
    subname: string;
    proof: `0x${string}`;
    publicInputs: `0x${string}`;
    content: string;
    namespace: string;
    tag: Tag;
    sharedWith?: string[];
  };

  fastify.post<{ Body: WriteBody }>(
    "/v1/memories",
    async (req, reply) => {
      const body = req.body;
      const nonce = req.headers["x-zkma-nonce"] as string | undefined;

      if (!body?.content || !body?.namespace || !body?.tag) {
        return reply.code(400).send({ error: "content, namespace, tag required" });
      }
      if (!isTag(body.tag)) return reply.code(400).send({ error: `unknown tag ${body.tag}` });
      if (!nonce) return reply.code(401).send({ error: "x-zkma-nonce required" });
      if (!consumeNonce(body.subname, nonce)) {
        return reply.code(401).send({ error: "nonce invalid or expired" });
      }

      const auth = await authenticate({
        headers: req.headers as Record<string, string | undefined>,
        body,
        consumedNonce: nonce,
      });
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

      try {
        const upstream = await write(writeCheck.meta, body.content, body.subname);
        return upstream;
      } catch (e) {
        fastify.log.error({ err: e }, "mem0 write failed");
        return reply.code(502).send({ error: "upstream write failed" });
      }
    },
  );

  fastify.get("/healthz", async () => ({ ok: true }));

  return fastify;
}
