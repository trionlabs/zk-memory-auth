# ENS in zkmemoryauthorization

ENS is the **load-bearing substrate** for zkmemoryauthorization - it is where organizations declare their identity, where access policy lives, and where any third party can re-verify access decisions without trusting the operator.

## What ENS does for us

| Concern | Where it lives |
|---|---|
| Org identity | `zkmemory-<orgname>.eth` - registered + wrapped on Sepolia by the org itself |
| User identity | `<userlabel>.zkmemory-<orgname>.eth` - real wrapped ERC-1155 subname owned by the user's wallet |
| Per-user role / permissions | Text records on the user's subname (`zkma:role`, `zkma:namespaces`, `zkma:max-tag`, `zkma:expiry`, `zkma:revoked`, `zkma:proof-commitment`) |
| Cross-org partnerships | `zkma:partners` text record on the org's subname |
| Per-request authentication | `addr` record on the user's subname returns the wallet whose signature the gateway verifies |
| Trust-minimized verification | Anyone with public RPC access can re-evaluate any access decision by querying ENS - no privileged API |

## Architecture (one line)

Each org owns `zkmemory-<orgname>.eth`, wraps it via NameWrapper, sets `ZkmaResolver` as its resolver, then mints user subnames as wrapped ERC-1155 tokens directly to user wallets. The resolver serves text records out of its own storage and enforces split write access.

## Naming

- Top-level: `zkmemory-istanbulhospital.eth` - the prefix is a **discoverability marker**, not a security claim. Enforced in the contract at `registerOrg` so the platform's UI lists are consistent.
- User-level: `aysel.zkmemory-istanbulhospital.eth` - a real wrapped subname. Visible in the ENS app, OpenSea, and the user's wallet inventory.
- The `zkmemory-` prefix is unenforceable across the whole namespace (anyone can register `zkmemory-anything.eth`); it only signals "this org opted in."

## Trust model (load-bearing - do not break)

| Action | Authorized signer | How ENS enforces it |
|---|---|---|
| Mint org-level name | The wallet that pays for the .eth registration | BaseRegistrar / NameWrapper at registration time |
| Wrap the org name | Same wallet | NameWrapper.wrapETH2LD |
| Register the org with our resolver | Current `nameWrapper.ownerOf(orgNode)` | `ZkmaResolver.registerOrg` requires this + the prefix |
| Update role / namespaces / maxTag / expiry / revoke / set partners | Current `nameWrapper.ownerOf(orgNode)` | `onlyOrgAdmin` modifier on every admin function |
| Update proof commitment | The user's wallet (write-once `userAddr` set at registration) | `onlyUser` check |
| Mint a user subname | Org admin (and resolver must be approved as NameWrapper operator) | `nameWrapper.setSubnodeRecord` from inside `registerUser` |

`userAddr` is set once at registration and never mutated. There is no setter. The org admin can revoke or downgrade a user but cannot impersonate them under the per-request signature flow, because impersonation requires signing as `userAddr` and the admin cannot rotate it.

## Resolver design

`ZkmaResolver` is a single contract that implements:

- `IExtendedResolver` (ENSIP-10) - wildcard fallback for any `*.zkmemory-<org>.eth` lookup
- `ITextResolver` - direct `text(node, key)` for both org-level and user-level nodes
- `IAddrResolver` - direct `addr(node)` returning the user's wallet for user nodes, the org admin for org nodes
- `IERC165` - declares all four interface IDs so viem dispatches correctly through the wildcard path

User subnames are minted as **real wrapped ERC-1155 tokens** (so they appear in the ENS app, wallet inventories, OpenSea), but their resolver is set to `ZkmaResolver` so all reads go through our access logic.

## Text record schema

| Key | Set on | Writer | Format |
|---|---|---|---|
| `zkma:platform` | parent / org | constant | `"zkmemoryauthorization"` |
| `zkma:org` | org / user | constant | the org's full label, e.g. `"zkmemory-istanbulhospital"` |
| `zkma:partners` | org | org admin | comma-separated ENS names |
| `zkma:role` | user | org admin | role string (`"nurse"`, `"resident"`, `"admin"`, `"claims-agent"`, ...) |
| `zkma:namespaces` | user | org admin | comma-separated (`"clinical,operational"`) |
| `zkma:max-tag` | user | org admin | `"public"` / `"internal"` / `"confidential"` / `"restricted"` |
| `zkma:expiry` | user | org admin | uint64 unix seconds, formatted as decimal string |
| `zkma:revoked` | user | org admin | `"true"` / `"false"` |
| `zkma:proof-commitment` | user | **user only** | hex-encoded 32-byte commitment (`"0x..."`) |

