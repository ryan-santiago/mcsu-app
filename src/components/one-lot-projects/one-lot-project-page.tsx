import type { LucideIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

type OneLotProjectPageShellProps = {
  projectId: string;
  /** Which of the still-placeholder pages this is — shown as the page header's subtitle. */
  pageTitle: string;
  icon: LucideIcon;
  description: string;
};

/**
 * Shared guard + blank-content shell for the still-placeholder One-Lot
 * Project pages (Calendar) — identical access check and layout, differing
 * only in copy. Summary, Backlog, and Kanban Board have all moved off this
 * shell now that they have real content. `getOneLotProjectById` returning
 * `null` covers both "doesn't exist" and "you're not a member", same as
 * `getEmployeeById`'s team scoping — either way this is a 404, not a 403.
 */
export async function OneLotProjectPageShell({ projectId, pageTitle, icon, description }: OneLotProjectPageShellProps) {
  const actor = await requirePermission("one_lot_projects:read");
  const project = await getOneLotProjectById(projectId, actor);
  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={project.name} description={pageTitle} />
      <EmptyState icon={icon} title="Coming soon" description={description} />
    </div>
  );
}
