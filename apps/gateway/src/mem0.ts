import { env } from "./env.js";
import {
  evaluate,
  isTag,
  type MemoryMeta,
  type Principal,
} from "@zkma/policy";

type Mem0SearchHit = {
  id: string;
  memory: string;
  metadata?: Record<string, unknown> | null;
};

type Mem0SearchResponse = {
  results?: Mem0SearchHit[];
};

/**
 * Forwards a search to the upstream mem0 server, then drops every hit whose
 * metadata fails the policy. We filter post-hoc rather than pushing a server
 * filter because mem0's metadata filter syntax is not stable across versions
 * (see PRD spike S3); post-hoc filtering is correct everywhere, just slower.
 */
export async function searchAndFilter(
  principal: Principal,
  query: string,
): Promise<Mem0SearchHit[]> {
  const res = await fetch(`${env.mem0BaseUrl}/v1/memories/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.mem0ApiKey ? { authorization: `Token ${env.mem0ApiKey}` } : {}),
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`mem0 search failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as Mem0SearchResponse;
  const hits = body.results ?? [];
  return hits.filter((h) => {
    const meta = parseMemoryMeta(h.metadata);
    if (!meta) return false; // fail-closed: untagged memory is invisible
    return evaluate(principal, meta).allow;
  });
}

function parseMemoryMeta(raw: Record<string, unknown> | null | undefined): MemoryMeta | null {
  if (!raw) return null;
  const ns = raw["namespace"];
  const tag = raw["tag"];
  const owner = raw["owner_org"];
  const shared = raw["shared_with"];

  if (typeof ns !== "string" || typeof tag !== "string" || typeof owner !== "string") {
    return null;
  }
  if (!isTag(tag)) return null;

  const sharedWith = Array.isArray(shared)
    ? shared.filter((x): x is string => typeof x === "string")
    : [];

  return { namespace: ns, tag, ownerOrgLabel: owner, sharedWith };
}
