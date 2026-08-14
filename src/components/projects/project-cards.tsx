"use client";

import { FolderKanban, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSalary } from "@/lib/employee-format";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectListRow } from "@/server/projects/types";

const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

type ProjectCardsProps = {
  projects: ProjectListRow[];
  isPending: boolean;
  isFetching: boolean;
  canDelete: boolean;
  actionsDisabled: boolean;
  search: string;
  onDelete: (row: ProjectListRow) => void;
};

export function ProjectCards({
  projects,
  isPending,
  isFetching,
  canDelete,
  actionsDisabled,
  search,
  onDelete,
}: ProjectCardsProps) {
  if (isPending) {
    return (
      <div className={GRID}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} size="sm">
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title={search ? "No matching projects" : "No projects yet"}
        description={search ? "Try a different S3P number, name or client." : "Add your first project to start tracking S3P financials."}
      />
    );
  }

  return (
    <div className={cn(GRID, isFetching && "opacity-70")}>
      {projects.map((row) => (
        <Card key={row.id} size="sm">
          <CardHeader>
            <CardTitle className="truncate">
              <Link href={`/projects/${row.id}`} className="hover:underline">
                {row.name}
              </Link>
            </CardTitle>
            <CardDescription className="font-mono text-xs">{row.s3pNumber}</CardDescription>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={actionsDisabled}
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
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(row)}>
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="space-y-1.5 text-sm">
              <Field label="Client" value={row.clientName} />
              <Field label="Engagement" value={row.engagementTypeName ?? "—"} />
              <Field
                label="Period"
                value={
                  row.startDate
                    ? `${formatDate(row.startDate)}${row.endDate ? ` – ${formatDate(row.endDate)}` : ""}`
                    : "—"
                }
              />
            </div>
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs">Total contract price</p>
              <p className="text-lg font-semibold tabular-nums">{formatSalary(row.totalContractPrice)}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
