"use client";

import { IdCard, MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EMPLOYMENT_TYPE_LABELS, formatAddressSummary, formatEmployeeName } from "@/lib/employee-format";
import { cn } from "@/lib/utils";
import type { EmployeeListRow } from "@/server/employees/types";

const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

type EmployeeCardsProps = {
  employees: EmployeeListRow[];
  isPending: boolean;
  isFetching: boolean;
  canDelete: boolean;
  actionsDisabled: boolean;
  search: string;
  onDelete: (row: EmployeeListRow) => void;
};

export function EmployeeCards({
  employees,
  isPending,
  isFetching,
  canDelete,
  actionsDisabled,
  search,
  onDelete,
}: EmployeeCardsProps) {
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

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={IdCard}
        title={search ? "No matching employees" : "No employees yet"}
        description={
          search ? "Try a different name, code or email." : "Add your first employee to start building the directory."
        }
      />
    );
  }

  return (
    <div className={cn(GRID, isFetching && "opacity-70")}>
      {employees.map((row) => (
        <Card key={row.id} size="sm">
          <CardHeader>
            <CardTitle className="truncate">
              <Link href={`/employees/${row.id}`} className="hover:underline">
                {formatEmployeeName(row)}
              </Link>
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs">{row.code || "—"}</span>
              {row.isResigned ? (
                <Badge variant="outline" className="text-muted-foreground font-normal">
                  Resigned
                </Badge>
              ) : null}
            </CardDescription>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={actionsDisabled}
                    aria-label={`Actions for ${formatEmployeeName(row)}`}
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/employees/${row.id}`}>View / edit</Link>
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

          <CardContent className="space-y-1.5 text-sm">
            <Field
              label="Role"
              value={row.latestLevel && row.latestPosition ? `${row.latestLevel} - ${row.latestPosition}` : "—"}
            />
            <Field
              label="Employment"
              value={row.latestEmploymentType ? EMPLOYMENT_TYPE_LABELS[row.latestEmploymentType] : "—"}
            />
            <Field
              label="Deployment"
              value={row.latestClient && row.latestProject ? `${row.latestClient} - ${row.latestProject}` : "—"}
            />
            <Field label="Address" value={formatAddressSummary(row.currentAddress)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
