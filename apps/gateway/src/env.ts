/** Loads required env at module load and fails loudly if missing. */
function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env ${key}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  sepoliaRpcUrl:
    process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  mem0BaseUrl: process.env.MEM0_BASE_URL ?? "http://localhost:8888",
  mem0ApiKey: process.env.MEM0_API_KEY ?? "",
  /** When true, accept the proof header as-is without verifying. Demo only. */
  skipProofVerify: process.env.ZKMA_SKIP_PROOF_VERIFY === "1",
} as const;

export { required };
