"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import { ProjectCards } from "@/components/projects/project-cards";
import { ViewToggle } from "@/components/layout/view-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatSalary } from "@/lib/employee-format";
import { formatDate } from "@/lib/format";
import { useDebounced } from "@/hooks/use-debounced";
import { useViewMode } from "@/hooks/use-view-mode";
import { cn } from "@/lib/utils";
import { deleteProject, fetchProjects } from "@/server/projects/actions";
import { projectsQueryKey } from "@/server/projects/query-key";
import type { ProjectFilters, ProjectListResult, ProjectListRow } from "@/server/projects/types";

const PAGE_SIZE = 20;

type ProjectsViewProps = {
  initialFilters: ProjectFilters;
  canCreate: boolean;
  canDelete: boolean;
};

export function ProjectsView({ initialFilters, canCreate, canDelete }: ProjectsViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);
  const [viewMode, setViewMode] = useViewMode();

  const filters = React.useMemo<ProjectFilters>(
    () => ({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, page],
  );

  const [previousSearch, setPreviousSearch] = React.useState(debouncedSearch);
  if (previousSearch !== debouncedSearch) {
    setPreviousSearch(debouncedSearch);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<ProjectListResult>({
    queryKey: projectsQueryKey(filters),
    queryFn: () => fetchProjects(filters),
    placeholderData: (previous) => previous,
  });

  const [deleting, setDeleting] = React.useState<ProjectListRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const projects = data?.projects ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search S3P number, name or client"
            aria-label="Search projects"
            className="pl-9"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {canCreate ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="size-4" aria-hidden />
                Add project
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {viewMode === "card" ? (
        <ProjectCards
          projects={projects}
          isPending={isPending}
          isFetching={isFetching}
          canDelete={canDelete}
          actionsDisabled={mutation.isPending}
          search={search}
          onDelete={setDeleting}
        />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[140px]">S3P Number</TableHead>
                  <TableHead className="min-w-[200px]">Project Name</TableHead>
                  <TableHead className="min-w-[180px]">Client</TableHead>
                  <TableHead className="min-w-[160px]">Engagement Type</TableHead>
                  <TableHead className="min-w-[140px]">Period</TableHead>
                  <TableHead className="min-w-[140px]">Total Contract Price</TableHead>
                  <TableHead className="w-12" aria-label="Actions" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {isPending ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                ) : projects.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={FolderKanban}
                        title={search ? "No matching projects" : "No projects yet"}
                        description={
                          search
                            ? "Try a different S3P number, name or client."
                            : "Add your first project to start tracking S3P financials."
                        }
                        className="rounded-none border-0"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((row) => (
                    <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                      <TableCell className="font-mono text-sm">{row.s3pNumber}</TableCell>
                      <TableCell>
                        <Link href={`/projects/${row.id}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{row.clientName}</TableCell>
                      <TableCell className="text-sm">{row.engagementTypeName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {row.startDate ? formatDate(row.startDate) : "—"}
                        {row.endDate ? ` – ${formatDate(row.endDate)}` : ""}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{formatSalary(row.totalContractPrice)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={mutation.isPending}
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${row.id}`}>View / edit</Link>
                            </DropdownMenuItem>
                            {canDelete ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                                <Trash2 className="size-4" aria-hidden />
                                Remove
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load projects."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="project" />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.name}</span> will be permanently removed
                  along with its S3P details. This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!deleting) return;
                mutation.mutate(() => deleteProject({ id: deleting.id }));
              }}
            >
              Remove project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
