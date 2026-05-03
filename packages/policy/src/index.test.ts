import { describe, expect, test } from "vitest";
import {
  evaluate,
  isTag,
  parseNamespaces,
  tagAtMost,
  type MemoryMeta,
  type Principal,
} from "./index.js";

const nurse: Principal = {
  orgLabel: "zkmemory-istanbulhospital",
  role: "nurse",
  namespaces: ["clinical", "operational"],
  maxTag: "confidential",
};

const memory = (over: Partial<MemoryMeta> = {}): MemoryMeta => ({
  namespace: "clinical",
  tag: "confidential",
  ownerOrgLabel: "zkmemory-istanbulhospital",
  sharedWith: [],
  ...over,
});

describe("tagAtMost", () => {
  test("allows lower tags", () => {
    expect(tagAtMost("public", "confidential")).toBe(true);
    expect(tagAtMost("internal", "confidential")).toBe(true);
    expect(tagAtMost("confidential", "confidential")).toBe(true);
  });
  test("denies higher tags", () => {
    expect(tagAtMost("restricted", "confidential")).toBe(false);
    expect(tagAtMost("restricted", "internal")).toBe(false);
  });
});

describe("evaluate - same-org reads", () => {
  test("allows when namespace matches and tag is at-or-below max", () => {
    expect(evaluate(nurse, memory()).allow).toBe(true);
  });

  test("denies when tag exceeds principal max-tag", () => {
    const r = evaluate(nurse, memory({ tag: "restricted" }));
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toContain("max-tag");
  });

  test("denies when namespace not in principal's set", () => {
    const r = evaluate(nurse, memory({ namespace: "billing" }));
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toContain("namespace");
  });
});

describe("evaluate - cross-org reads", () => {
  const insurer: Principal = {
    orgLabel: "zkmemory-acmeinsurance",
    role: "claims-agent",
    namespaces: ["billing"],
    maxTag: "confidential",
  };

  test("allows when memory shared_with the principal's org", () => {
    const r = evaluate(
      insurer,
      memory({ namespace: "billing", sharedWith: ["zkmemory-acmeinsurance"] }),
    );
    expect(r.allow).toBe(true);
  });

  test("denies when memory not shared_with the principal's org", () => {
    const r = evaluate(insurer, memory({ namespace: "billing", sharedWith: [] }));
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toContain("shared_with");
  });

  test("denies even with shared_with when tag exceeds max", () => {
    const r = evaluate(
      insurer,
      memory({
        namespace: "billing",
        tag: "restricted",
        sharedWith: ["zkmemory-acmeinsurance"],
      }),
    );
    expect(r.allow).toBe(false);
  });
});

describe("parseNamespaces", () => {
  test("splits and trims", () => {
    expect(parseNamespaces("clinical, operational")).toEqual([
      "clinical",
      "operational",
    ]);
  });
  test("drops empties", () => {
    expect(parseNamespaces(",clinical,,")).toEqual(["clinical"]);
  });
  test("empty string yields empty array", () => {
    expect(parseNamespaces("")).toEqual([]);
  });
});

describe("isTag", () => {
  test("accepts canonical tags only", () => {
    expect(isTag("public")).toBe(true);
    expect(isTag("restricted")).toBe(true);
    expect(isTag("Restricted")).toBe(false);
    expect(isTag("secret")).toBe(false);
  });
});
