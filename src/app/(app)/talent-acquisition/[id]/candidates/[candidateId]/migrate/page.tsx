import { UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { requirePermission } from "@/lib/session";
import { getTaCandidateById } from "@/server/talent-acquisition/candidate-queries";
import { getTaRequestById } from "@/server/talent-acquisition/queries";
import { listTaCandidateStages } from "@/server/talent-acquisition/stage-queries";
import { MigrateToEmployeeForm } from "@/components/talent-acquisition/migrate-to-employee-form";

type MigratePageProps = {
  params: Promise<{ id: string; candidateId: string }>;
};

export const metadata: Metadata = {
  title: "Migrate to Employee",
};

export default async function MigrateToEmployeePage({ params }: MigratePageProps) {
  await requirePermission("talent_acquisition:migrate");
  const { id: requestId, candidateId } = await params;

  const [candidate, request, stages] = await Promise.all([
    getTaCandidateById(candidateId),
    getTaRequestById(requestId),
    listTaCandidateStages(candidateId),
  ]);

  if (!candidate || !request || candidate.requestId !== requestId) notFound();

  const fullName = formatEmployeeDisplayName(candidate);
  const jobOfferPassed = stages.some((stage) => stage.stage === "job_offer" && stage.status === "passed");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={`Migrate ${fullName} to Employee`}
        description="Complete the details Talent Acquisition doesn't already capture, then create the Employee record."
      />

      {candidate.employeeId ? (
        <EmptyState
          icon={UserCheck}
          title="Already migrated"
          description={`${fullName} has already been migrated to Employee.`}
          action={
            <Button asChild size="sm">
              <Link href={`/talent-acquisition/${requestId}`}>Back to request</Link>
            </Button>
          }
        />
      ) : !jobOfferPassed ? (
        <EmptyState
          icon={UserCheck}
          title="Not ready to migrate yet"
          description="Job Offer must be marked passed for this candidate before they can be migrated to Employee."
          action={
            <Button asChild size="sm">
              <Link href={`/talent-acquisition/${requestId}`}>Back to request</Link>
            </Button>
          }
        />
      ) : (
        <MigrateToEmployeeForm
          requestId={requestId}
          candidate={candidate}
          clientId={request.clientId}
          clientName={request.clientName}
          positionName={request.positionName}
          levelName={request.levelName}
        />
      )}
    </div>
  );
}
