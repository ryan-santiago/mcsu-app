"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderX, RotateCcw } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectLineItemsTable } from "@/components/projects/project-line-items-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProject } from "@/server/projects/actions";
import { projectQueryKey } from "@/server/projects/query-key";
import type { ProjectDetail } from "@/server/projects/types";

type ProjectDetailViewProps = {
  projectId: string;
  canUpdate: boolean;
  canDelete: boolean;
};

export function ProjectDetailView({ projectId, canUpdate, canDelete }: ProjectDetailViewProps) {
  const { data, isPending, isError, refetch } = useQuery<ProjectDetail | null>({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
        <p className="text-destructive text-sm">Could not load this project.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={FolderX} title="Project not found" description="This record may have been removed." />;
  }

  return (
    <div className="space-y-6">
      <ProjectForm mode="edit" projectId={projectId} initialData={data} readOnly={!canUpdate} />
      <ProjectLineItemsTable
        projectId={projectId}
        lineItems={data.lineItems}
        canEdit={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
