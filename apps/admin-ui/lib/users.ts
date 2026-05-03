import { parseAbiItem, type PublicClient } from "viem";
import { sepoliaDeployment } from "@zkma/contracts-types";

const RESOLVER = sepoliaDeployment.zkmaResolver;
const FROM_BLOCK = BigInt(sepoliaDeployment.deployBlock);

const orgRegisteredEvent = parseAbiItem(
  "event OrgRegistered(bytes32 indexed orgNode, address indexed admin, string label)",
);
const userRegisteredEvent = parseAbiItem(
  "event UserRegistered(bytes32 indexed orgNode, string userLabel, address userAddr)",
);

export type OrgSummary = {
  orgNode: `0x${string}`;
  admin: `0x${string}`;
  label: string;
};

/** Discover all registered orgs by scanning OrgRegistered logs from the deploy block. */
export async function fetchOrgs(client: PublicClient): Promise<OrgSummary[]> {
  const logs = await client.getLogs({
    address: RESOLVER,
    event: orgRegisteredEvent,
    fromBlock: FROM_BLOCK,
    toBlock: "latest",
  });
  // De-dup by orgNode (last write wins).
  const map = new Map<string, OrgSummary>();
  for (const log of logs) {
    const orgNode = log.args.orgNode as `0x${string}` | undefined;
    const admin = log.args.admin as `0x${string}` | undefined;
    const label = log.args.label as string | undefined;
    if (orgNode && admin && label) {
      map.set(orgNode, { orgNode, admin, label });
    }
  }
  return Array.from(map.values());
}

/** Discover all user labels for a given org. */
export async function fetchOrgUserLabels(
  client: PublicClient,
  orgNode: `0x${string}`,
): Promise<string[]> {
  const logs = await client.getLogs({
    address: RESOLVER,
    event: userRegisteredEvent,
    args: { orgNode },
    fromBlock: FROM_BLOCK,
    toBlock: "latest",
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const log of logs) {
    const label = log.args.userLabel as string | undefined;
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out;
}

export { orgRegisteredEvent, userRegisteredEvent };
