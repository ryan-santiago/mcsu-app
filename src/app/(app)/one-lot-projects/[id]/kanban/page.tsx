import { Kanban } from "lucide-react";
import type { Metadata } from "next";

import { OneLotProjectPageShell } from "@/components/one-lot-projects/one-lot-project-page";

export const metadata: Metadata = { title: "Kanban Board" };

type OneLotProjectKanbanPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectKanbanPage({ params }: OneLotProjectKanbanPageProps) {
  const { id } = await params;

  return (
    <OneLotProjectPageShell
      projectId={id}
      pageTitle="Kanban Board"
      icon={Kanban}
      description="The kanban board isn't built yet."
    />
  );
}
