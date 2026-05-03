/**
 * Tiny OpenAI-compatible stub for testing mem0 without paying real money.
 *
 * Implements just enough of the OpenAI HTTP surface that mem0 needs:
 *   - POST /v1/embeddings  -> deterministic 1536-dim vectors seeded by input hash
 *   - POST /v1/chat/completions -> fixed empty-facts response (defensive; we
 *     also pass infer=false to mem0 so this should not be hit)
 *
 * mem0 (in-container) is pointed at us via OPENAI_BASE_URL=http://host.docker.internal:9999/v1.
 */

import Fastify from "fastify";

const PORT = Number(process.env.STUB_OPENAI_PORT ?? 9999);
const EMBEDDING_DIMS = 1536; // text-embedding-3-small default

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function deterministicEmbedding(input: string): number[] {
  const seed = fnv1a(input);
  const v: number[] = new Array(EMBEDDING_DIMS);
  let mag = 0;
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    const x = Math.sin(seed * 0.001 + i * 0.123) * 0.5;
    v[i] = x;
    mag += x * x;
  }
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < EMBEDDING_DIMS; i++) v[i]! /= mag;
  return v;
}

export async function startStub(port = PORT) {
  const app = Fastify({ logger: false });

  app.post<{ Body: { input: string | string[]; model?: string } }>(
    "/v1/embeddings",
    async (req) => {
      const body = req.body;
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const data = inputs.map((text, index) => ({
        object: "embedding" as const,
        index,
        embedding: deterministicEmbedding(text ?? ""),
      }));
      return {
        object: "list",
        data,
        model: body.model ?? "text-embedding-3-small",
        usage: { prompt_tokens: 0, total_tokens: 0 },
      };
    },
  );

  app.post("/v1/chat/completions", async () => ({
    id: "stub-completion",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "stub-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: '{"facts": []}',
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }));

  app.get("/healthz", async () => ({ ok: true }));

  await app.listen({ port, host: "0.0.0.0" });
  return app;
}

// Run as a script when invoked directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startStub().then((app) => {
    console.log(`stub-openai listening on http://0.0.0.0:${PORT}`);
    void app;
  });
}
