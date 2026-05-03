"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { namehash } from "viem";
import { TxButton } from "@/components/tx-button";
import { WalletButton } from "@/components/wallet-button";
import type { WorkerInput, WorkerProgress } from "./proof-worker";

/**
 * /refresh - the user-side page where someone with a registered subname
 * exchanges a Google id-token for a fresh Noir proof and writes the
 * commitment to their `zkma:proof-commitment` ENS record.
 *
 * v0.1: paste-JWT (Google sign-in not yet wired). The flow is:
 *   1. Connect the wallet that owns your subname.
 *   2. Paste a Google ID token (from any sign-in flow you trust).
 *   3. Fetch Google's JWKS for the kid the token was signed with.
 *   4. Generate the Noir proof in a Web Worker (~10-30 seconds).
 *   5. The page computes the keccak commitment and offers a tx button
 *      that calls ZkmaResolver.setProofCommitment.
 *
 * The wallet-only check `setProofCommitment` is what the contract enforces -
 * the page does not need an admin connection.
 */

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

function parseJwt(jwt: string): { header: any; payload: any } | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const dec = (s: string) =>
      JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));
    return { header: dec(parts[0]!), payload: dec(parts[1]!) };
  } catch {
    return null;
  }
}

async function fetchJwksKey(kid: string): Promise<JsonWebKey | null> {
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) return null;
  const body = (await res.json()) as { keys: Array<JsonWebKey & { kid?: string }> };
  return body.keys.find((k) => k.kid === kid) ?? null;
}

type ProofState =
  | { kind: "idle" }
  | { kind: "running"; step: string }
  | {
      kind: "done";
      proofHex: `0x${string}`;
      publicInputsHex: `0x${string}`;
      commitment: `0x${string}`;
    }
  | { kind: "error"; message: string };

