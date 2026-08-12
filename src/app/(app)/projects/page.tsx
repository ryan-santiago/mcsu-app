import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectsView } from "@/components/projects/projects-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listProjects } from "@/server/projects/queries";
import { projectsQueryKey } from "@/server/projects/query-key";
import type { ProjectFilters } from "@/server/projects/types";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const actor = await requirePermission("projects:read");

  const initialFilters: ProjectFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: projectsQueryKey(initialFilters),
    queryFn: () => listProjects(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Projects"
        description="Sales Profit Projection per Project (S3P) — contract value, cost and gross profit."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProjectsView
          initialFilters={initialFilters}
          canCreate={can(actor, "projects:write")}
          canDelete={can(actor, "projects:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