`addr(node)` returns the user's wallet at user nodes (used by the gateway for per-request ECDSA signature verification per PRD §15.3) and the org admin at org nodes (informational).

## Live deployment (Sepolia)

| | Value |
|---|---|
| Chain | Sepolia (chainId 11155111) |
| Resolver | `0x418D97d0bA1BF82B79e51C0C1c36FB7105E821DE` |
| Required prefix | `zkmemory-` |
| ENS Registry | `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` |
| NameWrapper | `0x0635513f179D50A207757E05759CbD106d7dFcE8` |
| BaseRegistrar | `0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85` |

Recommended public RPC: `https://ethereum-sepolia-rpc.publicnode.com` (no `eth_getLogs` block-range cap, unlike most free Alchemy/Infura tiers).

## How an org joins

1. Register `zkmemory-<orgname>.eth` on Sepolia ENS app (~5 min, free with a faucet).
2. If the registration didn't auto-wrap (Sepolia sometimes doesn't), wrap it: approve BaseRegistrar to NameWrapper, then call `wrapETH2LD(label, owner, CANNOT_UNWRAP, 0x0)`.
3. Approve `ZkmaResolver` as a NameWrapper operator: `nameWrapper.setApprovalForAll(ZkmaResolver, true)`.
4. Call `ZkmaResolver.registerOrg(label)` - sets resolver, marks org active, emits `OrgRegistered`.

The admin UI (`apps/admin-ui`) walks through all four steps when the connected wallet has an unwrapped `.eth` registered to it.

## How a user is added

Org admin calls `ZkmaResolver.registerUser(orgNode, label, userAddr, role, namespaces, maxTag, expiry)`. The contract:

1. Records the user data in storage.
2. Calls `nameWrapper.setSubnodeRecord(orgNode, label, userAddr, ZkmaResolver, 0, 0, expiry)` - mints a real wrapped subname to the user, with our resolver.

After this single transaction, `<label>.<orgname>.eth` resolves end-to-end through standard ENS tooling (viem, ethers, ENS app, OpenSea).

## How verification works (the trustless property)

A third-party agent or auditor can re-verify any access decision **without contacting our gateway or operator**:

```ts
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const c = createPublicClient({ chain: sepolia, transport: http(rpc) });

const role     = await c.getEnsText({ name: "aysel.zkmemory-istanbulhospital.eth", key: "zkma:role" });
const maxTag   = await c.getEnsText({ name: "aysel.zkmemory-istanbulhospital.eth", key: "zkma:max-tag" });
const revoked  = await c.getEnsText({ name: "aysel.zkmemory-istanbulhospital.eth", key: "zkma:revoked" });
const wallet   = await c.getEnsAddress({ name: "aysel.zkmemory-istanbulhospital.eth" });
const partners = await c.getEnsText({ name: "zkmemory-istanbulhospital.eth",       key: "zkma:partners" });
```

If the operator silently grants access that ENS records say should be denied, anyone can prove it. That is the bounty pitch in one paragraph.

## Why this satisfies the ENS bounty

The bounty rewards "ENS doing real work for an agent's identity, discoverability, gating, or coordination." We hit:

- **Identity** - every agent (org and user) has a real wrapped ENS name.
- **Gating** - every memory query the gateway serves is gated against the user's text records, evaluated against the org's text records.
- **Coordination** - cross-org access is encoded as `zkma:partners` text records on org subnames; partners read each other's permissions over public ENS, no private API.
- **Open Track creative use** - proof commitments stored as text records (`zkma:proof-commitment`); subnames as access tokens; per-request signature anchored on the subname's `addr` record.

## See also

- `contracts/src/zkma/ZkmaResolver.sol` - the resolver contract.
- `contracts/test/ZkmaResolver.t.sol` - 20 tests covering register/update/revoke + trust-kernel regressions.
- `contracts/script/Bootstrap.s.sol` - one-shot resolver deploy script.
- `contracts/script/smoke.mjs` - discovery-based live-Sepolia smoke (scans `OrgRegistered` + `UserRegistered`, verifies every record via standard ENS lookup).
- `apps/admin-ui/components/create-org-form.tsx` - the four-step org onboarding flow.
