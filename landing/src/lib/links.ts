export const resolverAddress = "0x842719526d0265f169a066DE6Dd4451b31141043";
export const requiredPrefix = "zkmemory-";
export const chainId = 11155111;

export const links = {
  github: "https://github.com/trionlabs/zk-memory-auth",
  resolver: `https://sepolia.etherscan.io/address/${resolverAddress}`,
  adminDemo: "",
  demoVideo: "",
  submission: "",
} as const;

export const textRecords = [
  "zkma:role",
  "zkma:namespaces",
  "zkma:max-tag",
  "zkma:expiry",
  "zkma:revoked",
  "zkma:proof-commitment",
  "zkma:email-hash",
  "zkma:partners",
] as const;

export type KwTone = "ens" | "google" | "noir" | "wallet" | "mem0";
export type GateSegment = string | { kw: string; tone: KwTone };

export const gates: ReadonlyArray<{ title: string; body: ReadonlyArray<GateSegment> }> = [
  {
    title: "Match the proof commitment",
    body: [
      "The submitted proof is hashed and compared with the commitment on the user's ",
      { kw: "ENS", tone: "ens" },
      " record.",
    ],
  },
  {
    title: "Pin Google's signing key",
    body: [
      "The gateway rejects proofs unless the ",
      { kw: "JWT", tone: "google" },
      " key matches the pinned ",
      { kw: "Google", tone: "google" },
      " ",
      { kw: "JWKS", tone: "google" },
      " modulus.",
    ],
  },
  {
    title: "Verify with Barretenberg",
    body: [
      "The ",
      { kw: "Noir", tone: "noir" },
      " proof is verified off-chain with ",
      { kw: "Barretenberg", tone: "noir" },
      " before any ",
      { kw: "mem0", tone: "mem0" },
      " request is built.",
    ],
  },
  {
    title: "Bind to a fresh nonce",
    body: [
      "Every request carries a ",
      { kw: "wallet", tone: "wallet" },
      " signature over a fresh nonce, bound to the subname's ",
      { kw: "addr", tone: "ens" },
      " record.",
    ],
  },
];

export const personas = [
  {
    role: "Nurse",
    ens: "nurse.zkmemory-hospital.eth",
    namespaces: "clinical",
    maxTag: "confidential",
    results: ["allow", "deny", "deny"],
  },
  {
    role: "Resident",
    ens: "resident.zkmemory-hospital.eth",
    namespaces: "clinical",
    maxTag: "confidential",
    results: ["allow", "deny", "deny"],
  },
  {
    role: "Hospital admin",
    ens: "admin.zkmemory-hospital.eth",
    namespaces: "all",
    maxTag: "restricted",
    results: ["allow", "allow", "allow"],
  },
] as const;

export const memoryQuestions = [
  "Medication schedule",
  "Psych evaluation",
  "Q3 margin by department",
] as const;
