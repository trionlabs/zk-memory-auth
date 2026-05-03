"use client";

import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { sepoliaDeployment, ZkmaResolverAbi } from "@zkca/contracts-types";
import type { Abi } from "viem";
import { labelHash, shortAddr } from "@/lib/utils";
import { fetchOrgUserLabels, type OrgSummary } from "@/lib/users";
import { UserRow } from "./user-row";
import { RegisterUserForm } from "./register-user-form";
import { PartnersEditor } from "./partners-editor";

const RESOLVER = sepoliaDeployment.zkmaResolver;

type Props = {
  org: OrgSummary;
};

export function OrgCard({ org }: Props) {
  const { orgNode, admin: orgAdmin, label } = org;
  const ensName = `${label}.eth`;

  const { address: connected } = useAccount();
  const publicClient = usePublicClient();
  const isAdmin = !!connected && connected.toLowerCase() === orgAdmin.toLowerCase();

  const partnersQuery = useReadContract({
    address: RESOLVER,
    abi: ZkmaResolverAbi as Abi,
    functionName: "orgPartners",
    args: [orgNode],
  });

  const labelsQuery = useQuery({
    queryKey: ["org-user-labels", orgNode, RESOLVER],
    queryFn: () => fetchOrgUserLabels(publicClient!, orgNode),
    enabled: !!publicClient,
    staleTime: 15_000,
  });
  const allLabels = labelsQuery.data ?? [];

  const userLookups = useReadContracts({
    contracts: allLabels.map((l) => ({
      address: RESOLVER,
      abi: ZkmaResolverAbi as Abi,
      functionName: "users",
      args: [orgNode, labelHash(l)],
    })),
    query: { enabled: allLabels.length > 0 },
  });
  const matchedUserLabel = (() => {
    if (!connected || !userLookups.data) return null;
    for (let i = 0; i < allLabels.length; i++) {
      const r = userLookups.data[i];
      if (r?.status !== "success") continue;
      const u = r.result as readonly [`0x${string}`, ...unknown[]];
      if (u[0]?.toLowerCase() === connected.toLowerCase()) return allLabels[i];
    }
    return null;
  })();
  const isMember = isAdmin || matchedUserLabel !== null;

  const refresh = () => {
    partnersQuery.refetch();
    labelsQuery.refetch();
    userLookups.refetch();
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-mono text-base sm:text-lg">{ensName}</h2>
          <p className="text-[11px] text-zinc-500 font-mono">
            admin {shortAddr(orgAdmin)}
            {isAdmin && <span className="ml-2 text-emerald-400">· you</span>}
          </p>
        </div>
        <a
          href={`https://sepolia.app.ens.domains/${ensName}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
        >
          ens app ↗
        </a>
      </header>

      <PartnersEditor
        orgNode={orgNode}
        current={(partnersQuery.data as string) ?? ""}
        canEdit={isAdmin}
        onConfirmed={refresh}
      />

      {isMember ? (
        <>
          <div className="space-y-3">
            {(isAdmin ? allLabels : [matchedUserLabel!]).map((l) => (
              <UserRow key={l} orgNode={orgNode} orgAdmin={orgAdmin} userLabel={l} ensName={`${l}.${ensName}`} />
            ))}
            {isAdmin && allLabels.length === 0 && (
              <p className="text-xs text-zinc-500 italic">
                {labelsQuery.isLoading ? "loading roster…" : "No users registered yet."}
              </p>
            )}
          </div>
          {isAdmin && <RegisterUserForm orgNode={orgNode} onConfirmed={refresh} />}
        </>
      ) : (
        <p className="text-xs text-zinc-500 italic">
          Connect as the org admin or one of its users to view roster details. Records are
          public on-chain — anyone can verify them by querying ENS directly — but this UI
          declines to publish the directory.
        </p>
      )}
    </section>
  );
}
