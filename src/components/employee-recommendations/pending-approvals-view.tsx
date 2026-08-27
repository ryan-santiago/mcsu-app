"use client";

import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchPendingApprovals } from "@/server/employee-recommendations/actions";
import { pendingApprovalsQueryKey } from "@/server/employee-recommendations/query-key";

export function PendingApprovalsView() {
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: pendingApprovalsQueryKey(),
    queryFn: () => fetchPendingApprovals(),
  });

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">Employee</TableHead>
                <TableHead className="min-w-[160px]">Submitted by</TableHead>
                <TableHead className="min-w-[140px]">Your role</TableHead>
                <TableHead className="min-w-[120px]">Submitted</TableHead>
                <TableHead className="w-32" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
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
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={ListChecks}
                      title="Nothing needs your approval right now"
                      description="Recommendations routed to you for review will appear here."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.stepId} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.employeeName}</span>
                        <span className="text-muted-foreground font-mono text-xs">{item.employeeCode || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{item.requestedByLabel}</TableCell>
                    <TableCell className="text-sm">{item.roleLabel}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatRelative(item.submittedAt)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" asChild>
                        <Link href={`/employee-recommendations/${item.recommendationId}`}>Review</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">Could not load pending approvals.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
