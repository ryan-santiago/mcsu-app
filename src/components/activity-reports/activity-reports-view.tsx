"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarClock, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import type { DateRange } from "react-day-picker";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ActivityReportStatusBadge } from "@/components/activity-reports/activity-report-badges";
import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { getDayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteMyActivityReport, fetchMyActivityReports } from "@/server/activity-reports/actions";
import { myActivityReportsQueryKey } from "@/server/activity-reports/query-key";
import type { ActivityReportFilters, ActivityReportListResult, ActivityReportRow } from "@/server/activity-reports/types";

const PAGE_SIZE = 20;

function toDateRange(filters: ActivityReportFilters): DateRange | undefined {
  if (!filters.from) return undefined;
  return { from: parseISO(filters.from), to: filters.to ? parseISO(filters.to) : parseISO(filters.from) };
}

type ActivityReportsViewProps = {
  initialFilters: ActivityReportFilters;
};

export function ActivityReportsView({ initialFilters }: ActivityReportsViewProps) {
  const queryClient = useQueryClient();
  const [range, setRange] = React.useState<DateRange | undefined>(toDateRange(initialFilters));
  const [page, setPage] = React.useState(1);

  const filters = React.useMemo<ActivityReportFilters>(
    () => ({
      from: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [range, page],
  );

  // A new date range should snap back to page 1 — same pattern as every
  // other paginated list in the console.
  const filterSignature = `${filters.from}|${filters.to}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<ActivityReportListResult>({
    queryKey: myActivityReportsQueryKey(filters),
    queryFn: () => fetchMyActivityReports(filters),
    placeholderData: (previous) => previous,
  });

  const [deleting, setDeleting] = React.useState<ActivityReportRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["activity-reports"] });
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangePicker value={range} onChange={setRange} />

        <Button asChild className="shrink-0">
          <Link href="/activity-reports/new">
            <Plus className="size-4" aria-hidden />
            Add report
          </Link>
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[120px]">Date</TableHead>
                <TableHead className="min-w-[100px]">Day</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[90px]">Time in</TableHead>
                <TableHead className="min-w-[90px]">Time out</TableHead>
                <TableHead className="min-w-[90px]">OT hours</TableHead>
                <TableHead className="min-w-[100px]">Activities</TableHead>
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
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : reports.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={CalendarClock}
                      title="No activity reports in this range"
                      description="Add an entry, or pick a different date range."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <Link href={`/activity-reports/${row.id}`} className="font-medium hover:underline">
                        {row.date}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{getDayName(row.date)}</TableCell>
                    <TableCell>
                      <ActivityReportStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-sm">{row.timeIn ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.timeOut ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.otHours ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.itemCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={mutation.isPending}
                            aria-label={`Actions for ${row.date}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/activity-reports/${row.id}`}>View / edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                            <Trash2 className="size-4" aria-hidden />
                            Remove
                          </DropdownMenuItem>
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

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load activity reports."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="report" />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this activity report?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  Your entry for <span className="text-foreground font-medium">{deleting.date}</span> and all its
                  activity lines will be permanently removed. This cannot be undone.
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
                mutation.mutate(() => deleteMyActivityReport({ id: deleting.id }));
              }}
            >
              Remove report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
