/**
 * Seeds the local mem0 instance with hand-curated healthcare memories that
 * cover every (namespace, tag) cell used in the demo, plus a handful of
 * cross-org `shared_with` entries for the hospital <-> insurer story.
 *
 * Bypasses the gateway by design: this is admin-bootstrap data, not a user
 * write, and per-user proofs do not apply.
 *
 * Usage:
 *   MEM0_BASE_URL=http://localhost:8888 pnpm tsx scripts/seed-memories.ts
 */

const MEM0 = process.env.MEM0_BASE_URL ?? "http://localhost:8888";
const HOSPITAL = "zkmemory-istanbulhospital";
const INSURER = "zkmemory-acmeinsurance";

type Seed = {
  user: string; // mem0 user_id; we use the ENS subname so it's stable
  content: string;
  namespace: string;
  tag: "public" | "internal" | "confidential" | "restricted";
  ownerOrg: string;
  sharedWith: string[];
};

const seeds: Seed[] = [
  // ---- public, internal: visible to most hospital roles ----
  {
    user: `front-desk.${HOSPITAL}.eth`,
    content: "Hospital visiting hours are 09:00 to 20:00 daily.",
    namespace: "operational",
    tag: "public",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `front-desk.${HOSPITAL}.eth`,
    content: "Cafeteria menu rotates weekly. Vegetarian option always available.",
    namespace: "operational",
    tag: "public",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `aysel.${HOSPITAL}.eth`,
    content: "Ward 3 night-shift staffing requires two nurses minimum per ICU bay.",
    namespace: "operational",
    tag: "internal",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `aysel.${HOSPITAL}.eth`,
    content: "MRI machine on floor 2 booked solid through Friday for outpatient clinic.",
    namespace: "operational",
    tag: "internal",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- clinical, confidential: nurses+ can see ----
  {
    user: `aysel.${HOSPITAL}.eth`,
    content:
      "Patient 304 prescribed amoxicillin 500mg tid for 7 days. Allergy: none reported.",
    namespace: "clinical",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `mert.${HOSPITAL}.eth`,
    content:
      "Patient 218 admitted overnight with chest pain. ECG normal, troponin pending.",
    namespace: "clinical",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `aysel.${HOSPITAL}.eth`,
    content:
      "Patient 411 post-op day 2 cholecystectomy. Pain controlled on PCA, vitals stable.",
    namespace: "clinical",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- clinical, restricted: only attendings + admins ----
  {
    user: `dr-yildiz.${HOSPITAL}.eth`,
    content:
      "Patient 304 psychiatric evaluation: anxiety disorder, situational. Started fluoxetine 20mg.",
    namespace: "clinical",
    tag: "restricted",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `dr-yildiz.${HOSPITAL}.eth`,
    content:
      "Patient 218 HIV+ confirmed via viral load test 2026-04-12. On ART, plan continuity of care.",
    namespace: "clinical",
    tag: "restricted",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- billing, confidential, shared_with insurer ----
  {
    user: `billing.${HOSPITAL}.eth`,
    content:
      "Claim C-44128: ICD-10 K80.20, CPT 47562, billed amount $14,200, patient 411.",
    namespace: "billing",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [INSURER],
  },
  {
    user: `billing.${HOSPITAL}.eth`,
    content:
      "Claim C-44129: ICD-10 J18.9 pneumonia, CPT 99221, billed $3,400, patient 218.",
    namespace: "billing",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [INSURER],
  },
  {
    user: `billing.${HOSPITAL}.eth`,
    content:
      "Hospital quarterly aging report: 32 days mean A/R, 8 percent over 90 days.",
    namespace: "billing",
    tag: "internal",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- research, confidential ----
  {
    user: `mert.${HOSPITAL}.eth`,
    content:
      "Cohort 2026-Q1: 142 patients, ages 45-72, post-cardiac event. 30-day readmit 11.3 percent.",
    namespace: "research",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `dr-yildiz.${HOSPITAL}.eth`,
    content:
      "Pilot study: empagliflozin in CKD stage 3 patients. n=44, eGFR slope improvement 1.8 mL/min/yr.",
    namespace: "research",
    tag: "confidential",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- executive, restricted: admin only ----
  {
    user: `dr-yildiz.${HOSPITAL}.eth`,
    content:
      "Q3 hospital margin by department: cardiology 12 percent, oncology 7 percent, pediatrics negative 3 percent.",
    namespace: "executive",
    tag: "restricted",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },
  {
    user: `dr-yildiz.${HOSPITAL}.eth`,
    content:
      "CEO compensation FY2026: base 480k, bonus tied to volume targets, long-term equity grant 200k.",
    namespace: "executive",
    tag: "restricted",
    ownerOrg: HOSPITAL,
    sharedWith: [],
  },

  // ---- insurer-side memories ----
  {
    user: `claims-bot.${INSURER}.eth`,
    content:
      "Policy AC-9981 covers 80 percent of in-network surgical procedures up to $20,000 annual cap.",
    namespace: "billing",
    tag: "internal",
    ownerOrg: INSURER,
    sharedWith: [],
  },
  {
    user: `claims-bot.${INSURER}.eth`,
    content:
      "Adjudication queue 2026-W18: 312 claims pending, 47 require manual review.",
    namespace: "operational",
    tag: "internal",
    ownerOrg: INSURER,
    sharedWith: [],
  },
];

async function postOne(seed: Seed): Promise<void> {
  const res = await fetch(`${MEM0}/v1/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: seed.content }],
      user_id: seed.user,
      metadata: {
        namespace: seed.namespace,
        tag: seed.tag,
        owner_org: seed.ownerOrg,
        shared_with: seed.sharedWith,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`mem0 ${res.status}: ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  console.log(`seeding ${seeds.length} memories to ${MEM0}`);
  let ok = 0;
  for (const s of seeds) {
    try {
      await postOne(s);
      ok++;
      console.log(
        `  ok  [${s.namespace}/${s.tag}] ${s.user} - ${s.content.slice(0, 60)}...`,
      );
    } catch (e) {
      console.error(`  FAIL ${s.user}: ${(e as Error).message}`);
    }
  }
  console.log(`\n${ok}/${seeds.length} seeded.`);
  if (ok !== seeds.length) process.exit(1);
}

void main();
