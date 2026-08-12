"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/layout/pagination-footer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatAddressSummary, formatEmployeeName } from "@/lib/employee-format";
import { useDebounced } from "@/hooks/use-debounced";
import { cn } from "@/lib/utils";
import { deleteEmployee, fetchEmployees } from "@/server/employees/actions";
import { employeesQueryKey } from "@/server/employees/query-key";
import type { EmployeeFilters, EmployeeListResult, EmployeeListRow } from "@/server/employees/types";

const PAGE_SIZE = 20;

type EmployeesViewProps = {
  initialFilters: EmployeeFilters;
  canCreate: boolean;
  canDelete: boolean;
};

export function EmployeesView({ initialFilters, canCreate, canDelete }: EmployeesViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [includeResigned, setIncludeResigned] = React.useState(initialFilters.includeResigned ?? false);
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  const filters = React.useMemo<EmployeeFilters>(
    () => ({ search: debouncedSearch || undefined, includeResigned, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, includeResigned, page],
  );

  // A new search (or the resigned-employees toggle) should snap back to page
  // 1 — same reasoning as Audit Trail and User Management's identical pattern.
  const filterSignature = `${debouncedSearch}|${includeResigned}`;
  const [previousSignature, setPreviousSignature] = React.useState(filterSignature);
  if (previousSignature !== filterSignature) {
    setPreviousSignature(filterSignature);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<EmployeeListResult>({
    queryKey: employeesQueryKey(filters),
    queryFn: () => fetchEmployees(filters),
    placeholderData: (previous) => previous,
  });

  const [deleting, setDeleting] = React.useState<EmployeeListRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const employees = data?.employees ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, code or email"
              aria-label="Search employees"
              className="pl-9"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Checkbox
              id="show-resigned"
              checked={includeResigned}
              onCheckedChange={(checked) => setIncludeResigned(checked === true)}
            />
            <Label htmlFor="show-resigned" className="text-sm font-normal whitespace-nowrap">
              Show resigned employees
            </Label>
          </div>
        </div>

        {canCreate ? (
          <Button asChild>
            <Link href="/employees/new">
              <Plus className="size-4" aria-hidden />
              Add employee
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[220px]">Full name</TableHead>
                <TableHead className="min-w-[120px]">Employee code</TableHead>
                <TableHead className="min-w-[180px]">Latest role</TableHead>
                <TableHead className="min-w-[180px]">Latest deployment</TableHead>
                <TableHead className="min-w-[200px]">Address</TableHead>
                <TableHead className="w-12" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-36" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : employees.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={IdCard}
                      title={search ? "No matching employees" : "No employees yet"}
                      description={
                        search
                          ? "Try a different name, code or email."
                          : "Add your first employee to start building the directory."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/employees/${row.id}`} className="font-medium hover:underline">
                          {formatEmployeeName(row)}
                        </Link>
                        {row.isResigned ? (
                          <Badge variant="outline" className="text-muted-foreground font-normal">
                            Resigned
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.code}</TableCell>
                    <TableCell className="text-sm">
                      {row.latestLevel && row.latestPosition ? `${row.latestLevel} - ${row.latestPosition}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.latestClient && row.latestProject ? `${row.latestClient} - ${row.latestProject}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatAddressSummary(row.currentAddress)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={mutation.isPending}
                            aria-label={`Actions for ${formatEmployeeName(row)}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/employees/${row.id}`}>View / edit</Link>
                          </DropdownMenuItem>
                          {canDelete ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                              <Trash2 className="size-4" aria-hidden />
                              Remove
                            </DropdownMenuItem>
                          ) : null}
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
            {error instanceof Error ? error.message : "Could not load employees."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="employee" />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this employee?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{formatEmployeeName(deleting)}</span> will be
                  permanently removed along with their address, employment and deployment history. This cannot be
                  undone.
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
                mutation.mutate(() => deleteEmployee({ id: deleting.id }));
              }}
            >
              Remove employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
