"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarClock, Download, RotateCcw } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { ActivityReportStatusBadge } from "@/components/activity-reports/activity-report-badges";
import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import { EmployeeFilterCombobox } from "@/components/productivity/employee-filter-combobox";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTIVITY_REPORT_STATUS_LABELS } from "@/lib/activity-report-format";
import { buildCsv, downloadCsv } from "@/lib/csv-export";
import { getDayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  fetchActivityReportMonitoringEmployeeOptions,
  fetchActivityReportsForMonitoring,
  fetchActivityReportsForMonitoringExport,
} from "@/server/activity-reports/actions";
import {
  activityReportMonitoringEmployeeOptionsQueryKey,
  activityReportMonitoringQueryKey,
} from "@/server/activity-reports/query-key";
import type {
  ActivityReportMonitoringFilters,
  ActivityReportMonitoringListResult,
  ActivityReportMonitoringRow,
} from "@/server/activity-reports/types";
import type { ActivityReportStatus } from "@/db/schema";

const PAGE_SIZE = 20;

function toDateRange(filters: ActivityReportMonitoringFilters): DateRange | undefined {
  if (!filters.from) return undefined;
  return { from: parseISO(filters.from), to: filters.to ? parseISO(filters.to) : parseISO(filters.from) };
}

type ActivityReportMonitoringViewProps = {
  initialFilters: ActivityReportMonitoringFilters;
};

export function ActivityReportMonitoringView({ initialFilters }: ActivityReportMonitoringViewProps) {
  const [range, setRange] = React.useState<DateRange | undefined>(toDateRange(initialFilters));
  const [employeeId, setEmployeeId] = React.useState<string | null>(initialFilters.employeeId ?? null);
  const [status, setStatus] = React.useState<ActivityReportStatus | "all">(initialFilters.status ?? "all");
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);

  const filters = React.useMemo<ActivityReportMonitoringFilters>(
    () => ({
      from: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
      employeeId: employeeId ?? undefined,
      status: status === "all" ? undefined : status,
      page,
      pageSize: PAGE_SIZE,
    }),
    [range, employeeId, status, page],
  );

  const filterSignature = `${filters.from}|${filters.to}|${filters.employeeId}|${filters.status}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<ActivityReportMonitoringListResult>({
    queryKey: activityReportMonitoringQueryKey(filters),
    queryFn: async () => {
      const result = await fetchActivityReportsForMonitoring(filters);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: (previous) => previous,
  });

  const employeeOptions = useQuery({
    queryKey: activityReportMonitoringEmployeeOptionsQueryKey(),
    queryFn: async () => {
      const result = await fetchActivityReportMonitoringEmployeeOptions();
      if (!result.ok) throw new Error(result.error);
      return result.data.options;
    },
  });

  async function handleExportCsv() {
    setExporting(true);
    try {
      const result = await fetchActivityReportsForMonitoringExport({
        from: filters.from,
        to: filters.to,
        employeeId: filters.employeeId,
        status: filters.status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const csv = buildCsv<ActivityReportMonitoringRow>(result.data.rows, [
        { header: "Employee", accessor: (row) => row.employeeName },
        { header: "Team", accessor: (row) => row.teamName ?? "" },
        { header: "Date", accessor: (row) => row.date },
        { header: "Status", accessor: (row) => ACTIVITY_REPORT_STATUS_LABELS[row.status] },
        { header: "Time in", accessor: (row) => row.timeIn ?? "" },
        { header: "Time out", accessor: (row) => row.timeOut ?? "" },
        { header: "OT hours", accessor: (row) => row.otHours ?? "" },
        { header: "Activities", accessor: (row) => row.itemCount },
      ]);
      downloadCsv(`Activity-Report-Monitoring-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
    } finally {
      setExporting(false);
    }
  }

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker value={range} onChange={setRange} />
          <EmployeeFilterCombobox
            options={employeeOptions.data ?? []}
            value={employeeId}
            onChange={setEmployeeId}
            loading={employeeOptions.isPending}
          />
          <Select value={status} onValueChange={(value) => setStatus(value as ActivityReportStatus | "all")}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(ACTIVITY_REPORT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" onClick={() => void handleExportCsv()} disabled={exporting}>
          <Download className="size-4" aria-hidden />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[160px]">Employee</TableHead>
                <TableHead className="min-w-[120px]">Team</TableHead>
                <TableHead className="min-w-[120px]">Date</TableHead>
                <TableHead className="min-w-[100px]">Day</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[90px]">Time in</TableHead>
                <TableHead className="min-w-[90px]">Time out</TableHead>
                <TableHead className="min-w-[90px]">OT hours</TableHead>
                <TableHead className="min-w-[100px]">Activities</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {Array.from({ length: 9 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : reports.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={CalendarClock}
                      title="No activity reports match these filters"
                      description="Try a different date range, employee or status."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell className="text-sm">{row.teamName ?? "—"}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-sm">{getDayName(row.date)}</TableCell>
                    <TableCell>
                      <ActivityReportStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-sm">{row.timeIn ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.timeOut ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.otHours ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.itemCount}</TableCell>
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
    </div>
  );
}
