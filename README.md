# zk-memory-authorization

**Programmable, portable, verifiable authorization for AI agent memory** - a drop-in gateway in front of mem0 that gates every memory query with a zero-knowledge proof of who you are and what role you hold, with policies and roles anchored in ENS so no one has to trust the memory operator.

Built for ETHGlobal Open Agents · Sepolia · ENS bounty track.

## Repo layout

```
contracts/                Foundry: ZkmaResolver - single contract, dual-mode
                          (direct text/addr + ENSIP-10 wildcard fallback)
apps/admin-ui/            Next.js 16 admin: connect wallet, register your
                          zkmemory-<orgname>.eth, mint user subnames as
                          real wrapped ERC-1155s, manage roles + revoke
packages/contracts-types/ Shared ABI + Sepolia deployment for the rest of the team
ens.md                    The ENS architecture in one page - start here
```

## Live deployment (Sepolia)

| | |
|---|---|
| ZkmaResolver | [`0x842719526d0265f169a066DE6Dd4451b31141043`](https://sepolia.etherscan.io/address/0x842719526d0265f169a066DE6Dd4451b31141043) |
| Required prefix | `zkmemory-` |
| Network | Sepolia (chainId 11155111) |
| RPC (public, no log limits) | `https://ethereum-sepolia-rpc.publicnode.com` |

## Quick start

```bash
pnpm install
pnpm dev            # admin UI on http://localhost:3030
```

To run the contracts locally:

```bash
cd contracts
forge install
forge test          # 20 tests, all pass
```

To verify a live deployment end-to-end:

```bash
cd contracts
node script/smoke.mjs   # discovery-based: scans OrgRegistered + UserRegistered
```

## How the system works in one paragraph

Each organization owns its own `zkmemory-<orgname>.eth` on Sepolia, wrapped via NameWrapper. The org admin approves `ZkmaResolver` as a NameWrapper operator, calls `registerOrg(label)` to set the resolver and emit a discovery event, then mints user subnames via `registerUser(...)`. Each user subname is a real wrapped ERC-1155 token visible in any ENS-aware tool, with text records (`zkma:role`, `zkma:namespaces`, `zkma:max-tag`, `zkma:expiry`, `zkma:revoked`, `zkma:proof-commitment`) served by our resolver and gated by split write access - admin owns role + permissions, user owns proof commitment, no one can rotate `userAddr` post-registration. Anyone can re-verify any access decision by reading public ENS records via standard tools (viem, ethers, the ENS app), without trusting the gateway operator.

## Read more

- [`ens.md`](./ens.md) - the ENS architecture, trust kernel, text record schema, and bounty alignment in one page
- [`contracts/README.md`](./contracts/README.md) - deploy + smoke runbook for the resolver
- [`apps/admin-ui/README.md`](./apps/admin-ui/README.md) - admin UI flows + persona switching for the demo
