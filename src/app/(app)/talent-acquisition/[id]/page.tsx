import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { TaRequestDetailView } from "@/components/talent-acquisition/ta-request-detail-view";
import { can, hasUnrestrictedAccess } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { fetchTaRequest } from "@/server/talent-acquisition/actions";
import { taRequestQueryKey } from "@/server/talent-acquisition/query-key";
import { getTaRequestById } from "@/server/talent-acquisition/queries";

type TaRequestDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: TaRequestDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const request = await getTaRequestById(id);
  return { title: request ? `${request.positionName} — ${request.levelName}` : "Talent Acquisition" };
}

export default async function TaRequestDetailPage({ params }: TaRequestDetailPageProps) {
  const actor = await requirePermission("talent_acquisition:read");
  const { id } = await params;

  const request = await getTaRequestById(id);
  if (!request) notFound();

  const queryClient = new QueryClient();
  queryClient.setQueryData(taRequestQueryKey(id), request);
  await queryClient.prefetchQuery({ queryKey: taRequestQueryKey(id), queryFn: () => fetchTaRequest(id) });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title={`${request.positionName} — ${request.levelName}`} description={request.clientName} />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaRequestDetailView
          requestId={id}
          canWrite={can(actor, "talent_acquisition:write")}
          canEdit={can(actor, "talent_acquisition:edit")}
          canDelete={can(actor, "talent_acquisition:delete")}
          canL1Assess={can(actor, "talent_acquisition:l1_assess")}
          canL2Assess={can(actor, "talent_acquisition:l2_assess")}
          canFinalize={can(actor, "talent_acquisition:finalize")}
          canMigrate={can(actor, "talent_acquisition:migrate")}
          currentUserId={actor.id}
          hasOverrideAccess={hasUnrestrictedAccess(actor)}
        />
      </HydrationBoundary>
    </div>
  );
}
