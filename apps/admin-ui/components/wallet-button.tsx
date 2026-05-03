"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddr } from "@/lib/utils";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending, error } = useConnect();
  const { disconnect, disconnectAsync } = useDisconnect();

  if (isConnected) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-mono hover:bg-zinc-800 transition"
        title="Click to disconnect"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-2 align-middle" />
        {shortAddr(address)}
      </button>
    );
  }

  // Prefer MetaMask among the injected providers if multiple wallets are
  // installed (Keplr, Leap, etc. otherwise win the generic `injected` slot).
  const metamask = connectors.find((c) => c.id === "io.metamask");
  const injected = metamask ?? connectors.find((c) => c.type === "injected") ?? connectors[0];

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={async () => {
          if (!injected) {
            alert("No injected connector found. Install MetaMask?");
            return;
          }
          try {
            await connectAsync({ connector: injected });
          } catch (e) {
            const msg = (e as Error).message ?? "";
            // Stale dev-session: wagmi storage says connected, React state says
            // not. Disconnect to clear the storage flag and retry once.
            if (msg.toLowerCase().includes("already connected")) {
              await disconnectAsync().catch(() => {});
              await connectAsync({ connector: injected }).catch(() => {});
            }
          }
        }}
        disabled={isPending}
        className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 transition disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && (
        <p className="text-[10px] text-red-400 font-mono max-w-xs text-right">
          {error.message}
        </p>
      )}
    </div>
  );
}
