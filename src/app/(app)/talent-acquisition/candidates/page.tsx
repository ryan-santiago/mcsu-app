import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { CandidatePoolView } from "@/components/talent-acquisition/candidate-pool-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { fetchTaCandidatesPage } from "@/server/talent-acquisition/candidate-actions";
import type { TaCandidateFilters } from "@/server/talent-acquisition/candidate-types";

export const metadata: Metadata = {
  title: "Talent Pool",
};

const INITIAL_FILTERS: TaCandidateFilters = {};

export default async function TalentAcquisitionCandidatesPage() {
  const actor = await requirePermission("talent_acquisition:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: ["ta-candidate-pool", INITIAL_FILTERS],
    queryFn: () => fetchTaCandidatesPage(INITIAL_FILTERS),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title="Talent Pool" description="Every candidate ever sourced, independent of any single request." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CandidatePoolView initialFilters={INITIAL_FILTERS} canWrite={can(actor, "talent_acquisition:write")} />
      </HydrationBoundary>
    </div>
  );
}
