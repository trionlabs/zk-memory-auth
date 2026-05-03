/**
 * Lazy env wrapper. Each property is a getter so tests that set process.env
 * after module load (or between cases) see the updated value. The naming and
 * defaults are stable; switch to a frozen snapshot in production if a stray
 * env mutation becomes a concern.
 */

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env ${key}`);
  return v;
}

export const env = {
  get port(): number {
    return Number(process.env.PORT ?? 8787);
  },
  get sepoliaRpcUrl(): string {
    return process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  },
  get mem0BaseUrl(): string {
    return process.env.MEM0_BASE_URL ?? "http://localhost:8888";
  },
  get mem0ApiKey(): string {
    return process.env.MEM0_API_KEY ?? "";
  },
  /** mem0 agent_id used to scope every zkma write+search at the mem0 level. */
  get mem0AgentId(): string {
    return process.env.MEM0_AGENT_ID ?? "zkma";
  },
  /** Required: the platform's Google OAuth client_id. The gateway pins
   *  publicInputs.expected_aud to this value to stop a JWT issued for some
   *  other app from being replayed against zkma. Empty string -> all proofs
   *  rejected (fail-closed). */
  get expectedAud(): string {
    return process.env.ZKMA_EXPECTED_AUD ?? "";
  },
  /** Expected JWT iss claim. Default is Google's id-token issuer; override
   *  only if you bring a different IDP. */
  get expectedIss(): string {
    return process.env.ZKMA_EXPECTED_ISS ?? "https://accounts.google.com";
  },
  /** Maximum age (seconds) for the proof's iat_lower relative to now.
   *  Default 7 days matches the PRD's weekly proof rotation. */
  get iatMaxAgeSecs(): number {
    return Number(process.env.ZKMA_IAT_MAX_AGE_SECS ?? 7 * 24 * 3600);
  },
  /** Domain separator mixed into the per-request signed challenge so a
   *  signature for one deployment cannot be replayed against another. */
  get gatewayDomain(): string {
    return process.env.ZKMA_GATEWAY_DOMAIN ?? "zkma:gateway:dev";
  },
  /** When true, accept the proof header as-is without verifying. Demo only. */
  get skipProofVerify(): boolean {
    return process.env.ZKMA_SKIP_PROOF_VERIFY === "1";
  },
  /** Path to the nargo-compiled circuit json (target/zkma_auth.json). */
  get circuitArtifactPath(): string {
    return (
      process.env.ZKMA_CIRCUIT_PATH ??
      new URL(
        "../../../circuits/zkma-auth/target/zkma_auth.json",
        import.meta.url,
      ).pathname
    );
  },
};

export { required };
