import { UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { requirePermission } from "@/lib/session";
import { getTaApplicationById } from "@/server/talent-acquisition/application-queries";
import { getTaRequestById } from "@/server/talent-acquisition/queries";
import { listTaApplicationStages } from "@/server/talent-acquisition/stage-queries";
import { MigrateToEmployeeForm } from "@/components/talent-acquisition/migrate-to-employee-form";

type MigratePageProps = {
  params: Promise<{ id: string; applicationId: string }>;
};

export const metadata: Metadata = {
  title: "Migrate to Employee",
};

export default async function MigrateToEmployeePage({ params }: MigratePageProps) {
  await requirePermission("talent_acquisition:migrate");
  const { id: requestId, applicationId } = await params;

  const [application, request, stages] = await Promise.all([
    getTaApplicationById(applicationId),
    getTaRequestById(requestId),
    listTaApplicationStages(applicationId),
  ]);

  if (!application || !request || application.requestId !== requestId) notFound();

  const fullName = formatEmployeeDisplayName(application);
  const finalInterviewPassed = stages.some((stage) => stage.stage === "final_interview" && stage.status === "passed");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={`Migrate ${fullName} to Employee`}
        description="Complete the details Talent Acquisition doesn't already capture, then create the Employee record."
      />

      {application.employeeId ? (
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
      ) : !finalInterviewPassed ? (
        <EmptyState
          icon={UserCheck}
          title="Not ready to migrate yet"
          description="Final Interview must be marked passed for this candidate before they can be migrated to Employee."
          action={
            <Button asChild size="sm">
              <Link href={`/talent-acquisition/${requestId}`}>Back to request</Link>
            </Button>
          }
        />
      ) : (
        <MigrateToEmployeeForm
          requestId={requestId}
          application={application}
          clientId={request.clientId}
          clientName={request.clientName}
          positionName={request.positionName}
          levelName={request.levelName}
        />
      )}
    </div>
  );
}
