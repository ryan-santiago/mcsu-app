import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectKanbanBoard } from "@/components/one-lot-projects/kanban/one-lot-project-kanban-board";
import { requireUser } from "@/lib/session";
import { getOneLotProjectKanbanBoard } from "@/server/one-lot-projects/backlog-queries";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = { title: "Kanban Board" };

type OneLotProjectKanbanPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectKanbanPage({ params }: OneLotProjectKanbanPageProps) {
  const { id } = await params;
  const actor = await requireUser();
  const project = await getOneLotProjectById(id, actor);
  if (!project) notFound();

  const board = await getOneLotProjectKanbanBoard(id, actor);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={project.name} description="Kanban Board" />
      {/* Reaching this page already required content access to the project (see the `getOneLotProjectById`
          guard above), and per this module's RBAC design that's the same bar as being allowed to edit its
          board content — there's no separate read-only-member tier today. */}
      <OneLotProjectKanbanBoard projectId={id} initialBoard={board} canEdit />
    </div>
  );
}
