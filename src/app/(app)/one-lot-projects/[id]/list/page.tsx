import { ListChecks } from "lucide-react";
import type { Metadata } from "next";

import { OneLotProjectPageShell } from "@/components/one-lot-projects/one-lot-project-page";

export const metadata: Metadata = { title: "Backlog" };

type OneLotProjectListPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectListPage({ params }: OneLotProjectListPageProps) {
  const { id } = await params;

  return (
    <OneLotProjectPageShell
      projectId={id}
      pageTitle="Backlog"
      icon={ListChecks}
      description="The backlog list isn't built yet."
    />
  );
}
