"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchRecommendationsInProgress } from "@/server/employee-recommendations/actions";
import { recommendationsInProgressQueryKey } from "@/server/employee-recommendations/query-key";

import { RecommendationStatusBadge } from "./recommendation-badges";

const TRIGGER_LABELS = {
  ph_contract_expiring: "Project Hired renewal",
  probationary_expiring: "Probationary review",
  manual_regular: "Annual KPI",
} as const;

export function RecommendationsInProgressView() {
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: recommendationsInProgressQueryKey(),
    queryFn: () => fetchRecommendationsInProgress(),
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
                <TableHead className="min-w-[160px]">Reason</TableHead>
                <TableHead className="min-w-[140px]">Status</TableHead>
                <TableHead className="min-w-[120px]">Updated</TableHead>
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
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
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
                      icon={ClipboardList}
                      title="Nothing in progress"
                      description="Recommendations you start, from the queue or manually, will appear here until they're resolved."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.employeeName}</span>
                        <span className="text-muted-foreground font-mono text-xs">{item.employeeCode || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{TRIGGER_LABELS[item.triggerType]}</TableCell>
                    <TableCell>
                      <RecommendationStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatRelative(item.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/employee-recommendations/${item.id}`}>Open</Link>
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
          <p className="text-destructive text-sm">Could not load in-progress recommendations.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
