"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Search, UserCheck, UserRoundX } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { fetchJobPostingSourceOptions, fetchTaCandidatesPage } from "@/server/talent-acquisition/candidate-actions";
import type { TaCandidateFilters, TaCandidatePoolResult, TaCandidatePoolRow } from "@/server/talent-acquisition/candidate-types";
import { TA_APPLICATION_STATUS_LABELS } from "@/server/talent-acquisition/application-types";
import { TA_STAGE_LABELS } from "@/server/talent-acquisition/stage-types";
import { TA_STAGE_ORDER } from "@/server/talent-acquisition/stage-order";

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  hired: "secondary",
  rejected: "outline",
  withdrawn: "outline",
};

type CandidatePoolViewProps = {
  initialFilters: TaCandidateFilters;
};

export function CandidatePoolView({ initialFilters }: CandidatePoolViewProps) {
  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialFilters.search ?? "");
  const [stage, setStage] = React.useState<string>(initialFilters.stage ?? "all");
  const [applicationStatus, setApplicationStatus] = React.useState<string>(initialFilters.applicationStatus ?? "all");
  const [sourceId, setSourceId] = React.useState<string>(initialFilters.sourceId ?? "all");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const sourceOptions = useQuery({ queryKey: ["ta-candidate-pool", "source-options"], queryFn: fetchJobPostingSourceOptions });

  const filters = React.useMemo<TaCandidateFilters>(
    () => ({
      search: debouncedSearch.trim() || undefined,
      stage: stage === "all" ? undefined : (stage as TaCandidateFilters["stage"]),
      applicationStatus: applicationStatus === "all" ? undefined : (applicationStatus as TaCandidateFilters["applicationStatus"]),
      sourceId: sourceId === "all" ? undefined : sourceId,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, stage, applicationStatus, sourceId, page],
  );

  const filterSignature = `${filters.search}|${filters.stage}|${filters.applicationStatus}|${filters.sourceId}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching } = useQuery<TaCandidatePoolResult>({
    queryKey: ["ta-candidate-pool", filters],
    queryFn: () => fetchTaCandidatesPage(filters),
    placeholderData: (previous) => previous,
  });

  const candidates = data?.candidates ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email, or mobile number"
            className="pl-9"
          />
        </div>

        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Any stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any stage</SelectItem>
            {TA_STAGE_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {TA_STAGE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={applicationStatus} onValueChange={setApplicationStatus}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {Object.entries(TA_APPLICATION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Any source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any source</SelectItem>
            {sourceOptions.data?.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Current stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-24">CV</TableHead>
                <TableHead className="w-28">Employee</TableHead>
                <TableHead className="w-32">In pool since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {Array.from({ length: 8 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : candidates.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={UserRoundX}
                      title="No one in the talent pool yet"
                      description="Candidates appear here once they're added to a Talent Acquisition request."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate: TaCandidatePoolRow) => (
                  <TableRow key={candidate.id} className={isFetching ? "opacity-70" : undefined}>
                    <TableCell>
                      <Link href={`/talent-acquisition/candidates/${candidate.id}`} className="font-medium hover:underline">
                        {formatEmployeeDisplayName(candidate)}
                      </Link>
                      {candidate.genderName ? <div className="text-muted-foreground text-xs">{candidate.genderName}</div> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {candidate.mobileNumber || candidate.personalEmail || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {candidate.currentStage ? TA_STAGE_LABELS[candidate.currentStage] : "—"}
                    </TableCell>
                    <TableCell>
                      {candidate.applicationStatus ? (
                        <Badge variant={STATUS_BADGE_VARIANT[candidate.applicationStatus]} className="font-normal">
                          {TA_APPLICATION_STATUS_LABELS[candidate.applicationStatus]}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{candidate.sourceName ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {candidate.cvFileName ? (
                        <a
                          href={`/api/talent-acquisition/candidates/${candidate.id}/cv`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand inline-flex items-center gap-1 hover:underline"
                        >
                          <Download className="size-3.5" aria-hidden />
                          CV
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {candidate.employeeId ? (
                        <Link
                          href={`/employees/${candidate.employeeId}`}
                          className="text-success inline-flex items-center gap-1 hover:underline"
                        >
                          <UserCheck className="size-3.5" aria-hidden />
                          Migrated
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(candidate.createdAt, "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="candidate" />
    </div>
  );
}
