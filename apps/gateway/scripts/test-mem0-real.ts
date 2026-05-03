/**
 * Integration test against REAL mem0 (docker compose).
 *
 * Setup needed before running:
 *   1. docker daemon running
 *   2. mem0 docker compose up: cd services/mem0/server && docker compose up -d
 *   3. mem0 .env has OPENAI_BASE_URL=http://host.docker.internal:9999/v1
 *   4. stub-openai running on :9999 (this script starts it if needed)
 *
 * Run: cd apps/gateway && pnpm test:mem0
 *
 * What this proves end-to-end:
 *   - Gateway forwards search to real mem0 over HTTP
 *   - mem0 returns hits with metadata intact
 *   - @zkma/policy filters them correctly per principal
 *   - Different principals see different slices of the SAME memory store
 */

import { setTimeout as sleep } from "node:timers/promises";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildServer } from "../src/server.js";
import type { ResolvedPrincipal } from "../src/ens.js";
import type { Principal, Tag } from "@zkma/policy";
import { startStub } from "./stub-openai.js";

const MEM0 = process.env.MEM0_BASE_URL ?? "http://localhost:8888";
const HOSPITAL = "zkmemory-istanbulhospital";
const INSURER = "zkmemory-acmeinsurance";

const TEST_WALLET_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const wallet = privateKeyToAccount(TEST_WALLET_PK);

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ok    ${label}${detail ? ` - ${detail}` : ""}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
    fail++;
  }
}

type SeedRow = {
  user: string;
  content: string;
  namespace: string;
  tag: Tag;
  ownerOrg: string;
  sharedWith: string[];
};

const seeds: SeedRow[] = [
  // hospital, clinical/confidential
  { user: `aysel.${HOSPITAL}.eth`, content: "patient 304 amox 500mg tid 7d",
    namespace: "clinical", tag: "confidential", ownerOrg: HOSPITAL, sharedWith: [] },
  // hospital, clinical/restricted (mental health)
  { user: `dr.${HOSPITAL}.eth`, content: "patient 304 anxiety dx, fluoxetine 20mg",
    namespace: "clinical", tag: "restricted", ownerOrg: HOSPITAL, sharedWith: [] },
  // hospital, billing/confidential, shared_with insurer
  { user: `billing.${HOSPITAL}.eth`, content: "claim C-44128 ICD K80.20 amount 14200",
    namespace: "billing", tag: "confidential", ownerOrg: HOSPITAL, sharedWith: [INSURER] },
  // hospital, executive/restricted (admin only)
  { user: `dr.${HOSPITAL}.eth`, content: "Q3 cardiology margin 12 percent",
    namespace: "executive", tag: "restricted", ownerOrg: HOSPITAL, sharedWith: [] },
  // hospital, operational/internal (low sensitivity, broad reach)
  { user: `aysel.${HOSPITAL}.eth`, content: "ward 3 night shift two nurses min",
    namespace: "operational", tag: "internal", ownerOrg: HOSPITAL, sharedWith: [] },
];

async function waitForMem0(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${MEM0}/openapi.json`);
      if (r.ok) return;
    } catch {
      // not yet
    }
    await sleep(500);
  }
  throw new Error(`mem0 at ${MEM0} did not come up - did you docker compose up?`);
}

async function resetMem0(): Promise<void> {
  // /reset wipes all memories so the test is hermetic.
  const r = await fetch(`${MEM0}/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`mem0 reset failed: ${r.status} ${await r.text()}`);
}

