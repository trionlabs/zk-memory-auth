# @zkma/admin-ui

Browser admin for the live Sepolia ZkmaResolver. Every action is signed by the connected wallet (MetaMask or any injected provider) and broadcast directly to Sepolia - no private keys are stored or used by the UI.

## Run locally

```bash
# from the repo root
pnpm install
pnpm dev
# -> http://localhost:3030
```

The Sepolia RPC is pinned to `https://ethereum-sepolia-rpc.publicnode.com` (no `eth_getLogs` cap, which the org/user discovery scans require). Don't override it with a free Alchemy/Infura URL - those cap log scans at 10 blocks and silently empty the roster.

## End-to-end demo flow

1. **Register `zkmemory-<orgname>.eth`** on the [Sepolia ENS app](https://sepolia.app.ens.domains) (~5 min, free with a Sepolia faucet). The app sometimes registers without auto-wrapping - that's fine, the UI handles wrapping.
2. Open `http://localhost:3030`, connect the wallet that owns the name.
3. Click **"+ Create your organization"**, type the org name (the form prepends `zkmemory-` and appends `.eth`).
4. The form walks through up to four transactions (skips wrap if already wrapped):
   - **2a** - Approve BaseRegistrar (lets NameWrapper take possession to wrap)
   - **2b** - Wrap the name (mints the wrapped ERC-1155 to you, burns `CANNOT_UNWRAP`)
   - **3** - Approve NameWrapper as operator (lets the resolver mint user subnames on your behalf)
   - **4** - `registerOrg(label)` - sets the resolver, marks org active, emits the discovery event
5. Org card appears below. Click **"+ register new user"** to mint a real wrapped subname for each user.
6. Each user subname (e.g. `aysel.zkmemory-istanbulhospital.eth`) is now visible in the ENS app, OpenSea, and the user's wallet - with all `zkma:*` text records served by our resolver.

## What the UI does

| Action | Contract call | Authorized signer |
|---|---|---|
| Register org | `ZkmaResolver.registerOrg(label)` | the wrapped owner of `<label>.eth` |
| Register user | `ZkmaResolver.registerUser(orgNode, label, addr, emailHash, role, namespaces, maxTag, expiry)` | org admin |
| Edit user | `ZkmaResolver.updateUser(orgNode, label, role, namespaces, maxTag, expiry)` | org admin |
| Rotate email hash | `ZkmaResolver.setEmailHash(orgNode, label, emailHash)` | org admin |
| Revoke user | `ZkmaResolver.revokeUser(orgNode, label)` | org admin |
| Set partners | `ZkmaResolver.setPartners(orgNode, csv)` | org admin |
| Set proof commitment | `ZkmaResolver.setProofCommitment(orgNode, label, commitment32)` | the user wallet only |

`userAddr` is write-once at registration - there is no setter - so even an admin cannot rotate a user's wallet. That's the trust kernel guarantee from PRD §15.4.

## Layout

```
apps/admin-ui/
├── app/
│   ├── layout.tsx          wraps with WagmiProvider + QueryClientProvider
│   ├── page.tsx            top-level - renders the OrgList
│   └── providers.tsx       client-side providers
├── components/
│   ├── wallet-button.tsx   connect/disconnect via injected provider
│   ├── org-list.tsx        discovers orgs from OrgRegistered events
│   ├── create-org-form.tsx 4-step org onboarding (wrap -> approve -> register)
│   ├── org-card.tsx        one org - partners editor, user list, register form
│   ├── user-row.tsx        per-user row with edit/revoke/proof-commit inline
│   ├── register-user-form.tsx
│   ├── partners-editor.tsx
│   └── tx-button.tsx       wraps useWriteContract + receipt confirmation + error UX
├── lib/
│   ├── wagmi.ts            sepolia + injected connector + pinned public RPC
│   ├── users.ts            event-discovery for orgs and per-org user labels
│   └── utils.ts            shortAddr, fmtExpiry, labelHash
└── next.config.ts          turbopack root + transpiles @zkma/contracts-types
```

## Handoff

This is the demo-driveable starter. Everything beyond it:

- shadcn-ify components if you want polish
- add the partner setup wizard (it's currently just a plain CSV input)
- add the Slack identity binding
- implement the user-side proof refresh page (`/refresh`) once the noir-jwt circuit lands

The contract surface is stable - adding new text record keys requires both a contract change and a TS update in `@zkma/contracts-types`.
