import Link from "next/link";
import { sepoliaDeployment } from "@zkma/contracts-types";
import { OrgList } from "@/components/org-list";
import { WalletButton } from "@/components/wallet-button";

export default function Home() {
  const { zkmaResolver, requiredPrefix } = sepoliaDeployment;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-semibold tracking-tight text-lg">zkmemoryauthorization · admin</h1>
          <p className="text-[11px] text-zinc-500 font-mono">
            sepolia · resolver{" "}
            <a
              href={`https://sepolia.etherscan.io/address/${zkmaResolver}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 underline underline-offset-2"
            >
              {zkmaResolver}
            </a>{" "}
            · prefix <code className="text-zinc-300">{requiredPrefix}</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/refresh"
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition"
          >
            refresh proof →
          </Link>
          <WalletButton />
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto space-y-6">
        <p className="text-sm text-zinc-400 max-w-2xl">
          Each organization owns its own <code className="text-zinc-300">{requiredPrefix}&lt;name&gt;.eth</code>{" "}
          on Sepolia. Users get real wrapped subnames they can show in any ENS-aware tool.
          Org admins drive registration, role updates, and revocation directly from this UI.
        </p>
        <p className="text-xs text-zinc-500 max-w-2xl border-l-2 border-zinc-800 pl-3">
          Records are deliberately readable on-chain via standard ENS lookup — that&apos;s how
          the gateway verifies access trustlessly. This UI gates roster enumeration to org
          admins so the operator doesn&apos;t double as a staff directory.
        </p>

        <OrgList />
      </main>

      <footer className="border-t border-zinc-900 px-6 py-3 text-[11px] text-zinc-500">
        Programmable, portable, verifiable authorization for AI agent memory — anchored on ENS.
      </footer>
    </div>
  );
}
