"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Clock3, MoreHorizontal, ScrollText, ThumbsDown, ThumbsUp } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChangeRequestStatus } from "@/db/schema";
import { formatDateTime, formatRelative } from "@/lib/format";
import { denyReasonForActingOn, type Principal } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { approveChangeRequest, fetchChangeRequests, rejectChangeRequest } from "@/server/change-requests/actions";
import { changeRequestsQueryKey } from "@/server/change-requests/query-key";
import type { ActionResult, ChangeRequestListResult, ChangeRequestRow } from "@/server/change-requests/types";

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{ value: ChangeRequestStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_STYLES: Record<ChangeRequestStatus, { icon: typeof Clock3; className: string }> = {
  pending: { icon: Clock3, className: "border-warning/30 bg-warning/10 text-warning" },
  approved: { icon: CircleCheck, className: "border-success/30 bg-success/10 text-success" },
  rejected: { icon: CircleX, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  // No tab surfaces this (self-service cancel, before any reviewer sees it) — kept only so
  // `Record<ChangeRequestStatus, ...>` stays exhaustive, same styling as the equivalent
  // Employee Recommendation badge (`recommendation-badges.tsx`).
  cancelled: { icon: CircleX, className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
};

function StatusBadge({ status }: { status: ChangeRequestStatus }) {
  const { icon: Icon, className } = STATUS_STYLES[status];
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function ChangesTable({ changes }: { changes: ChangeRequestRow["changes"] }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground bg-muted/30 text-left text-xs">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">From</th>
            <th className="px-3 py-2 font-medium">To</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {changes.map((change) => (
            <tr key={change.field}>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{change.label}</td>
              <td className="text-muted-foreground px-3 py-2">{formatChangeValue(change.oldValue)}</td>
              <td className="px-3 py-2 font-medium">{formatChangeValue(change.newValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Review = { row: ChangeRequestRow; intent: "approve" | "reject" };

type ApprovalsViewProps = {
  /** The signed-in reviewer, used to gate Approve/Reject per row against the requester's rank. */
  actor: Principal;
};

export function ApprovalsView({ actor }: ApprovalsViewProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<ChangeRequestStatus>("pending");
  const [page, setPage] = React.useState(1);
  const [reviewing, setReviewing] = React.useState<Review | null>(null);
  const [note, setNote] = React.useState("");

  const filters = React.useMemo(() => ({ status, page, pageSize: PAGE_SIZE }), [status, page]);

  const filterSignature = status;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, refetch } = useQuery<ChangeRequestListResult>({
    queryKey: changeRequestsQueryKey(filters),
    queryFn: () => fetchChangeRequests(filters),
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["change-requests"] });
        setReviewing(null);
        setNote("");
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const requests = data?.requests ?? [];
  const counts = data?.counts;
  const total = data?.total ?? 0;

  function denialFor(row: ChangeRequestRow): string | null {
    if (row.requesterId === null || row.requesterRank === null || row.requesterRoleLabel === null) return null;
    return denyReasonForActingOn(actor, { id: row.requesterId, rank: row.requesterRank, roleLabel: row.requesterRoleLabel });
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Filter by status"
        className="bg-muted flex w-full gap-1 overflow-x-auto rounded-lg p-1 sm:w-auto"
      >
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          const badgeCount = counts?.[tab.value];

          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {badgeCount !== undefined && badgeCount > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold tabular-nums",
                    tab.value === "pending" ? "bg-warning/15 text-warning" : "bg-muted-foreground/15 text-muted-foreground",
                  )}
                >
                  {badgeCount}
                </span>
              ) : null}
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
                <TableHead className="min-w-[180px]">Requested by</TableHead>
                <TableHead className="min-w-[120px]">Status</TableHead>
                <TableHead className="min-w-[140px]">Submitted</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
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
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : requests.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={ScrollText}
                      title={`No ${status} requests`}
                      description="Self-service profile edits will appear here."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((row) => {
                  const denial = denialFor(row);

                  return (
                    <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{row.employeeName}</span>
                          <span className="text-muted-foreground font-mono text-xs">{row.employeeCode || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.requesterName ? (
                          <div className="flex flex-col">
                            <span>{row.requesterName}</span>
                            {row.requesterRoleLabel ? (
                              <span className="text-muted-foreground text-xs">{row.requesterRoleLabel}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Account removed</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        <span title={formatDateTime(row.createdAt)}>{formatRelative(row.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        {row.status !== "pending" ? null : denial ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Button variant="ghost" size="icon" disabled aria-label="Actions unavailable">
                                  <MoreHorizontal className="size-4" aria-hidden />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{denial}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={mutation.isPending}
                                aria-label={`Actions for ${row.employeeName}'s request`}
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setReviewing({ row, intent: "approve" })}>
                                <ThumbsUp className="size-4" aria-hidden />
                                Review &amp; approve
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setReviewing({ row, intent: "reject" })}
                              >
                                <ThumbsDown className="size-4" aria-hidden />
                                Reject
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">Could not load change requests.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="request" />

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="sm:max-w-lg">
          {reviewing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {reviewing.intent === "approve" ? "Approve" : "Reject"} {reviewing.row.employeeName}&apos;s changes
                </DialogTitle>
                <DialogDescription>
                  Requested by {reviewing.row.requesterName ?? "an account that no longer exists"}.
                </DialogDescription>
              </DialogHeader>

              <ChangesTable changes={reviewing.row.changes} />

              {reviewing.intent === "reject" ? (
                <div className="space-y-2">
                  <Label htmlFor="review-note">
                    Note <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="review-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why this was rejected"
                    disabled={mutation.isPending}
                  />
                </div>
              ) : null}

              <DialogFooter>
                <Button variant="outline" disabled={mutation.isPending} onClick={() => setReviewing(null)}>
                  Cancel
                </Button>
                {reviewing.intent === "approve" ? (
                  <Button disabled={mutation.isPending} onClick={() => mutation.mutate(() => approveChangeRequest({ id: reviewing.row.id }))}>
                    Approve
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate(() => rejectChangeRequest({ id: reviewing.row.id, note }))}
                  >
                    Reject
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