async function seedOne(s: SeedRow): Promise<void> {
  const r = await fetch(`${MEM0}/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: s.content }],
      user_id: s.user,
      agent_id: "zkma", // matches MEM0_AGENT_ID; gateway searches scope to this
      metadata: {
        namespace: s.namespace,
        tag: s.tag,
        owner_org: s.ownerOrg,
        shared_with: s.sharedWith,
      },
      infer: false,
    }),
  });
  if (!r.ok) throw new Error(`seed failed: ${r.status} ${await r.text()}`);
}

/**
 * Boot a gateway that uses REAL searchAndFilter (real mem0) but a fake
 * resolvePrincipal so we don't need Sepolia. The proof check is also faked
 * because we're testing the search PATH, not the verifier - that's covered
 * by test:proof + test:http.
 */
function makeServerForPrincipal(principal: Principal) {
  const seenSearches: { query: string }[] = [];
  const fastify = buildServer({
    logger: false,
    resolvePrincipal: async (subname): Promise<ResolvedPrincipal | null> => ({
      principal,
      walletAddress: wallet.address,
      proofCommitment: "0x" + "ab".repeat(32) as `0x${string}`,
      expiry: 1799999999,
      revoked: false,
    }),
    verifyProof: async () => ({ ok: true }),
    // searchAndFilter intentionally NOT overridden -> real mem0
  });
  return { fastify, seenSearches };
}

async function searchAs(
  fastify: ReturnType<typeof makeServerForPrincipal>["fastify"],
  principal: Principal,
  query: string,
): Promise<{ id: string; memory: string; metadata?: Record<string, unknown> | null }[]> {
  const subname = `who.${principal.orgLabel}.eth`;
  const challenge = await fastify.inject({
    method: "GET",
    url: `/challenge?subname=${encodeURIComponent(subname)}`,
  });
  const { nonce } = challenge.json() as { nonce: string };
  const body = {
    query,
    subname,
    proof: "0x00" as `0x${string}`,
    publicInputs: "0x00" as `0x${string}`,
  };
  const requestHash = keccak256(new TextEncoder().encode(JSON.stringify(body)));
  const challengeBytes = keccak256(
    new Uint8Array([
      ...Buffer.from(nonce.replace(/^0x/, ""), "hex"),
      ...Buffer.from(requestHash.replace(/^0x/, ""), "hex"),
    ]),
  );
  const sig = await wallet.signMessage({ message: { raw: challengeBytes } });

  const r = await fastify.inject({
    method: "POST",
    url: "/v1/memories/search",
    headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
    payload: body,
  });
  if (r.statusCode !== 200) {
    throw new Error(`search failed ${r.statusCode}: ${r.body}`);
  }
  return (r.json() as { results: { id: string; memory: string; metadata?: Record<string, unknown> | null }[] }).results;
}

async function main(): Promise<void> {
  console.log("[1/5] start stub-openai on :9999");
  const stub = await startStub(9999);

  console.log("[2/5] wait for mem0");
  await waitForMem0();
  console.log("      mem0 reachable");

  console.log("[3/5] reset + seed mem0 with 5 healthcare memories");
  await resetMem0();
  for (const s of seeds) await seedOne(s);
  console.log(`      seeded ${seeds.length} memories`);

  console.log("\n[case] nurse @ hospital: clinical+operational, max-tag=confidential");
  {
    const principal: Principal = {
      orgLabel: HOSPITAL,
      role: "nurse",
      namespaces: ["clinical", "operational"],
      maxTag: "confidential",
    };
    const { fastify } = makeServerForPrincipal(principal);
    const hits = await searchAs(fastify, principal, "patient");
    const memoryStrs = new Set(hits.map((h) => h.memory));
    check("sees clinical/confidential", memoryStrs.has("patient 304 amox 500mg tid 7d"));
    check("blocked from clinical/restricted (psych)", !memoryStrs.has("patient 304 anxiety dx, fluoxetine 20mg"));
    check("blocked from billing (no namespace)", !Array.from(memoryStrs).some((m) => m.includes("claim C-")));
    check("blocked from executive (no namespace)", !Array.from(memoryStrs).some((m) => m.includes("cardiology margin")));
    await fastify.close();
  }

  console.log("\n[case] hospital admin: all namespaces, max-tag=restricted");
  {
    const principal: Principal = {
      orgLabel: HOSPITAL,
      role: "admin",
      namespaces: ["clinical", "operational", "billing", "research", "executive"],
      maxTag: "restricted",
    };
    const { fastify } = makeServerForPrincipal(principal);
    const hits = await searchAs(fastify, principal, "patient");
    const memoryStrs = new Set(hits.map((h) => h.memory));
    check("sees clinical/restricted (psych)", memoryStrs.has("patient 304 anxiety dx, fluoxetine 20mg"));
    check("sees executive/restricted", memoryStrs.has("Q3 cardiology margin 12 percent"));
    check("sees billing", Array.from(memoryStrs).some((m) => m.includes("claim C-44128")));
    await fastify.close();
  }

  console.log("\n[case] insurer claims agent: cross-org, billing only, max-tag=confidential");
  {
    const principal: Principal = {
      orgLabel: INSURER,
      role: "claims-agent",
      namespaces: ["billing"],
      maxTag: "confidential",
    };
    const { fastify } = makeServerForPrincipal(principal);
    const hits = await searchAs(fastify, principal, "claim");
    const memoryStrs = new Set(hits.map((h) => h.memory));
    check("sees billing memories shared_with insurer", memoryStrs.has("claim C-44128 ICD K80.20 amount 14200"));
    check("blocked from clinical (different org, not shared_with)",
      !Array.from(memoryStrs).some((m) => m.includes("amox") || m.includes("anxiety")));
    check("blocked from executive (not shared_with)",
      !Array.from(memoryStrs).some((m) => m.includes("cardiology margin")));
    await fastify.close();
  }

  console.log(`\n[5/5] ${pass}/${pass + fail} checks passed.`);
  await stub.close();
  process.exit(fail === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
