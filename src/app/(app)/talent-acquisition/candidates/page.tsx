import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { CandidatePoolView } from "@/components/talent-acquisition/candidate-pool-view";
import { requirePermission } from "@/lib/session";
import { fetchTaCandidatePool } from "@/server/talent-acquisition/candidate-actions";

export const metadata: Metadata = {
  title: "Talent Pool",
};

export default async function TalentAcquisitionCandidatesPage() {
  await requirePermission("talent_acquisition:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({ queryKey: ["ta-candidate-pool", ""], queryFn: () => fetchTaCandidatePool("") });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title="Talent Pool" description="Every candidate ever sourced, independent of any single request." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CandidatePoolView />
      </HydrationBoundary>
    </div>
  );
}
