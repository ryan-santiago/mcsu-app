import { UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { getStaffAugmentationEngagementById } from "@/server/staff-augmentation/queries";

type StaffAugmentationDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: StaffAugmentationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const engagement = await getStaffAugmentationEngagementById(id);
  return { title: engagement?.name ?? "Staff Augmentation" };
}

export default async function StaffAugmentationDetailPage({ params }: StaffAugmentationDetailPageProps) {
  await requirePermission("staff_augmentation:read");
  const { id } = await params;

  const engagement = await getStaffAugmentationEngagementById(id);
  if (!engagement) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title={engagement.name} />

      <EmptyState
        icon={UserRoundCog}
        title="Coming soon"
        description="Employee staffing and contract tracking for this engagement isn't built yet."
      />
    </div>
  );
}
