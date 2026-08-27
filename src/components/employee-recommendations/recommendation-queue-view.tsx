"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createRecommendation, fetchRecommendationQueue } from "@/server/employee-recommendations/actions";
import { recommendationQueueQueryKey, recommendationsInProgressQueryKey } from "@/server/employee-recommendations/query-key";
import type { RecommendationQueueItem } from "@/server/employee-recommendations/types";

import { RecommendationBadgePill } from "./recommendation-badges";

const FILTER_TABS: Array<{ value: "all" | RecommendationQueueItem["triggerType"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "ph_contract_expiring", label: "Project Hired" },
  { value: "probationary_expiring", label: "Probationary" },
];

function daysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d overdue`;
  if (daysRemaining === 0) return "Due today";
  return `${daysRemaining}d left`;
}

export function RecommendationQueueView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<"all" | RecommendationQueueItem["triggerType"]>("all");

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: recommendationQueueQueryKey(),
    queryFn: () => fetchRecommendationQueue(),
  });

  const startMutation = useMutation({
    mutationFn: (item: RecommendationQueueItem) =>
      createRecommendation({
        employeeId: item.employeeId,
        triggerType: item.triggerType,
        sourceEmploymentId: item.employmentId,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: recommendationQueueQueryKey() });
        void queryClient.invalidateQueries({ queryKey: recommendationsInProgressQueryKey() });
        router.push(`/employee-recommendations/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const items = (data ?? []).filter((item) => filter === "all" || item.triggerType === filter);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Filter by contract type"
        className="bg-muted flex w-full gap-1 overflow-x-auto rounded-lg p-1 sm:w-auto"
      >
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.value;
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">Employee</TableHead>
                <TableHead className="min-w-[140px]">Employment type</TableHead>
                <TableHead className="min-w-[140px]">End date</TableHead>
                <TableHead className="min-w-[140px]">Time left</TableHead>
                <TableHead className="min-w-[160px]">Status</TableHead>
                <TableHead className="w-32" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={UserCheck}
                      title="Nothing needs a recommendation right now"
                      description="Employees whose Project Hired contract or Probationary period is coming up for renewal will appear here."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.employmentId} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.employeeName}</span>
                        <span className="text-muted-foreground font-mono text-xs">{item.employeeCode || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{item.employmentTypeName}</TableCell>
                    <TableCell className="text-sm">{formatDate(item.endDate)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{daysRemainingLabel(item.daysRemaining)}</TableCell>
                    <TableCell>
                      <RecommendationBadgePill badge={item.badge} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={startMutation.isPending}
                        onClick={() => startMutation.mutate(item)}
                      >
                        {startMutation.isPending && startMutation.variables?.employmentId === item.employmentId ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : null}
                        Start recommendation
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
          <p className="text-destructive text-sm">Could not load the recommendation queue.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
