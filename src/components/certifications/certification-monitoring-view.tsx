"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, Download, ExternalLink, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import { EmployeeFilterCombobox } from "@/components/productivity/employee-filter-combobox";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCsv, downloadCsv } from "@/lib/csv-export";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  fetchCertificationMonitoringEmployeeOptions,
  fetchCertificationsForMonitoring,
  fetchCertificationsForMonitoringExport,
} from "@/server/certifications/actions";
import {
  certificationMonitoringEmployeeOptionsQueryKey,
  certificationMonitoringQueryKey,
} from "@/server/certifications/query-key";
import type {
  CertificationMonitoringFilters,
  CertificationMonitoringListResult,
  CertificationMonitoringRow,
} from "@/server/certifications/types";

const PAGE_SIZE = 20;

function toDateRange(filters: CertificationMonitoringFilters): DateRange | undefined {
  if (!filters.from) return undefined;
  return { from: parseISO(filters.from), to: filters.to ? parseISO(filters.to) : parseISO(filters.from) };
}

type CertificationMonitoringViewProps = {
  initialFilters: CertificationMonitoringFilters;
};

export function CertificationMonitoringView({ initialFilters }: CertificationMonitoringViewProps) {
  const [range, setRange] = React.useState<DateRange | undefined>(toDateRange(initialFilters));
  const [employeeId, setEmployeeId] = React.useState<string | null>(initialFilters.employeeId ?? null);
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);

  const filters = React.useMemo<CertificationMonitoringFilters>(
    () => ({
      from: range?.from ? format(range.from, "yyyy-MM-dd") : undefined,
      to: range?.to ? format(range.to, "yyyy-MM-dd") : undefined,
      employeeId: employeeId ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [range, employeeId, page],
  );

  const filterSignature = `${filters.from}|${filters.to}|${filters.employeeId}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<CertificationMonitoringListResult>({
    queryKey: certificationMonitoringQueryKey(filters),
    queryFn: async () => {
      const result = await fetchCertificationsForMonitoring(filters);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: (previous) => previous,
  });

  const employeeOptions = useQuery({
    queryKey: certificationMonitoringEmployeeOptionsQueryKey(),
    queryFn: async () => {
      const result = await fetchCertificationMonitoringEmployeeOptions();
      if (!result.ok) throw new Error(result.error);
      return result.data.options;
    },
  });

  async function handleExportCsv() {
    setExporting(true);
    try {
      const result = await fetchCertificationsForMonitoringExport({
        from: filters.from,
        to: filters.to,
        employeeId: filters.employeeId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const csv = buildCsv<CertificationMonitoringRow>(result.data.rows, [
        { header: "Employee", accessor: (row) => row.employeeName },
        { header: "Team", accessor: (row) => row.teamName ?? "" },
        { header: "Title", accessor: (row) => row.title },
        { header: "Date acquired", accessor: (row) => row.dateAcquired },
        { header: "Credential URL", accessor: (row) => row.credentialUrl ?? "" },
        { header: "Has file", accessor: (row) => (row.fileName ? "Yes" : "No") },
      ]);
      downloadCsv(`Certifications-Monitoring-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
    } finally {
      setExporting(false);
    }
  }

  const certifications = data?.certifications ?? [];
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
                <TableHead className="min-w-[200px]">Title</TableHead>
                <TableHead className="min-w-[120px]">Date acquired</TableHead>
                <TableHead className="min-w-[100px]">Credential</TableHead>
                <TableHead className="min-w-[90px]">File</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : certifications.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Award}
                      title="No certifications match these filters"
                      description="Try a different date range or employee."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                certifications.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell className="text-sm">{row.teamName ?? "—"}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell className="text-sm">{formatDate(row.dateAcquired)}</TableCell>
                    <TableCell className="text-sm">
                      {row.credentialUrl ? (
                        <a
                          href={row.credentialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-accent inline-flex items-center gap-1 hover:underline"
                        >
                          Link
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.fileName ? (
                        <a
                          href={`/api/certifications/${row.id}/file?download=1`}
                          className="text-brand-accent inline-flex items-center gap-1 hover:underline"
                        >
                          Download
                          <Download className="size-3" aria-hidden />
                        </a>
                      ) : (
                        "—"
                      )}
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
            {error instanceof Error ? error.message : "Could not load certifications."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="certification" />
    </div>
  );
}
