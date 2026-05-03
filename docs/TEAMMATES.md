# Teammate quickstart

Copy-paste env values + commands for getting a local stack up against the live Sepolia contract. **Read the warnings at the bottom before pasting any private keys.**

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node | 22 | nvm or system |
| pnpm | 9+ | `npm i -g pnpm@9` |
| Docker | recent | Docker Desktop / Orbstack |
| nargo | exactly `1.0.0-beta.15` | `curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install \| bash && noirup -v 1.0.0-beta.15` |
| bb (matched to nargo) | resolved by `bbup` | `bbup` (after noirup) |
| foundry / forge / cast | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |

## One-time setup

```bash
git clone https://github.com/trionlabs/zk-memory-auth.git
cd zk-memory-auth
pnpm install

# build the Noir circuit (~30s, produces circuits/zkma-auth/target/zkma_auth.json)
( cd circuits/zkma-auth && nargo compile )

# install Solidity deps for forge tests
( cd contracts && forge install foundry-rs/forge-std --no-git \
  && forge install OpenZeppelin/openzeppelin-contracts@v4.9.6 --no-git )
```

## Live deployment (already on Sepolia, no need to redeploy)

| | |
|---|---|
| `ZkmaResolver` | [`0x842719526d0265f169a066DE6Dd4451b31141043`](https://sepolia.etherscan.io/address/0x842719526d0265f169a066DE6Dd4451b31141043) |
| Demo org | [`zkmemory-myhospital.eth`](https://sepolia.app.ens.domains/zkmemory-myhospital.eth) (registered, not yet wrapped + onboarded) |
| Required prefix | `zkmemory-` |
| Sepolia RPC | `https://ethereum-sepolia-rpc.publicnode.com` |

## Env values to paste

### Admin UI — `apps/admin-ui/.env.local`

```bash
cat > apps/admin-ui/.env.local <<'EOF'
NEXT_PUBLIC_GOOGLE_CLIENT_ID=735810393674-tq6cq4mu23i28q4e717lucnhit00sqqd.apps.googleusercontent.com
EOF
```

> ⚠ The Google client_id above is **shared among teammates** for this hackathon. Each teammate using Sign-In With Google must be on the OAuth Test Users list — DM Yaman/Deniz/Kaleab to be added, or bypass GIS by using the "show advanced: paste JWT manually" toggle on `/refresh`.

### Gateway — paste into your shell (or use direnv)

```bash
export PORT=8787
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
export MEM0_BASE_URL=http://localhost:8888
export MEM0_AGENT_ID=zkma
export ZKMA_EXPECTED_AUD=735810393674-tq6cq4mu23i28q4e717lucnhit00sqqd.apps.googleusercontent.com
export ZKMA_EXPECTED_ISS=https://accounts.google.com
export ZKMA_IAT_MAX_AGE_SECS=604800
export ZKMA_GATEWAY_DOMAIN=zkma:gateway:dev
```

> ⚠ `ZKMA_EXPECTED_AUD` MUST match `NEXT_PUBLIC_GOOGLE_CLIENT_ID` exactly. If they diverge by one character, every search returns `403 aud mismatch`.

### mem0 — `services/mem0/server/.env`

```bash
cat > services/mem0/server/.env <<'EOF'
OPENAI_API_KEY=sk-stub-not-real
OPENAI_BASE_URL=http://host.docker.internal:9999/v1
JWT_SECRET=zkma-dev-secret-not-real
ADMIN_API_KEY=zkma-admin-not-real
AUTH_DISABLED=true
DASHBOARD_URL=http://localhost:3000
APP_DB_NAME=mem0_app
MEM0_TELEMETRY=false
MEM0_DEFAULT_LLM_MODEL=gpt-4.1-nano-2025-04-14
MEM0_DEFAULT_EMBEDDER_MODEL=text-embedding-3-small
EOF
```

> The `OPENAI_API_KEY=sk-stub-not-real` paired with `OPENAI_BASE_URL=http://host.docker.internal:9999/v1` makes mem0 hit our local stub instead of paying for real OpenAI. If you have your own real `OPENAI_API_KEY`, drop the `OPENAI_BASE_URL` line and use the real one.

## Run scenarios

### A. Just browse the admin UI (~1 minute)

```bash
pnpm dev    # admin UI on http://localhost:3030
```

You'll see the org list (probably one org: `zkmemory-myhospital.eth` if Yaman/Deniz/Kaleab onboarded it via the UI flow).

### B. Run the full backend stack (~5 minutes)

```bash
# 1. mem0
( cd services/mem0/server && docker compose -f docker-compose.yaml up -d --build )

# 2. stub-openai (so mem0 doesn't need a real OpenAI key)
pnpm --filter @zkma/gateway stub:openai &

# 3. gateway (env from above)
pnpm --filter @zkma/gateway dev &

# 4. admin UI
pnpm dev
```

Health checks:
```bash
curl http://localhost:8787/healthz                # gateway
curl http://localhost:8888/openapi.json | head -c 100   # mem0
curl http://localhost:9999/healthz                # stub-openai
```

### C. Run the test suite

```bash
# unit tests + integration that don't need docker/nargo
pnpm test
pnpm typecheck
( cd contracts && forge test )

# real Noir proof, requires nargo + circuit compiled
pnpm --filter @zkma/gateway test:proof

# real mem0 docker integration
pnpm --filter @zkma/gateway test:mem0

# HTTP routing + replay defenses
pnpm --filter @zkma/gateway test:http

# claims.ts decoders + offset constants
pnpm --filter @zkma/gateway test:claims
```

Expected: 29 forge + 9 proof + 35 http + 12 claims + 10 mem0 + 12 policy = **107 green**.

### D. Try `/refresh` in browser

1. Set the env above and start the admin UI (`pnpm dev`).
2. Open `http://localhost:3030/refresh`.
3. **Hit Sign In With Google.** Sign in with a Gmail that's been added to the OAuth Test Users list (ping the team).
4. Type a subname you own (e.g. `aysel.zkmemory-myhospital.eth` if Yaman onboarded you).
5. Click **Generate proof**. Browser worker spends 10–30s on bb.js prove.
6. Click **Write commitment to ENS**. MetaMask prompts; sign; tx confirms.
7. Now an agent can query the gateway against your subname and the gateway will accept your proof.

**No Test Users access?** Click "show advanced: paste JWT manually," grab a JWT from [Google's OAuth Playground](https://developers.google.com/oauthplayground) (select Google OAuth2 API v2 + email scope, sign in, exchange), paste it.

### E. Register a new test user under the demo org (requires admin role)

You need the wallet that owns `zkmemory-myhospital.eth`. If that's you, click **+ register new user** in the admin UI. If not, ask the org owner.

## What you do NOT need to do

- **Redeploy the contract.** It's already on Sepolia at `0x842719526d0265f169a066DE6Dd4451b31141043`. The deployer wallet's private key is intentionally not shared — it was used once and the contract has no platform-level privileges anyway.
- **Register a new ENS name** unless you want to spin up a second org. Each `zkmemory-<orgname>.eth` can be registered via the bash helper `contracts/script/register-ens.sh` if needed.
- **Run `forge script Bootstrap` again.** Same reason.

## Warnings

1. **The Sepolia private key that was leaked in chat is COMPROMISED.** Do not reuse it. If you need to send Sepolia transactions, generate a fresh wallet with `cast wallet new` and faucet it from [sepoliafaucet.com](https://sepoliafaucet.com) or [QuickNode's Sepolia faucet](https://faucet.quicknode.com/ethereum/sepolia).
2. **Never paste private keys into chat or commit them.** Even on testnets — the bad habit transfers.
3. **The Google client_secret was also leaked.** Our flow doesn't use it (ID-token-only) so the leak is benign for our app, but the secret has been rotated/revoked in Google Cloud Console (or should be — check with Yaman).
4. **Test Users gate.** Until the Google OAuth consent screen is published+verified (a multi-day process with Google), only emails on the Test Users list can sign in. Bypass with paste-JWT for development.
5. **`apps/admin-ui/.env.local` is gitignored** — anyone with shell access to your laptop reads it, but it never gets committed. Production deployment should use a real secrets store.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Gateway returns `403 aud mismatch` | `ZKMA_EXPECTED_AUD` ≠ `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Make them identical to the byte. |
| Gateway returns `403 ZKMA_EXPECTED_AUD env not set` | env not exported in the gateway's shell | `export ZKMA_EXPECTED_AUD=…` then restart `pnpm dev` for gateway. |
| `/refresh` worker errors `Cannot find module @noir-lang/noir_js` | turbopack hasn't transpiled it yet | First load of any worker is slow; reload once. If persists, `rm -rf apps/admin-ui/.next` and `pnpm dev` again. |
| MetaMask "cannot set property ethereum" | another wallet extension (Auro, Phantom, etc.) is injecting first | disable conflicting extensions, hard reload. |
| `forge test` fails on `wrapping_add` | wrong nargo version pulled by `bbup` | `noirup -v 1.0.0-beta.15` and re-run. |
| `nargo compile` fails | nargo version mismatch | same fix. |
| `pnpm test:mem0` fails with `mem0 at … did not come up` | docker not running or container crashed | `docker compose -f services/mem0/server/docker-compose.yaml ps`, restart if needed. |
| `pnpm test:proof` slow | first proof gen always slow (CRS download + bb init) | wait. ~10-30s. Subsequent proofs ~5s. |

## Pointers

- `docs/SETUP.md` — the long-form runbook.
- `docs/SECURITY-GAPS.md` — open security gaps (status: many fixed, some explicitly deferred).
- `apps/gateway/README.md` — gateway internals, env vars, all four cryptographic gates.
- `circuits/README.md` — what the Noir proof attests to + the circuit's public-input layout.
- `contracts/README.md` — contract architecture, trust kernel, text-record schema.
