import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectForm } from "@/components/one-lot-projects/one-lot-project-form";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add project",
};

export default async function NewOneLotProjectPage() {
  await requirePermission("one_lot_projects:write");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="Add project"
        description="Name it — its Dashboard, List, Kanban Board and Calendar pages are created automatically."
      />

      <OneLotProjectForm />
    </div>
  );
}
