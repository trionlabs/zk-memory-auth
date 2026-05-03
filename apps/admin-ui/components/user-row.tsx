"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { sepoliaDeployment, ZkmaResolverAbi } from "@zkma/contracts-types";
import { keccak256, toBytes, type Abi } from "viem";
import { fmtExpiry, labelHash, shortAddr } from "@/lib/utils";
import { TxButton } from "./tx-button";

const RESOLVER = sepoliaDeployment.zkmaResolver;

type UserRowProps = {
  orgNode: `0x${string}`;
  orgAdmin: `0x${string}`;
  userLabel: string;
  ensName?: string;
};

export function UserRow({ orgNode, orgAdmin, userLabel, ensName }: UserRowProps) {
  const { address: connected } = useAccount();
  const isAdmin = !!connected && connected.toLowerCase() === orgAdmin.toLowerCase();

  const userQuery = useReadContract({
    address: RESOLVER,
    abi: ZkmaResolverAbi as Abi,
    functionName: "users",
    args: [orgNode, labelHash(userLabel)],
  });

  // returns [userAddr, role, namespaces, maxTag, expiry, revoked, exists, proofCommitment, emailHash]
  const data = userQuery.data as
    | readonly [
        `0x${string}`,
        string,
        string,
        string,
        bigint,
        boolean,
        boolean,
        `0x${string}`,
        `0x${string}`,
      ]
    | undefined;

  const [edit, setEdit] = useState(false);
  const [role, setRole] = useState("");
  const [namespaces, setNamespaces] = useState("");
  const [maxTag, setMaxTag] = useState("");
  const [expiry, setExpiry] = useState("");

  function startEdit() {
    if (!data) return;
    setRole(data[1]);
    setNamespaces(data[2]);
    setMaxTag(data[3]);
    setExpiry(String(data[4]));
    setEdit(true);
  }

  // Hide rows when no data yet — the loading flicker would only matter to non-admins,
  // and they shouldn't see the roster anyway.
  if (!data || !data[6]) return null;

  const [userAddr, currentRole, currentNs, currentMaxTag, currentExpiry, revoked, , commit, emailHash] = data;
  const isUser = !!connected && connected.toLowerCase() === userAddr.toLowerCase();

  // Gate: only render the row when the connected wallet is allowed to see / act on it.
  // Anyone can still query the same record directly via ENS (text records are public
  // on-chain by design — that's what makes the gateway trustlessly verifiable); this
  // UI just declines to publish the roster as a directory.
  if (!isAdmin && !isUser) return null;

  return (
    <div className={`rounded-lg border p-4 transition ${revoked ? "border-red-800/50 bg-red-950/20" : "border-zinc-800 bg-zinc-900/60"}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="font-mono text-sm">
            {userLabel}
            {revoked && <span className="ml-2 text-[10px] uppercase tracking-wider text-red-400">revoked</span>}
            {isAdmin && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-400">you can edit</span>}
            {isUser && <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-400">your wallet</span>}
          </div>
          {ensName && (
            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
              <a
                href={`https://sepolia.app.ens.domains/${ensName}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-300 underline underline-offset-2"
              >
                {ensName} ↗
              </a>
            </div>
          )}
          <div className="text-[10px] text-zinc-500 font-mono">
            wallet {shortAddr(userAddr)}
          </div>
        </div>
        {isAdmin && !revoked && !edit && (
          <div className="flex gap-2">
            <button
              onClick={startEdit}
              className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
            >
              Edit
            </button>
            <TxButton
              functionName="revokeUser"
              args={[orgNode, userLabel]}
              label="Revoke"
              className="bg-red-600 text-white hover:bg-red-500 px-2 py-1 text-xs"
              onConfirmed={() => userQuery.refetch()}
            />
          </div>
        )}
      </div>

      {!edit ? (
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs font-mono">
          <dt className="text-zinc-500">role</dt>
          <dd>{currentRole}</dd>
          <dt className="text-zinc-500">namespaces</dt>
          <dd>{currentNs}</dd>
          <dt className="text-zinc-500">max-tag</dt>
          <dd>{currentMaxTag}</dd>
          <dt className="text-zinc-500">expiry</dt>
          <dd>{fmtExpiry(currentExpiry)}</dd>
          <dt className="text-zinc-500">email-hash</dt>
          <dd className="truncate" title={emailHash}>
            {emailHash === "0x0000000000000000000000000000000000000000000000000000000000000000"
              ? "— (not set)"
              : `${emailHash.slice(0, 14)}…`}
          </dd>
          <dt className="text-zinc-500">commitment</dt>
          <dd className="truncate" title={commit}>{commit === "0x0000000000000000000000000000000000000000000000000000000000000000" ? "— (no proof yet)" : `${commit.slice(0, 14)}…`}</dd>
        </dl>
      ) : (
        <div className="grid grid-cols-[7rem_1fr] gap-y-2 text-xs items-center">
          <label className="text-zinc-500 font-mono">role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono" />
          <label className="text-zinc-500 font-mono">namespaces</label>
          <input value={namespaces} onChange={(e) => setNamespaces(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono" />
          <label className="text-zinc-500 font-mono">max-tag</label>
          <select value={maxTag} onChange={(e) => setMaxTag(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono">
            <option value="public">public</option>
            <option value="internal">internal</option>
            <option value="confidential">confidential</option>
            <option value="restricted">restricted</option>
          </select>
          <label className="text-zinc-500 font-mono">expiry</label>
          <input value={expiry} onChange={(e) => setExpiry(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono" />
          <div />
          <div className="flex gap-2 pt-1">
            <TxButton
              functionName="updateUser"
              args={[orgNode, userLabel, role, namespaces, maxTag, BigInt(expiry || "0")]}
              label="Save"
              className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 px-3 py-1 text-xs"
              onConfirmed={() => {
                userQuery.refetch();
                setEdit(false);
              }}
            />
            <button
              onClick={() => setEdit(false)}
              className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isAdmin && !revoked && !edit && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <RotateEmailHashInline
            orgNode={orgNode}
            userLabel={userLabel}
            current={emailHash}
            onConfirmed={() => userQuery.refetch()}
          />
        </div>
      )}

      {isUser && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <ProofCommitmentInline
            orgNode={orgNode}
            userLabel={userLabel}
            current={commit}
            onConfirmed={() => userQuery.refetch()}
          />
        </div>
      )}
    </div>
  );
}

function RotateEmailHashInline({
  orgNode,
  userLabel,
  current,
  onConfirmed,
}: {
  orgNode: `0x${string}`;
  userLabel: string;
  current: `0x${string}`;
  onConfirmed: () => void;
}) {
  const [email, setEmail] = useState("");
  const trimmed = email.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const newHash = ok
    ? (keccak256(toBytes(trimmed)) as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);
  const sameAsCurrent = ok && newHash.toLowerCase() === current.toLowerCase();
  const disableReason = !ok
    ? "type a valid email"
    : sameAsCurrent
      ? "no change"
      : null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 font-mono w-28">rotate email</span>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="new@hospital.org"
        className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono text-[11px]"
      />
      <TxButton
        functionName="setEmailHash"
        args={[orgNode, userLabel, newHash]}
        label="Rotate"
        className="bg-amber-500 text-zinc-950 hover:bg-amber-400 px-3 py-1 text-xs"
        disabledReason={disableReason}
        onConfirmed={() => {
          setEmail("");
          onConfirmed();
        }}
      />
    </div>
  );
}

function ProofCommitmentInline({
  orgNode,
  userLabel,
  current,
  onConfirmed,
}: {
  orgNode: `0x${string}`;
  userLabel: string;
  current: `0x${string}`;
  onConfirmed: () => void;
}) {
  const [val, setVal] = useState(
    current && current !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ? current
      : "",
  );
  const valid = /^0x[0-9a-fA-F]{64}$/.test(val);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 font-mono w-28">proof commit</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="0x… (32-byte hex)"
        className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono text-[11px]"
      />
      <TxButton
        functionName="setProofCommitment"
        args={[orgNode, userLabel, val as `0x${string}`]}
        label="Save"
        className="bg-sky-500 text-zinc-950 hover:bg-sky-400 px-3 py-1 text-xs"
        disabledReason={valid ? null : "enter a 0x-prefixed 32-byte hex value"}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}
