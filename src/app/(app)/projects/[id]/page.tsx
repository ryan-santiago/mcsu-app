import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getProjectById } from "@/server/projects/queries";
import { projectQueryKey } from "@/server/projects/query-key";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? project.name : "Project" };
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const actor = await requirePermission("projects:read");
  const { id } = await params;

  const queryClient = new QueryClient();
  const project = await queryClient.fetchQuery({
    queryKey: projectQueryKey(id),
    queryFn: () => getProjectById(id),
  });

  if (!project) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="View / Edit Project"
        description="Update this project's S3P identity, assignments and financial details."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProjectDetailView
          projectId={id}
          canUpdate={can(actor, "projects:edit")}
          canDelete={can(actor, "projects:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
