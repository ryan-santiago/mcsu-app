import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectBacklogBoard } from "@/components/one-lot-projects/backlog/one-lot-project-backlog-board";
import { requirePermission } from "@/lib/session";
import { getOneLotProjectBacklogBoard } from "@/server/one-lot-projects/backlog-queries";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = { title: "Backlog" };

type OneLotProjectListPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectListPage({ params }: OneLotProjectListPageProps) {
  const { id } = await params;
  const actor = await requirePermission("one_lot_projects:read");
  const project = await getOneLotProjectById(id, actor);
  if (!project) notFound();

  const board = await getOneLotProjectBacklogBoard(id, actor);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={project.name} description="Backlog" />
      {/* Reaching this page already required content access to the project (see the `getOneLotProjectById`
          guard above), and per this module's RBAC design that's the same bar as being allowed to edit its
          Backlog content — there's no separate read-only-member tier today. */}
      <OneLotProjectBacklogBoard projectId={id} initialBoard={board} canEdit />
    </div>
  );
}
