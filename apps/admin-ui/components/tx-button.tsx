"use client";

import { useEffect, type ReactNode } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { sepoliaDeployment, ZkmaResolverAbi } from "@zkca/contracts-types";
import type { Abi } from "viem";

type Args = unknown[];

type TxButtonProps = {
  functionName: string;
  args: Args;
  label: string;
  className?: string;
  /** Disable the button (e.g., not connected as the right wallet). */
  disabledReason?: string | null;
  /** Called once the tx is confirmed onchain. Use this to refresh local state. */
  onConfirmed?: () => void;
  children?: ReactNode;
};

const RESOLVER_ADDR = sepoliaDeployment.zkmaResolver;

export function TxButton({
  functionName,
  args,
  label,
  className = "",
  disabledReason,
  onConfirmed,
}: TxButtonProps) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      onConfirmed?.();
      const t = setTimeout(() => reset(), 4000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, onConfirmed, reset]);

  const send = () =>
    writeContract({
      address: RESOLVER_ADDR,
      abi: ZkmaResolverAbi as Abi,
      functionName,
      args,
    });

  const disabled = !!disabledReason || isPending || isMining;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={send}
        disabled={disabled}
        title={disabledReason ?? undefined}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${className || "bg-zinc-100 text-zinc-950 hover:bg-white"}`}
      >
        {isPending
          ? "Confirm in wallet…"
          : isMining
            ? "Mining…"
            : isSuccess
              ? `${label} ✓`
              : label}
      </button>
      {hash && (
        <a
          href={`https://sepolia.etherscan.io/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono truncate"
        >
          {hash.slice(0, 12)}…
        </a>
      )}
      {error && (
        <p className="text-[10px] text-red-400 line-clamp-2">{error.message.split("\n")[0]}</p>
      )}
    </div>
  );
}