export default function RefreshPage() {
  const { address: connected } = useAccount();
  const [jwt, setJwt] = useState("");
  const [subname, setSubname] = useState("");
  const [state, setState] = useState<ProofState>({ kind: "idle" });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  const parsed = parseJwt(jwt);
  const subnameDot = subname.indexOf(".");
  const userLabel = subnameDot > 0 ? subname.slice(0, subnameDot) : "";
  const orgLabel =
    subnameDot > 0
      ? subname.slice(subnameDot + 1).replace(/\.eth$/, "")
      : "";

  async function handleGenerate() {
    if (!parsed) {
      setState({ kind: "error", message: "JWT not parseable" });
      return;
    }
    const kid = parsed.header.kid as string | undefined;
    if (!kid) {
      setState({ kind: "error", message: "JWT header missing kid" });
      return;
    }

    setState({ kind: "running", step: "fetching Google JWKS" });
    const pubkeyJwk = await fetchJwksKey(kid);
    if (!pubkeyJwk) {
      setState({
        kind: "error",
        message: `Google JWKS has no key with kid=${kid}; the token may be expired and Google rotated keys`,
      });
      return;
    }

    const email = parsed.payload.email as string | undefined;
    const aud = parsed.payload.aud as string | undefined;
    const iss = parsed.payload.iss as string | undefined;
    const iat = parsed.payload.iat as number | undefined;
    if (!email || !aud || !iss || !iat) {
      setState({
        kind: "error",
        message: "JWT payload missing email/aud/iss/iat",
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const iatLower = Math.min(iat, now - 60);
    const iatUpper = Math.max(iat, now);

    workerRef.current?.terminate();
    const worker = new Worker(new URL("./proof-worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<WorkerProgress>) => {
      const msg = ev.data;
      if (msg.kind === "progress") {
        setState({ kind: "running", step: msg.step });
      } else if (msg.kind === "done") {
        setState({
          kind: "done",
          proofHex: msg.proofHex,
          publicInputsHex: msg.publicInputsHex,
          commitment: msg.commitment,
        });
        worker.terminate();
      } else if (msg.kind === "error") {
        setState({ kind: "error", message: msg.message });
        worker.terminate();
      }
    };

    const input: WorkerInput = {
      jwt,
      pubkeyJwk,
      email: email.toLowerCase(),
      aud,
      iss,
      iatLower,
      iatUpper,
    };
    worker.postMessage(input);
    setState({ kind: "running", step: "starting worker" });
  }

  const orgNode32: `0x${string}` =
    orgLabel.length > 0
      ? (namehash(`${orgLabel}.eth`) as `0x${string}`)
      : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold tracking-tight text-lg">refresh proof</h1>
          <p className="text-[11px] text-zinc-500 font-mono">
            generate a fresh Noir proof from your Google id-token and write it to ENS
          </p>
        </div>
        <WalletButton />
      </header>

      <main className="flex-1 px-6 py-8 max-w-3xl w-full mx-auto space-y-6">
        {!connected && (
          <div className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
            Connect the wallet that owns your zkmemory subname before generating a proof.
          </div>
        )}

        <div className="grid grid-cols-[8rem_1fr] gap-y-3 text-xs items-baseline">
          <label className="text-zinc-500 font-mono">subname</label>
          <input
            value={subname}
            onChange={(e) => setSubname(e.target.value)}
            placeholder="aysel.zkmemory-istanbulhospital.eth"
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono"
          />

          <label className="text-zinc-500 font-mono">JWT</label>
          <textarea
            value={jwt}
            onChange={(e) => setJwt(e.target.value)}
            placeholder="paste a Google id-token (eyJhbGciOi...)"
            rows={6}
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono text-[11px]"
          />

          {parsed && (
            <>
              <label className="text-zinc-500 font-mono">parsed</label>
              <dl className="grid grid-cols-[5rem_1fr] gap-y-1 text-[11px] font-mono text-zinc-300">
                <dt className="text-zinc-500">email</dt>
                <dd>{parsed.payload.email ?? "-"}</dd>
                <dt className="text-zinc-500">aud</dt>
                <dd className="truncate">{parsed.payload.aud ?? "-"}</dd>
                <dt className="text-zinc-500">iss</dt>
                <dd>{parsed.payload.iss ?? "-"}</dd>
                <dt className="text-zinc-500">iat</dt>
                <dd>{parsed.payload.iat ?? "-"}</dd>
                <dt className="text-zinc-500">kid</dt>
                <dd>{parsed.header.kid ?? "-"}</dd>
              </dl>
            </>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={
            !connected ||
            !parsed ||
            !subname ||
            state.kind === "running"
          }
          className="rounded-md bg-emerald-500 text-zinc-950 hover:bg-emerald-400 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {state.kind === "running" ? "generating…" : "Generate proof"}
        </button>

        {state.kind === "running" && (
          <div className="rounded-lg border border-sky-800 bg-sky-950/30 px-4 py-3 text-xs text-sky-200 font-mono">
            {state.step}
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-lg border border-red-700 bg-red-950/30 px-4 py-3 text-xs text-red-200 font-mono">
            {state.message}
          </div>
        )}

        {state.kind === "done" && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-4 space-y-3">
            <div className="text-xs text-emerald-200">Proof generated. Commit it to ENS:</div>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-[10px] font-mono text-zinc-300">
              <dt className="text-zinc-500">commitment</dt>
              <dd className="truncate" title={state.commitment}>{state.commitment}</dd>
              <dt className="text-zinc-500">proof bytes</dt>
              <dd>{(state.proofHex.length - 2) / 2}</dd>
              <dt className="text-zinc-500">publicInputs</dt>
              <dd>{(state.publicInputsHex.length - 2) / 64} fields</dd>
            </dl>
            <TxButton
              functionName="setProofCommitment"
              args={[orgNode32, userLabel, state.commitment]}
              label="Write commitment to ENS"
              className="bg-sky-500 text-zinc-950 hover:bg-sky-400 px-4 py-2 text-sm"
              disabledReason={
                !userLabel
                  ? "subname missing user label"
                  : null
              }
            />
            <p className="text-[10px] text-zinc-500 font-mono">
              The tx button computes orgNode from your subname locally - if it fails with
              UserMissing, double-check the subname matches what your admin onboarded.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 px-6 py-3 text-[11px] text-zinc-500">
        v0.1 - paste-JWT only. Google Sign-In integration is the next step.
      </footer>
    </div>
  );
}
