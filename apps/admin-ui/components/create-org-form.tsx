"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { sepoliaDeployment, ZkmaResolverAbi } from "@zkca/contracts-types";
import { keccak256, namehash, stringToBytes, type Abi } from "viem";

const RESOLVER = sepoliaDeployment.zkmaResolver;
const NAME_WRAPPER = sepoliaDeployment.nameWrapper;
const BASE_REGISTRAR = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85" as `0x${string}`;
const PREFIX = sepoliaDeployment.requiredPrefix;
// CANNOT_UNWRAP fuse — burning it during wrap is required to set fuses on children later,
// and it makes the wrap permanent (exactly what we want for an org's identity name).
const CANNOT_UNWRAP = 1;

// Minimal NameWrapper ABI — just the bits we touch from the UI.
const NameWrapperAbi = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "wrapETH2LD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "wrappedOwner", type: "address" },
      { name: "ownerControlledFuses", type: "uint16" },
      { name: "resolver", type: "address" },
    ],
    outputs: [{ name: "expires", type: "uint64" }],
  },
] as const;

const BaseRegistrarAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

type Props = {
  onCreated: () => void;
};

export function CreateOrgForm({ onCreated }: Props) {
  const { address: connected } = useAccount();
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState("");

  const fullLabel = orgName ? `${PREFIX}${orgName}` : "";
  const ensName = fullLabel ? `${fullLabel}.eth` : "";
  const orgNode = ensName
    ? (namehash(ensName) as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);
  const labelHash = fullLabel
    ? (keccak256(stringToBytes(fullLabel)) as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

  const ZERO = "0x0000000000000000000000000000000000000000";

  // NameWrapper.ownerOf returns 0 for unregistered AND unwrapped names. To distinguish
  // "doesn't exist" from "exists but not wrapped" we also query BaseRegistrar (the .eth
  // NFT). The state machine:
  //   - both 0/error           → not registered
  //   - BaseRegistrar=me, Wrapper=0 → registered, NOT wrapped (offer wrap)
  //   - Wrapper=me              → registered + wrapped (proceed)
  const wrapperOwnerQuery = useReadContract({
    address: NAME_WRAPPER as `0x${string}`,
    abi: NameWrapperAbi,
    functionName: "ownerOf",
    args: [BigInt(orgNode)],
    query: { enabled: !!orgName, retry: false, refetchInterval: 8_000 },
  });
  const baseOwnerQuery = useReadContract({
    address: BASE_REGISTRAR,
    abi: BaseRegistrarAbi,
    functionName: "ownerOf",
    args: [BigInt(labelHash)],
    query: { enabled: !!orgName, retry: false, refetchInterval: 8_000 },
  });

  const rawWrapperOwner = wrapperOwnerQuery.data as `0x${string}` | undefined;
  const wrapperOwner =
    rawWrapperOwner && rawWrapperOwner.toLowerCase() !== ZERO ? rawWrapperOwner : null;
  const baseOwner = baseOwnerQuery.data as `0x${string}` | undefined;
  const baseOwnsName =
    !!baseOwner && !!connected && baseOwner.toLowerCase() === connected.toLowerCase();
  const wrapperOwnsName =
    !!wrapperOwner && !!connected && wrapperOwner.toLowerCase() === connected.toLowerCase();
  const isRegistered = !!baseOwner || !!wrapperOwner; // wrapper owns it via BaseRegistrar when wrapped
  const needsWrap = baseOwnsName && !wrapperOwner;

  // BaseRegistrar approval (needed before NameWrapper can take possession to wrap).
  const baseApprovalQuery = useReadContract({
    address: BASE_REGISTRAR,
    abi: BaseRegistrarAbi,
    functionName: "isApprovedForAll",
    args: [(connected ?? ZERO) as `0x${string}`, NAME_WRAPPER as `0x${string}`],
    query: { enabled: !!connected },
  });
  const baseApproved = baseApprovalQuery.data === true;

  const baseApproveTx = useWriteContract();
  const baseApproveReceipt = useWaitForTransactionReceipt({ hash: baseApproveTx.data });
  useEffect(() => {
    if (baseApproveReceipt.isSuccess) baseApprovalQuery.refetch();
  }, [baseApproveReceipt.isSuccess, baseApprovalQuery]);

  // Wrap tx.
  const wrapTx = useWriteContract();
  const wrapReceipt = useWaitForTransactionReceipt({ hash: wrapTx.data });
  useEffect(() => {
    if (wrapReceipt.isSuccess) {
      wrapperOwnerQuery.refetch();
      baseOwnerQuery.refetch();
    }
  }, [wrapReceipt.isSuccess, wrapperOwnerQuery, baseOwnerQuery]);

  // NameWrapper approval (needed before our resolver can mint sub-subnames).
  const approvalQuery = useReadContract({
    address: NAME_WRAPPER as `0x${string}`,
    abi: NameWrapperAbi,
    functionName: "isApprovedForAll",
    args: [(connected ?? ZERO) as `0x${string}`, RESOLVER],
    query: { enabled: !!connected },
  });
  const approved = approvalQuery.data === true;

  const approveTx = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approveTx.data });
  useEffect(() => {
    if (approveReceipt.isSuccess) approvalQuery.refetch();
  }, [approveReceipt.isSuccess, approvalQuery]);

  // Register org tx.
  const registerTx = useWriteContract();
  const registerReceipt = useWaitForTransactionReceipt({ hash: registerTx.data });
  useEffect(() => {
    if (registerReceipt.isSuccess) {
      onCreated();
      setOrgName("");
      setOpen(false);
    }
  }, [registerReceipt.isSuccess, onCreated]);

  if (!connected) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500 italic">
        Connect a wallet to register an organization.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
      >
        + Create your organization
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">Register a new organization</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">cancel</button>
      </div>

      <ol className="text-xs text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
        <li>
          Register your <code className="text-zinc-200">{PREFIX}&lt;orgname&gt;.eth</code> on{" "}
          <a href="https://sepolia.app.ens.domains" target="_blank" rel="noreferrer" className="underline hover:text-zinc-200">sepolia.app.ens.domains</a>{" "}
          (~5 min, free with a Sepolia faucet).
        </li>
        <li>If your name isn&apos;t already wrapped, wrap it (two txs: approve BaseRegistrar, then wrap).</li>
        <li>Approve this app as operator on NameWrapper (one tx).</li>
        <li>Register the org with the resolver — sets resolver, marks org active, emits event (one tx).</li>
      </ol>

      <div className="grid grid-cols-[6.5rem_1fr] gap-y-2 text-xs items-center">
        <label className="text-zinc-500 font-mono">org name</label>
        <div className="flex items-baseline gap-1 font-mono bg-zinc-900 border border-zinc-700 rounded px-2 py-1">
          <span className="text-zinc-500">{PREFIX}</span>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="myhospital"
            className="flex-1 bg-transparent outline-none text-zinc-100"
          />
          <span className="text-zinc-500">.eth</span>
        </div>

        <label className="text-zinc-500 font-mono">ownership</label>
        <div className="text-[11px] font-mono leading-relaxed">
          {!orgName && <span className="text-zinc-600">enter a name above</span>}
          {orgName && (wrapperOwnerQuery.isLoading || baseOwnerQuery.isLoading) && (
            <span className="text-zinc-500">checking…</span>
          )}
          {orgName && !wrapperOwnerQuery.isLoading && !baseOwnerQuery.isLoading && !isRegistered && (
            <span className="text-yellow-400">
              not registered —{" "}
              <a
                href={`https://sepolia.app.ens.domains/${ensName}`}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-yellow-300"
              >
                register {ensName} on Sepolia ENS app ↗
              </a>
            </span>
          )}
          {orgName && wrapperOwner && wrapperOwnsName && (
            <span className="text-emerald-400">✓ you own {ensName} (wrapped)</span>
          )}
          {orgName && wrapperOwner && !wrapperOwnsName && (
            <span className="text-red-400">
              wrapped owner is {wrapperOwner.slice(0, 6)}…{wrapperOwner.slice(-4)} (not your wallet)
            </span>
          )}
          {orgName && !wrapperOwner && needsWrap && (
            <span className="text-sky-400">
              registered to your wallet but <strong>not wrapped</strong> — wrap below to continue
            </span>
          )}
          {orgName && !wrapperOwner && baseOwner && !baseOwnsName && (
            <span className="text-red-400">
              registered to {baseOwner.slice(0, 6)}…{baseOwner.slice(-4)} (not your wallet)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {needsWrap && (
          <>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono w-32 text-zinc-500">step 2a — approve</span>
              {baseApproved ? (
                <span className="text-emerald-400 text-xs">✓ BaseRegistrar approved</span>
              ) : (
                <button
                  onClick={() =>
                    baseApproveTx.writeContract({
                      address: BASE_REGISTRAR,
                      abi: BaseRegistrarAbi,
                      functionName: "setApprovalForAll",
                      args: [NAME_WRAPPER as `0x${string}`, true],
                    })
                  }
                  disabled={baseApproveTx.isPending || baseApproveReceipt.isLoading}
                  className="rounded bg-sky-500 text-zinc-950 px-3 py-1 text-xs font-medium hover:bg-sky-400 disabled:opacity-50"
                >
                  {baseApproveTx.isPending
                    ? "Confirm in wallet…"
                    : baseApproveReceipt.isLoading
                      ? "Mining…"
                      : "Approve BaseRegistrar"}
                </button>
              )}
              {baseApproveTx.error && (
                <span className="text-red-400 text-[10px]">{baseApproveTx.error.message.split("\n")[0]}</span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono w-32 text-zinc-500">step 2b — wrap</span>
              <button
                onClick={() =>
                  wrapTx.writeContract({
                    address: NAME_WRAPPER as `0x${string}`,
                    abi: NameWrapperAbi,
                    functionName: "wrapETH2LD",
                    args: [fullLabel, connected!, CANNOT_UNWRAP, ZERO as `0x${string}`],
                  })
                }
                disabled={wrapTx.isPending || wrapReceipt.isLoading || !baseApproved}
                title={!baseApproved ? "approve BaseRegistrar first" : undefined}
                className="rounded bg-sky-500 text-zinc-950 px-3 py-1 text-xs font-medium hover:bg-sky-400 disabled:opacity-50"
              >
                {wrapTx.isPending
                  ? "Confirm in wallet…"
                  : wrapReceipt.isLoading
                    ? "Mining…"
                    : `Wrap ${ensName}`}
              </button>
              {wrapTx.error && (
                <span className="text-red-400 text-[10px]">{wrapTx.error.message.split("\n")[0]}</span>
              )}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono w-32 text-zinc-500">step 3 — approve</span>
          {approved ? (
            <span className="text-emerald-400 text-xs">✓ approved</span>
          ) : (
            <button
              onClick={() =>
                approveTx.writeContract({
                  address: NAME_WRAPPER as `0x${string}`,
                  abi: NameWrapperAbi,
                  functionName: "setApprovalForAll",
                  args: [RESOLVER, true],
                })
              }
              disabled={approveTx.isPending || approveReceipt.isLoading || !wrapperOwnsName}
              title={!wrapperOwnsName ? "wrap the name first" : undefined}
              className="rounded bg-emerald-500 text-zinc-950 px-3 py-1 text-xs font-medium hover:bg-emerald-400 disabled:opacity-50"
            >
              {approveTx.isPending
                ? "Confirm in wallet…"
                : approveReceipt.isLoading
                  ? "Mining…"
                  : "Approve NameWrapper"}
            </button>
          )}
          {approveTx.error && (
            <span className="text-red-400 text-[10px]">{approveTx.error.message.split("\n")[0]}</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono w-32 text-zinc-500">step 4 — register</span>
          <button
            onClick={() =>
              registerTx.writeContract({
                address: RESOLVER,
                abi: ZkmaResolverAbi as Abi,
                functionName: "registerOrg",
                args: [fullLabel],
              })
            }
            disabled={
              registerTx.isPending ||
              registerReceipt.isLoading ||
              !wrapperOwnsName ||
              !approved ||
              !orgName
            }
            className="rounded bg-emerald-500 text-zinc-950 px-3 py-1 text-xs font-medium hover:bg-emerald-400 disabled:opacity-50"
            title={
              !wrapperOwnsName
                ? "wrap the name first"
                : !approved
                  ? "approve NameWrapper first"
                  : undefined
            }
          >
            {registerTx.isPending
              ? "Confirm in wallet…"
              : registerReceipt.isLoading
                ? "Mining…"
                : registerReceipt.isSuccess
                  ? "Registered ✓"
                  : `Register ${fullLabel || PREFIX + "…"}.eth`}
          </button>
          {registerTx.error && (
            <span className="text-red-400 text-[10px]">{registerTx.error.message.split("\n")[0]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
