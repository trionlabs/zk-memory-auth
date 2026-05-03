/**
 * Policy evaluator for zkma. Stateless. The gateway materializes a
 * Principal from a user's ENS text records and a MemoryMeta from each
 * mem0 row's metadata, then calls evaluate(). No network, no time, no
 * randomness - everything that's runtime-dependent (revocation, expiry)
 * lives at the gateway boundary, not in here.
 */

export const TAG_LEVELS = ["public", "internal", "confidential", "restricted"] as const;
export type Tag = (typeof TAG_LEVELS)[number];

export type Principal = {
  /** Owning org's ENS label, e.g. "zkmemory-istanbulhospital". */
  orgLabel: string;
  /** Role string from `zkma:role`. Free-form; policy doesn't interpret it. */
  role: string;
  /** Namespaces this principal can read, from `zkma:namespaces`. */
  namespaces: readonly string[];
  /** Highest tag this principal can read, from `zkma:max-tag`. */
  maxTag: Tag;
};

export type MemoryMeta = {
  /** The namespace this memory belongs to. */
  namespace: string;
  /** Sensitivity tag of this memory. */
  tag: Tag;
  /** ENS label of the owning org (e.g. "zkmemory-istanbulhospital"). */
  ownerOrgLabel: string;
  /** ENS labels of orgs this memory is shared with. */
  sharedWith: readonly string[];
};

export type Decision =
  | { allow: true }
  | { allow: false; reason: string };

const tagRank: Record<Tag, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export function tagAtMost(t: Tag, max: Tag): boolean {
  return tagRank[t] <= tagRank[max];
}

export function evaluate(principal: Principal, memory: MemoryMeta): Decision {
  if (!tagAtMost(memory.tag, principal.maxTag)) {
    return {
      allow: false,
      reason: `tag ${memory.tag} > principal max-tag ${principal.maxTag}`,
    };
  }

  if (!principal.namespaces.includes(memory.namespace)) {
    return {
      allow: false,
      reason: `namespace ${memory.namespace} not in principal namespaces`,
    };
  }

  const sameOrg = principal.orgLabel === memory.ownerOrgLabel;
  if (sameOrg) return { allow: true };

  if (!memory.sharedWith.includes(principal.orgLabel)) {
    return {
      allow: false,
      reason: `cross-org read but ${principal.orgLabel} not in shared_with`,
    };
  }

  return { allow: true };
}

/**
 * Parses the comma-separated namespaces text record. Empty string -> [].
 */
export function parseNamespaces(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isTag(s: string): s is Tag {
  return (TAG_LEVELS as readonly string[]).includes(s);
}
