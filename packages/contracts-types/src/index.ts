import artifact from "./abi/ZkcaResolver.json";
import sepolia from "./deployments/sepolia.json";

/** ABI for ZkcaResolver. Use directly with viem / wagmi for full type inference. */
export const ZkcaResolverAbi = artifact.abi;

/** Bytecode in case you need to deploy from TS. */
export const ZkcaResolverBytecode = artifact.bytecode.object as `0x${string}`;

export type Deployment = {
  chainId: number;
  ensRegistry: `0x${string}`;
  nameWrapper: `0x${string}`;
  zkcaResolver: `0x${string}`;
  /** Block number at which ZkcaResolver was deployed — use as `fromBlock` for log scans. */
  deployBlock: number;
  platformAddr: `0x${string}`;
  /** Required prefix for all org labels (e.g., "zkcontext-"). */
  requiredPrefix: string;
  /** Reserved for future use. Orgs are now discovered dynamically via OrgRegistered events. */
  orgs: Record<string, never>;
};

/** Sepolia deployment, written by `forge script Bootstrap.s.sol`. */
export const sepoliaDeployment = sepolia as unknown as Deployment;

/** ENS text record keys served by ZkcaResolver. */
export const ZkcaTextKeys = {
  Role: "zkca:role",
  Namespaces: "zkca:namespaces",
  MaxTag: "zkca:max-tag",
  Expiry: "zkca:expiry",
  Revoked: "zkca:revoked",
  ProofCommitment: "zkca:proof-commitment",
  Partners: "zkca:partners",
  Platform: "zkca:platform",
  Version: "zkca:version",
} as const;
