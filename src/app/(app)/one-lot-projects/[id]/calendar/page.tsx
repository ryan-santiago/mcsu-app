import { format, startOfMonth } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectCalendarView } from "@/components/one-lot-projects/calendar/one-lot-project-calendar-view";
import { requireUser } from "@/lib/session";
import { getOneLotProjectCalendarMonth } from "@/server/one-lot-projects/backlog-queries";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = { title: "Calendar" };

type OneLotProjectCalendarPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectCalendarPage({ params }: OneLotProjectCalendarPageProps) {
  const { id } = await params;
  const actor = await requireUser();
  const project = await getOneLotProjectById(id, actor);
  if (!project) notFound();

  const monthStart = startOfMonth(new Date());
  const board = await getOneLotProjectCalendarMonth(id, actor, monthStart);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={project.name} description="Calendar" />
      {/* Reaching this page already required content access to the project (see the `getOneLotProjectById`
          guard above), and per this module's RBAC design that's the same bar as being allowed to edit its
          board content — there's no separate read-only-member tier today. Same rationale as the Kanban page. */}
      <OneLotProjectCalendarView
        projectId={id}
        initialMonth={format(monthStart, "yyyy-MM-dd")}
        initialBoard={board}
        members={board.members}
        columns={board.columns}
        canEdit
      />
    </div>
  );
}
