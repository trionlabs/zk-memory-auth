// Self-contained Sepolia smoke for zkcontextauth v2.
// Discovers all registered orgs via OrgRegistered events, then for each org
// discovers users via UserRegistered events, then verifies every user's records
// resolve via standard ENS lookup (i.e., end-to-end through walk-up + ZkcaResolver).
//
// Usage (from contracts/):
//   npm install --no-save viem@2
//   node script/smoke.mjs

import { createPublicClient, http, parseAbiItem } from "viem";
import { sepolia } from "viem/chains";
import deployment from "../../packages/contracts-types/src/deployments/sepolia.json" with { type: "json" };

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const RESOLVER = deployment.zkcaResolver;
const FROM_BLOCK = BigInt(deployment.deployBlock);

const c = createPublicClient({ chain: sepolia, transport: http(RPC) });

const orgRegisteredEvent = parseAbiItem(
  "event OrgRegistered(bytes32 indexed orgNode, address indexed admin, string label)",
);
const userRegisteredEvent = parseAbiItem(
  "event UserRegistered(bytes32 indexed orgNode, string userLabel, address userAddr)",
);

let failed = 0;
const expect = (label, got, predicate) => {
  const ok = predicate(got);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}`);
  if (!ok) failed++;
};

console.log(`Resolver: ${RESOLVER}`);
console.log(`Discovering orgs from logs (fromBlock=${FROM_BLOCK})…\n`);

const orgLogs = await c.getLogs({
  address: RESOLVER,
  event: orgRegisteredEvent,
  fromBlock: FROM_BLOCK,
});

if (orgLogs.length === 0) {
  console.log("No orgs registered yet. Nothing to verify — register one through the admin UI first.");
  process.exit(0);
}

for (const orgLog of orgLogs) {
  const { orgNode, admin, label } = orgLog.args;
  const ensName = `${label}.eth`;
  console.log(`== ${ensName} (org) ==`);
  expect("addr (admin)", await c.getEnsAddress({ name: ensName }), (v) => v?.toLowerCase() === admin.toLowerCase());
  expect("zkca:platform", await c.getEnsText({ name: ensName, key: "zkca:platform" }), (v) => v === "zkcontextauth");
  expect("zkca:org",      await c.getEnsText({ name: ensName, key: "zkca:org" }),      (v) => v === label);

  const userLogs = await c.getLogs({
    address: RESOLVER,
    event: userRegisteredEvent,
    args: { orgNode },
    fromBlock: FROM_BLOCK,
  });

  if (userLogs.length === 0) {
    console.log("  (no users registered)\n");
    continue;
  }

  const seen = new Set();
  for (const userLog of userLogs) {
    const userLabel = userLog.args.userLabel;
    const userAddr = userLog.args.userAddr;
    if (seen.has(userLabel)) continue;
    seen.add(userLabel);

    const userEns = `${userLabel}.${ensName}`;
    console.log(`  → ${userEns}`);
    expect("    addr (user wallet)", await c.getEnsAddress({ name: userEns }), (v) => v?.toLowerCase() === userAddr.toLowerCase());
    expect("    zkca:role         ", await c.getEnsText({ name: userEns, key: "zkca:role" }),       (v) => !!v);
    expect("    zkca:namespaces   ", await c.getEnsText({ name: userEns, key: "zkca:namespaces" }), (v) => !!v);
    expect("    zkca:max-tag      ", await c.getEnsText({ name: userEns, key: "zkca:max-tag" }),    (v) => !!v);
    expect("    zkca:revoked      ", await c.getEnsText({ name: userEns, key: "zkca:revoked" }),    (v) => v === "true" || v === "false");
  }
  console.log("");
}

if (failed > 0) {
  console.error(`${failed} check(s) failed — wildcard / direct resolution is NOT wired correctly.`);
  process.exit(1);
}
console.log("All checks passed. Live ENS resolution is working end-to-end.");
