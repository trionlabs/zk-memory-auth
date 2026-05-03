# @zkma/contracts

Solidity contracts for **zk-memory-authorization** — the on-chain trust kernel for AI agent memory authorization, anchored on ENS.

Live on Sepolia: [`0x842719526d0265f169a066DE6Dd4451b31141043`](https://sepolia.etherscan.io/address/0x842719526d0265f169a066DE6Dd4451b31141043).

## Architecture

Each organization owns its own `zkmemory-<orgname>.eth` directly on ENS — there is no platform parent name. The single contract `ZkmaResolver` is registered as the resolver for each org's name, plus all of that org's user subnames.

```
zkmemory-istanbulhospital.eth                     [wrapped, owner=adminA, resolver=ZkmaResolver]
  ├── aysel.zkmemory-istanbulhospital.eth         [wrapped subname, owner=aysel's wallet, resolver=ZkmaResolver]
  ├── mert.zkmemory-istanbulhospital.eth          [wrapped subname, owner=mert's wallet, resolver=ZkmaResolver]
  └── dr-yildiz.zkmemory-istanbulhospital.eth     [wrapped subname, owner=admin's wallet, resolver=ZkmaResolver]

zkmemory-acmeinsurance.eth                        [separate org, separate admin]
  └── claims-bot.zkmemory-acmeinsurance.eth
```

- The `zkmemory-` prefix is enforced at `registerOrg` so a UI can scan ENS for opted-in orgs. Anyone can register `zkmemory-anything.eth` so the prefix is a discoverability marker, not a security claim.
- User subnames are **real wrapped ERC-1155 subnames** minted by `registerUser` — they appear in the ENS app, OpenSea, the user's wallet inventory.
- `ZkmaResolver` implements `IExtendedResolver` (ENSIP-10 wildcard), `ITextResolver`, and `IAddrResolver`, so standard ENS tooling (viem, ethers, ENS app) reads our records without custom code.

### Trust kernel

| Action | Authorized signer | Enforced by |
|---|---|---|
| `registerOrg(label)` | wallet that owns `<label>.eth` (via NameWrapper) and approved this resolver | inline check + `nameWrapper.ownerOf` |
| `registerUser`, `updateUser`, `setEmailHash`, `setPartners`, `revokeUser` | current org admin (`nameWrapper.ownerOf(orgNode)`) | `onlyOrgAdmin` modifier |
| `setProofCommitment` | the user's own wallet (`userAddr`, write-once at `registerUser`) | `onlyUser` check |

`userAddr` is set once and never mutated. The contract has no setter for it. Even a compromised admin can revoke or downgrade a user but cannot impersonate them in the per-request signature flow because impersonation requires signing as `userAddr`.

### Text record schema

| Key | Level | Writer | Reader-side parse |
|---|---|---|---|
| `zkma:role` | user | admin | string (`"nurse"`, `"resident"`, `"admin"`, `"claims-agent"`, …) |
| `zkma:namespaces` | user | admin | comma-separated (`"clinical,operational"`) |
| `zkma:max-tag` | user | admin | string (`"public"` < `"internal"` < `"confidential"` < `"restricted"`) |
| `zkma:expiry` | user | admin | uint64 unix seconds (string) |
| `zkma:revoked` | user | admin | `"true"` / `"false"` |
| `zkma:email-hash` | user | admin | hex string of `keccak256(email)`; gateway pins proof's `expected_email` to this |
| `zkma:proof-commitment` | user | **user only** | hex string (`"0x..."`, 32 bytes) |
| `zkma:partners` | org | admin | comma-separated ENS names |
| `zkma:platform` | org | constant | `"zkmemoryauthorization"` |
| `zkma:org` | org / user | constant | the org's full label, e.g. `"zkmemory-istanbulhospital"` |

`addr(node)` returns the user's wallet for user-level queries (used by the gateway for per-request ECDSA signature verification per PRD §15.3) and the org admin for org-level queries.

## Local development

```bash
forge install
forge build
forge test                      # 29/29 should pass
```

## Deploy to Sepolia

Set `PLATFORM_KEY` (your wallet's private key) and `SEPOLIA_RPC_URL` in your shell — never write the key to a file. Then:

```bash
PLATFORM_KEY=0x... \
  SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  forge script script/Bootstrap.s.sol:Bootstrap \
    --rpc-url $SEPOLIA_RPC_URL --broadcast --slow

bash script/export-types.sh     # mirrors the new address into packages/contracts-types
```

The wallet just pays the deploy gas (~3.03M gas, sub-cent on Sepolia) — the contract has no platform-level privileges, so the deployer wallet can be discarded after deploy.

### Live smoke

`forge test` proves contract logic against a locally-deployed ENS but cannot prove ENS walk-up routes correctly to our wildcard resolver on Sepolia. For that, run from the workspace root:

```bash
pnpm --filter @zkma/gateway exec node ../../apps/gateway/scripts/live-smoke.mjs
```

The script discovers all registered orgs via `OrgRegistered` events, then per-org users via `UserRegistered`, and asserts every text record resolves through standard ENS lookup. Pass = wildcard resolution is wired correctly.

## Consuming from the rest of the monorepo

```ts
import { ZkmaResolverAbi, ZkmaTextKeys, sepoliaDeployment } from "@zkma/contracts-types";
import { keccak256, toBytes } from "viem";

// admin UI write at user registration time:
const emailHash = keccak256(toBytes(email.toLowerCase()));
await walletClient.writeContract({
  address: sepoliaDeployment.zkmaResolver,
  abi: ZkmaResolverAbi,
  functionName: "registerUser",
  args: [orgNode, "newuser", userAddr, emailHash, "nurse", "clinical", "confidential", expiry],
});

// gateway read (no contract ABI needed - standard ENS):
const role = await publicClient.getEnsText({
  name: "aysel.zkmemory-istanbulhospital.eth",
  key: ZkmaTextKeys.Role,
});
```

## Files

- `src/zkma/ZkmaResolver.sol` — single resolver contract with all read/write paths.
- `src/contracts/` — vendored copy of ENS contracts (registry, wrapper, resolvers) for local testing and the deploy script's compile-time deps.
- `script/Bootstrap.s.sol` — one-shot deploy script.
- `script/export-types.sh` — copies the latest forge artifacts into `packages/contracts-types`.
- `test/ZkmaResolver.t.sol` — 29 forge tests including event emission and trust-kernel regressions.
