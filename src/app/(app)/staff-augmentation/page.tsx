import { UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listStaffAugmentationEngagements } from "@/server/staff-augmentation/queries";

export const metadata: Metadata = {
  title: "Staff Augmentation",
};

export default async function StaffAugmentationPage() {
  const actor = await requirePermission("staff_augmentation:read");
  const engagements = await listStaffAugmentationEngagements();
  const canCreate = can(actor, "staff_augmentation:write");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Staff Augmentation"
        description="Which employees are staffed on each engagement, and their contract status."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/staff-augmentation/new">Add engagement</Link>
            </Button>
          ) : null
        }
      />

      {engagements.length === 0 ? (
        <EmptyState
          icon={UserRoundCog}
          title="No engagements yet"
          description={
            canCreate
              ? "Add one to start tracking staffing and contracts for it."
              : "None have been added yet."
          }
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/staff-augmentation/new">Add engagement</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {engagements.map((engagement) => (
            <li key={engagement.id}>
              <Link
                href={`/staff-augmentation/${engagement.id}`}
                className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors"
              >
                <UserRoundCog className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="truncate">{engagement.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
