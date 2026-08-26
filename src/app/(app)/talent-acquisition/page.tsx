import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TaRequestsView } from "@/components/talent-acquisition/ta-requests-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { fetchTaRequests } from "@/server/talent-acquisition/actions";
import { taRequestsQueryKey } from "@/server/talent-acquisition/query-key";

export const metadata: Metadata = {
  title: "Talent Acquisition",
};

export default async function TalentAcquisitionPage() {
  const actor = await requirePermission("talent_acquisition:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: taRequestsQueryKey(),
    queryFn: () => fetchTaRequests(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Talent Acquisition"
        description="Headcount requests and the candidates moving through the hiring pipeline."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaRequestsView canWrite={can(actor, "talent_acquisition:write")} />
      </HydrationBoundary>
    </div>
  );
}
