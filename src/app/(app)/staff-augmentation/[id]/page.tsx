import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { StaffAugmentationAssignmentsTable } from "@/components/staff-augmentation/staff-augmentation-assignments-table";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getStaffAugmentationEngagementById, listStaffAugmentationAssignments } from "@/server/staff-augmentation/queries";

type StaffAugmentationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: StaffAugmentationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const engagement = await getStaffAugmentationEngagementById(id);
  return { title: engagement?.name ?? "Staff Augmentation" };
}

export default async function StaffAugmentationDetailPage({ params }: StaffAugmentationDetailPageProps) {
  const actor = await requirePermission("staff_augmentation:read");
  const { id } = await params;

  const engagement = await getStaffAugmentationEngagementById(id);
  if (!engagement) notFound();

  const assignments = await listStaffAugmentationAssignments(id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={engagement.name} />

      <StaffAugmentationAssignmentsTable
        engagementId={id}
        assignments={assignments}
        canEdit={can(actor, "staff_augmentation:edit")}
        canDelete={can(actor, "staff_augmentation:delete")}
        canEditDeployment={can(actor, "employees:edit")}
      />
    </div>
  );
}
