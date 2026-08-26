import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { CandidateProfileView } from "@/components/talent-acquisition/candidate-profile-view";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { fetchTaCandidateProfile } from "@/server/talent-acquisition/candidate-actions";
import { getTaCandidateProfile } from "@/server/talent-acquisition/candidate-queries";

type CandidateProfilePageProps = {
  params: Promise<{ candidateId: string }>;
};

export async function generateMetadata({ params }: CandidateProfilePageProps): Promise<Metadata> {
  const { candidateId } = await params;
  const profile = await getTaCandidateProfile(candidateId);
  return { title: profile ? formatEmployeeDisplayName(profile) : "Talent Pool" };
}

export default async function CandidateProfilePage({ params }: CandidateProfilePageProps) {
  const actor = await requirePermission("talent_acquisition:read");
  const { candidateId } = await params;

  const profile = await getTaCandidateProfile(candidateId);
  if (!profile) notFound();

  const queryClient = new QueryClient();
  queryClient.setQueryData(["ta-candidate-profile", candidateId], profile);
  await queryClient.prefetchQuery({
    queryKey: ["ta-candidate-profile", candidateId],
    queryFn: () => fetchTaCandidateProfile(candidateId),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title={formatEmployeeDisplayName(profile)} description="Talent pool profile" />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <CandidateProfileView candidateId={candidateId} canComment={can(actor, "talent_acquisition:write")} />
      </HydrationBoundary>
    </div>
  );
}
