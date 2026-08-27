"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Pencil, Search, UserRound, UsersRound } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { fetchRecommendationApproverOptions, fetchTeamApprovers, setTeamApprovers } from "@/server/maintenance/actions";
import { recommendationApproverOptionsQueryKey, teamApproversQueryKey } from "@/server/maintenance/query-key";
import type { LookupOption, TeamApproverRow } from "@/server/maintenance/types";

/**
 * Assigns each team's Unit Manager / Department Head — the approvers
 * Employee Recommendation's approval chain resolves against (see
 * docs/EMPLOYEE_RECOMMENDATION.md §4.1/§5.2). A team with either unset
 * blocks submission for its members until an admin assigns one here.
 */
export function TeamApproversPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<TeamApproverRow | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: teamApproversQueryKey(),
    queryFn: () => fetchTeamApprovers(),
  });

  const rows = data ?? [];

  return (
    <div className="mt-6 space-y-3 border-t pt-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Recommendation approvers</h3>
        <p className="text-muted-foreground text-sm">
          Who approves an Employee Recommendation for each team — Unit Manager first, then Department Head. A team
          with either unset blocks submission for its members until assigned here.
        </p>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Team</TableHead>
                <TableHead>Unit Manager</TableHead>
                <TableHead>Department Head</TableHead>
                {canManage ? <TableHead className="w-12" aria-label="Actions" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    {canManage ? <TableCell /> : null}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={canManage ? 4 : 3} className="p-0">
                    <EmptyState icon={UsersRound} title="No active teams yet" className="rounded-none border-0" />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.teamId}>
                    <TableCell className="font-medium">{row.teamName}</TableCell>
                    <TableCell className={cn(!row.unitManager && "text-muted-foreground")}>
                      {row.unitManager?.name ?? "Not assigned"}
                    </TableCell>
                    <TableCell className={cn(!row.departmentHead && "text-muted-foreground")}>
                      {row.departmentHead?.name ?? "Not assigned"}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit approvers for ${row.teamName}`}
                          onClick={() => setEditing(row)}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">Could not load team approvers.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <EditApproversDialog
        row={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: teamApproversQueryKey() });
          setEditing(null);
        }}
      />
    </div>
  );
}

function EditApproversDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: TeamApproverRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {row ? <EditApproversForm key={row.teamId} row={row} onOpenChange={onOpenChange} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditApproversForm({
  row,
  onOpenChange,
  onSaved,
}: {
  row: TeamApproverRow;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [unitManagerId, setUnitManagerId] = React.useState(row.unitManager?.id ?? null);
  const [departmentHeadId, setDepartmentHeadId] = React.useState(row.departmentHead?.id ?? null);

  const options = useQuery({
    queryKey: recommendationApproverOptionsQueryKey(),
    queryFn: () => fetchRecommendationApproverOptions(),
  });

  const mutation = useMutation({
    mutationFn: (): Promise<ActionResult> =>
      setTeamApprovers({ teamId: row.teamId, unitManagerUserId: unitManagerId, departmentHeadUserId: departmentHeadId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        onSaved();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Approvers for {row.teamName}</DialogTitle>
        <DialogDescription>Who reviews an Employee Recommendation for this team&apos;s members.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Unit Manager</Label>
          <ApproverPicker
            value={unitManagerId}
            onChange={setUnitManagerId}
            options={options.data ?? []}
            loading={options.isPending}
            disabled={mutation.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Department Head</Label>
          <ApproverPicker
            value={departmentHeadId}
            onChange={setDepartmentHeadId}
            options={options.data ?? []}
            loading={options.isPending}
            disabled={mutation.isPending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function ApproverPicker({
  value,
  onChange,
  options,
  loading,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: LookupOption[];
  loading: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = options.find((o) => o.id === value) ?? null;
  const query = search.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.name.toLowerCase().includes(query)) : options;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <UserRound className="size-4" aria-hidden />
              Not assigned
            </span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-72 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              autoFocus
              placeholder="Search user"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setSearch("");
            }}
            className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
          >
            <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Not assigned</span>
            {!value ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          </button>
          {loading ? (
            <p className="text-muted-foreground p-3 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {options.length === 0
                ? "No one holds Unit Manager/Department Head (or another role with Approve on this module) yet — assign that in Access Control first."
                : "No matching users."}
            </p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setSearch("");
                }}
                className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
              >
                <span className="flex-1 truncate">{option.name}</span>
                {value === option.id ? <Check className="size-4 shrink-0" aria-hidden /> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
