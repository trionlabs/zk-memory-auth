import artifact from "./abi/ZkmaResolver.json";
import sepolia from "./deployments/sepolia.json";

/** ABI for ZkmaResolver. Use directly with viem / wagmi for full type inference. */
export const ZkmaResolverAbi = artifact.abi;

/** Bytecode in case you need to deploy from TS. */
export const ZkmaResolverBytecode = artifact.bytecode.object as `0x${string}`;

export type Deployment = {
  chainId: number;
  ensRegistry: `0x${string}`;
  nameWrapper: `0x${string}`;
  zkmaResolver: `0x${string}`;
  /** Block number at which ZkmaResolver was deployed - use as `fromBlock` for log scans. */
  deployBlock: number;
  platformAddr: `0x${string}`;
  /** Required prefix for all org labels (e.g., "zkmemory-"). */
  requiredPrefix: string;
  /** Reserved for future use. Orgs are now discovered dynamically via OrgRegistered events. */
  orgs: Record<string, never>;
};

/** Sepolia deployment, written by `forge script Bootstrap.s.sol`. */
export const sepoliaDeployment = sepolia as unknown as Deployment;

/** ENS text record keys served by ZkmaResolver. */
export const ZkmaTextKeys = {
  Role: "zkma:role",
  Namespaces: "zkma:namespaces",
  MaxTag: "zkma:max-tag",
  Expiry: "zkma:expiry",
  Revoked: "zkma:revoked",
  ProofCommitment: "zkma:proof-commitment",
  Partners: "zkma:partners",
  Platform: "zkma:platform",
  Version: "zkma:version",
} as const;
