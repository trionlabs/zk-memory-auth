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

export const gates = [
  {
    title: "Commitment match",
    body: "The submitted proof is hashed and compared with the proof commitment stored on the user's ENS record.",
  },
  {
    title: "Pinned Google key",
    body: "The gateway rejects proofs unless the JWT key material matches the pinned Google JWKS modulus.",
  },
  {
    title: "Barretenberg verify",
    body: "The Noir proof is verified off-chain with Barretenberg before any mem0 request is built.",
  },
  {
    title: "Nonce wallet signature",
    body: "Every request carries a wallet signature over a fresh nonce, bound to the subname's addr record.",
  },
] as const;

export const personas = [
  {
    role: "Nurse",
    ens: "aysel.zkmemory-istanbulhospital.eth",
    namespaces: "clinical, operational",
    maxTag: "confidential",
    results: ["allow", "deny", "deny"],
  },
  {
    role: "Resident",
    ens: "mert.zkmemory-istanbulhospital.eth",
    namespaces: "clinical, research",
    maxTag: "confidential",
    results: ["allow", "deny", "deny"],
  },
  {
    role: "Admin",
    ens: "dr-yildiz.zkmemory-istanbulhospital.eth",
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
