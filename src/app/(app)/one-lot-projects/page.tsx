import { Kanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listVisibleOneLotProjects } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = {
  title: "One-Lot Projects",
};

export default async function OneLotProjectsPage() {
  const actor = await requirePermission("one_lot_projects:read");
  const projects = await listVisibleOneLotProjects();
  const canCreate = can(actor, "one_lot_projects:write");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="One-Lot Projects"
        description="Summary, backlog, board and calendar for each project."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/one-lot-projects/new">Add project</Link>
            </Button>
          ) : null
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="No projects yet"
          description={
            canCreate
              ? "Add one to start tracking it here."
              : "No projects have been created yet."
          }
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/one-lot-projects/new">Add project</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/one-lot-projects/${project.id}/dashboard`}
                className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors"
              >
                <Kanban className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="truncate">{project.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
