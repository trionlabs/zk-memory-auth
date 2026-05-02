# @zkca/contracts

Smart contracts for **zkcontextauth** — programmable, portable, verifiable authorization for AI agent memory, anchored on ENS.

## Architecture

```
zkcontextauth.eth                                       [wrapped, owner=platform, resolver=ZkcaResolver]
  ├── istanbulhospital.zkcontextauth.eth              [wrapped subname, owner=adminA, resolver=ZkcaResolver]
  │     ├── aysel.…                                   [virtual via ENSIP-10 wildcard]
  │     ├── mert.…                                    [virtual]
  │     └── dr-yildiz.…                               [virtual]
  └── acmeinsurance.zkcontextauth.eth                 [wrapped subname, owner=adminB, resolver=ZkcaResolver]
        └── claims-bot.…                              [virtual]
```

- **`zkcontextauth.eth`** is wrapped via NameWrapper (CANNOT_UNWRAP).
- **Org subnames** (`istanbulhospital`, `acmeinsurance`) are real wrapped ERC-1155 subnames owned by their respective admin wallets — visible on Sepolia ENS app, Etherscan, OpenSea.
- **User subnames** (`aysel`, `mert`, `dr-yildiz`, `claims-bot`) are *virtual*: they don't exist in the ENS registry, but standard viem resolution returns them via ENSIP-10 wildcard from `ZkcaResolver` (which is the resolver for each org subname).
- **`ZkcaResolver`** is a single contract that simultaneously serves direct text/addr queries (org-level) and wildcard `resolve(name, data)` queries (user-level).

### Trust kernel

| Action | Authorized signer | Enforced by |
|---|---|---|
| Mint org subname | Platform owner of `zkcontextauth.eth` | NameWrapper.setSubnodeRecord |
| Register user, update role/namespaces/maxTag/expiry, set partners, revoke user | Org admin (current `nameWrapper.ownerOf(orgNode)`) | `onlyOrgAdmin` modifier |
| Update proof commitment | The user's own wallet (write-once `userAddr`, set at registration) | `onlyUser` check |

`userAddr` is set at registration and *never* mutated afterwards — the contract has no setter for it. This is the load-bearing invariant: the org admin can revoke or downgrade a user but cannot impersonate them in the per-request signature flow (PRD §15.3), because impersonation requires signing as `userAddr` and the admin cannot rotate it.

### Text record schema

| Key | Level | Writer | Reader-side parse |
|---|---|---|---|
| `zkca:role` | user | admin | string (`"nurse"`, `"resident"`, `"admin"`, `"claims-agent"`, …) |
| `zkca:namespaces` | user | admin | comma-separated (`"clinical,operational"`) |
| `zkca:max-tag` | user | admin | string (`"public"` < `"internal"` < `"confidential"` < `"restricted"`) |
| `zkca:expiry` | user | admin | uint64 unix seconds (string) |
| `zkca:revoked` | user | admin | `"true"` / `"false"` |
| `zkca:proof-commitment` | user | **user only** | hex string (`"0x..."`, 32 bytes) |
| `zkca:partners` | org | admin | comma-separated ENS names |
| `zkca:platform` | parent | n/a (constant) | `"zkcontextauth"` |
| `zkca:version` | parent | n/a (constant) | `"0.1.0"` |

`addr(node)` returns the user's wallet for user-level queries (used by the gateway for per-request ECDSA signature verification per PRD §15.3) and the org admin for org-level queries.

## Deploy to Sepolia

### One-time setup

```bash
forge install
forge build
forge test                      # 20/20 should pass

cp .env.example .env
# edit .env: set SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, PLATFORM_KEY (the wallet
# that pays for the resolver deploy — only this wallet's tx is on-chain).
```

### Deploy the resolver

```bash
source .env

forge script script/Bootstrap.s.sol:Bootstrap \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --verify

bash script/export-types.sh     # refreshes packages/contracts-types from the new address
```

That's it for the contracts side. Org admins onboard themselves through the admin UI: register their own `zkcontext-<orgname>.eth` on the Sepolia ENS app, connect to the UI, and the form walks them through wrap → approve → `registerOrg` → `registerUser` for each member.

### E2E smoke test (the only test that actually proves wildcard resolution works on live Sepolia)

`forge test` deploys ENS locally and proves contract logic, but cannot prove ENS walk-up routes correctly to our wildcard resolver on the live network — for that you need to hit Sepolia. From `contracts/`:

```bash
npm install --no-save viem@2
SEPOLIA_RPC_URL=https://... node script/smoke.mjs
```

The script queries `getEnsText` and `getEnsAddress` for the platform name, both org subnames, and all four demo users, and asserts each expected value. Pass = wildcard resolution is wired correctly and the gateway / admin UI Just Work without any custom ENS code.

## Consuming from the rest of the monorepo

```ts
import { ZkcaResolverAbi, ZkcaTextKeys, getSepoliaDeployment } from "@zkca/contracts-types";

const deployment = await getSepoliaDeployment();
const hospitalNode = deployment.orgs.istanbulhospital.node;

// admin UI write:
await walletClient.writeContract({
  address: deployment.zkcaResolver,
  abi: ZkcaResolverAbi,
  functionName: "registerUser",
  args: [hospitalNode, "newuser", userAddr, "nurse", "clinical", "confidential", expiry],
});

// gateway read (no contract ABI needed — standard ENS):
const role = await publicClient.getEnsText({
  name: "aysel.istanbulhospital.zkcontextauth.eth",
  key: ZkcaTextKeys.Role,
});
```

 
