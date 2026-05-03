import { env } from "./env.js";
import {
  evaluate,
  isTag,
  tagAtMost,
  type MemoryMeta,
  type Principal,
  type Tag,
} from "@zkma/policy";

type Mem0SearchHit = {
  id: string;
  memory: string;
  metadata?: Record<string, unknown> | null;
};

type Mem0SearchResponse = {
  results?: Mem0SearchHit[];
};

export type WriteRequest = {
  content: string;
  namespace: string;
  tag: Tag;
  /** Optional cross-org sharing list. */
  sharedWith?: readonly string[];
};

export type WriteCheck =
  | { allow: true; meta: MemoryMeta }
  | { allow: false; reason: string };

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
  const res = await fetch(`${env.mem0BaseUrl}/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.mem0ApiKey ? { authorization: `Token ${env.mem0ApiKey}` } : {}),
    },
    // mem0 requires filters with at least one of {user_id, agent_id, run_id}.
    // We use agent_id as the app-level scope (every zkma write tags it) so the
    // gateway can fetch across users; metadata-based policy filtering is what
    // actually decides what this principal sees, including cross-org sharing.
    body: JSON.stringify({ query, filters: { agent_id: env.mem0AgentId } }),
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

/**
 * Decide whether `principal` is allowed to write `req` and, if so, return the
 * canonical MemoryMeta to attach. Write rules:
 *   - tag must be at-or-below principal.maxTag
 *   - namespace must be in principal.namespaces
 *   - ownerOrgLabel is forced to principal.orgLabel (no impersonation)
 *   - sharedWith may contain any orgs the principal chooses to share with
 *
 * Returns a denial reason if any rule fails. Pure - no side effects.
 */
export function checkWrite(principal: Principal, req: WriteRequest): WriteCheck {
  if (!isTag(req.tag)) return { allow: false, reason: `unknown tag ${req.tag}` };
  if (!tagAtMost(req.tag, principal.maxTag)) {
    return {
      allow: false,
      reason: `cannot write tag ${req.tag} above max-tag ${principal.maxTag}`,
    };
  }
  if (!principal.namespaces.includes(req.namespace)) {
    return {
      allow: false,
      reason: `cannot write namespace ${req.namespace} (not in ${principal.namespaces.join(",")})`,
    };
  }
  return {
    allow: true,
    meta: {
      namespace: req.namespace,
      tag: req.tag,
      ownerOrgLabel: principal.orgLabel,
      sharedWith: req.sharedWith ?? [],
    },
  };
}

/**
 * Forwards a write to mem0 with the metadata locked to what `checkWrite` produced.
 * Returns the upstream JSON unchanged so clients see the real mem0 id.
 */
export async function postMemory(
  meta: MemoryMeta,
  content: string,
  userId: string,
): Promise<unknown> {
  const res = await fetch(`${env.mem0BaseUrl}/memories`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.mem0ApiKey ? { authorization: `Token ${env.mem0ApiKey}` } : {}),
    },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      user_id: userId,
      agent_id: env.mem0AgentId,
      metadata: {
        namespace: meta.namespace,
        tag: meta.tag,
        owner_org: meta.ownerOrgLabel,
        shared_with: [...meta.sharedWith],
      },
      // We always store the verbatim content (no LLM extraction) because the
      // metadata is what gates access, and LLM extraction can drop or rephrase
      // facts that the org admin cared about.
      infer: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`mem0 write failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
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
