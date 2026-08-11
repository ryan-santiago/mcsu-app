"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, RotateCcw, ScrollText, Search } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

import { EmptyState } from "@/components/layout/empty-state";
import { ActionBadge, ModuleBadge } from "@/components/audit/audit-badges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initialsOf } from "@/components/layout/user-menu";
import { useDebounced } from "@/hooks/use-debounced";
import type { UserRole, UserStatus } from "@/db/schema";
import { formatDateTime, formatRelative } from "@/lib/format";
import { AUDIT_ACTIONS, AUDIT_MODULES, defaultAuditRange } from "@/lib/audit-registry";
import { ROLES, STATUS_LABELS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { fetchAuditLog } from "@/server/audit/actions";
import { auditQueryKey } from "@/server/audit/query-key";
import type { AuditEntry, AuditFilters } from "@/server/audit/types";

const PAGE_SIZE = 25;

/** Renders a raw stored value using the same labels the rest of the app uses for it. */
function formatChangeValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "role" && typeof value === "string" && value in ROLES) {
    return ROLES[value as UserRole].label;
  }
  if (field === "status" && typeof value === "string" && value in STATUS_LABELS) {
    return STATUS_LABELS[value as UserStatus];
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** One-line summary for the collapsed row: "Role: Engineer → Manager" or "3 fields changed". */
function summarize(entry: AuditEntry): string {
  const changes = entry.changes ?? [];
  if (changes.length === 0) return "—";
  if (changes.length === 1) {
    const c = changes[0];
    return `${c.label}: ${formatChangeValue(c.field, c.oldValue)} → ${formatChangeValue(c.field, c.newValue)}`;
  }
  return `${changes.length} fields changed`;
}

export function AuditView() {
  const [range, setRange] = React.useState<DateRange | undefined>(defaultAuditRange());
  const [module, setModule] = React.useState<string>("all");
  const [action, setAction] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const debouncedSearch = useDebounced(search);

  const filters = React.useMemo<AuditFilters>(
    () => ({
      from: range?.from,
      to: range?.to,
      module,
      action,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [range, module, action, debouncedSearch, page],
  );

  // Any filter change (except paging itself) should snap back to page 1 — a
  // narrower filter set showing "page 4 of 1" would just look broken. Tracked
  // in state rather than a ref: React explicitly supports setState-during-render
  // for "adjust state when an input changes" (it re-renders immediately, before
  // committing), whereas mutating a ref mid-render is unsafe under the compiler.
  const filterSignature = JSON.stringify({ range, module, action, debouncedSearch });
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: auditQueryKey(filters),
    queryFn: () => fetchAuditLog(filters),
    placeholderData: (previous) => previous,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <DateRangePicker value={range} onChange={setRange} />

          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {AUDIT_MODULES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actor or record"
            aria-label="Search audit trail"
            className="pl-9"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Table                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-36">When</TableHead>
                <TableHead className="min-w-48">Actor</TableHead>
                <TableHead className="min-w-40">Module</TableHead>
                <TableHead className="min-w-40">Entity</TableHead>
                <TableHead className="min-w-36">Action</TableHead>
                <TableHead className="min-w-56">Changes</TableHead>
                <TableHead className="w-10" aria-label="Expand" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-3.5 w-24" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="size-7 rounded-full" />
                        <Skeleton className="h-3.5 w-28" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-28 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-40" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={ScrollText}
                      title="No activity in this range"
                      description="Try widening the date range or clearing the module, action or search filters."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const isOpen = expanded.has(entry.id);
                  const changes = entry.changes ?? [];

                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow
                        className={cn("cursor-pointer", isFetching && "opacity-70")}
                        onClick={() => changes.length > 0 && toggle(entry.id)}
                      >
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          <span title={formatDateTime(entry.createdAt)}>
                            {formatRelative(entry.createdAt)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar className="size-7 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-[0.6875rem] font-semibold">
                                {entry.actorName ? initialsOf(entry.actorName) : "SY"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {entry.actorName ?? "System"}
                              </p>
                              {entry.actorEmail ? (
                                <p className="text-muted-foreground truncate text-xs">
                                  {entry.actorEmail}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <ModuleBadge module={entry.module} />
                        </TableCell>

                        <TableCell className="text-sm">
                          <span className="truncate">{entry.entityLabel ?? "—"}</span>
                        </TableCell>

                        <TableCell>
                          <ActionBadge action={entry.action} />
                        </TableCell>

                        <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                          {summarize(entry)}
                        </TableCell>

                        <TableCell>
                          {changes.length > 0 ? (
                            <ChevronRight
                              className={cn(
                                "text-muted-foreground size-4 shrink-0 transition-transform",
                                isOpen && "rotate-90",
                              )}
                              aria-hidden
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>

                      {isOpen && changes.length > 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <div className="p-4">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-muted-foreground text-left text-xs">
                                    <th className="pb-2 pr-4 font-medium">Field</th>
                                    <th className="pb-2 pr-4 font-medium">Old value</th>
                                    <th className="pb-2 font-medium">New value</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-border divide-y">
                                  {changes.map((change) => (
                                    <tr key={change.field}>
                                      <td className="py-1.5 pr-4 font-medium whitespace-nowrap">
                                        {change.label}
                                      </td>
                                      <td className="text-muted-foreground py-1.5 pr-4">
                                        {formatChangeValue(change.field, change.oldValue)}
                                      </td>
                                      <td className="py-1.5 font-medium">
                                        {formatChangeValue(change.field, change.newValue)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : "Could not load the audit trail."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                         */}
      {/* ------------------------------------------------------------------ */}
      {total > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
