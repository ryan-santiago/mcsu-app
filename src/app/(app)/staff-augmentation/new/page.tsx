import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { StaffAugmentationForm } from "@/components/staff-augmentation/staff-augmentation-form";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add engagement",
};

export default async function NewStaffAugmentationEngagementPage() {
  await requirePermission("staff_augmentation:write");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title="Add engagement" description="Name it — you can build out staffing and contracts once it exists." />

      <StaffAugmentationForm />
    </div>
  );
}
