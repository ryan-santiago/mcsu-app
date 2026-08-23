import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { OneLotProjectPageShell } from "@/components/one-lot-projects/one-lot-project-page";

export const metadata: Metadata = { title: "Summary" };

type OneLotProjectDashboardPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectDashboardPage({ params }: OneLotProjectDashboardPageProps) {
  const { id } = await params;

  return (
    <OneLotProjectPageShell
      projectId={id}
      pageTitle="Summary"
      icon={LayoutDashboard}
      description="Project health, member roster and activity summary aren't built yet."
    />
  );
}
