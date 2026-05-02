"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { fetchOrgs } from "@/lib/users";
import { OrgCard } from "./org-card";
import { CreateOrgForm } from "./create-org-form";

export function OrgList() {
  const publicClient = usePublicClient();
  const orgsQuery = useQuery({
    queryKey: ["orgs"],
    queryFn: () => fetchOrgs(publicClient!),
    enabled: !!publicClient,
    staleTime: 10_000,
  });

  return (
    <div className="space-y-6">
      <CreateOrgForm onCreated={() => orgsQuery.refetch()} />

      {orgsQuery.isLoading && (
        <div className="text-xs text-zinc-500 italic">discovering registered orgs…</div>
      )}

      {orgsQuery.isSuccess && orgsQuery.data.length === 0 && (
        <div className="text-xs text-zinc-500 italic">
          No organizations registered yet. Use the form above to create one.
        </div>
      )}

      <div className="grid gap-6">
        {orgsQuery.data?.map((org) => (
          <OrgCard key={org.orgNode} org={org} />
        ))}
      </div>
    </div>
  );
}
