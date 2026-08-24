import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { OneLotProjectSummary } from "@/components/one-lot-projects/one-lot-project-summary";
import { requireUser } from "@/lib/session";
import { getOneLotProjectById } from "@/server/one-lot-projects/queries";

export const metadata: Metadata = { title: "Summary" };

type OneLotProjectDashboardPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OneLotProjectDashboardPage({ params }: OneLotProjectDashboardPageProps) {
  const { id } = await params;
  const actor = await requireUser();
  const project = await getOneLotProjectById(id, actor);
  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title={project.name} description="Summary" />
      <OneLotProjectSummary projectId={id} actor={actor} />
    </div>
  );
}
