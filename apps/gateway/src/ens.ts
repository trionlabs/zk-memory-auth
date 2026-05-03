import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  isTag,
  parseNamespaces,
  type Principal,
  type Tag,
} from "@zkma/policy";
import { env } from "./env.js";

const client = createPublicClient({
  chain: sepolia,
  transport: http(env.sepoliaRpcUrl),
});

export type ResolvedPrincipal = {
  principal: Principal;
  /** Wallet address from `addr(node)` - used for the per-request signature check. */
  walletAddress: `0x${string}`;
  /** From `zkma:proof-commitment`; the gateway compares against the submitted proof. */
  proofCommitment: `0x${string}` | null;
  /** From `zkma:expiry`; if past, principal is dead. */
  expiry: number;
  /** From `zkma:revoked`. */
  revoked: boolean;
};

/**
 * Resolve a `<user>.zkmemory-<org>.eth` ENS name into the typed principal +
 * runtime gates the gateway needs (revocation, expiry, commitment).
 *
 * Returns null if the subname does not resolve or is missing required records.
 * The caller treats null as fail-closed deny.
 */
export async function resolvePrincipal(
  ensName: string,
): Promise<ResolvedPrincipal | null> {
  const dot = ensName.indexOf(".");
  if (dot < 0) return null;
  const orgLabel = ensName.slice(dot + 1).replace(/\.eth$/, "");

  const [
    walletAddress,
    role,
    namespacesRaw,
    maxTagRaw,
    expiryRaw,
    revokedRaw,
    proofCommitmentRaw,
  ] = await Promise.all([
    client.getEnsAddress({ name: ensName }),
    client.getEnsText({ name: ensName, key: "zkma:role" }),
    client.getEnsText({ name: ensName, key: "zkma:namespaces" }),
    client.getEnsText({ name: ensName, key: "zkma:max-tag" }),
    client.getEnsText({ name: ensName, key: "zkma:expiry" }),
    client.getEnsText({ name: ensName, key: "zkma:revoked" }),
    client.getEnsText({ name: ensName, key: "zkma:proof-commitment" }),
  ]);

  if (!walletAddress || !role || !maxTagRaw) return null;
  if (!isTag(maxTagRaw)) return null;

  const maxTag: Tag = maxTagRaw;
  const principal: Principal = {
    orgLabel,
    role,
    namespaces: parseNamespaces(namespacesRaw ?? ""),
    maxTag,
  };

  const expiry = Number(expiryRaw ?? "0");
  const revoked = (revokedRaw ?? "false") === "true";
  const proofCommitment =
    proofCommitmentRaw && /^0x[0-9a-fA-F]{64}$/.test(proofCommitmentRaw)
      ? (proofCommitmentRaw as `0x${string}`)
      : null;

  return { principal, walletAddress, proofCommitment, expiry, revoked };
}
