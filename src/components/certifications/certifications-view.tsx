"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Download, MoreHorizontal, Paperclip, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteMyCertification, fetchMyCertifications } from "@/server/certifications/actions";
import { myCertificationsQueryKey } from "@/server/certifications/query-key";
import type { CertificationFilters, CertificationListResult, CertificationRow } from "@/server/certifications/types";

const PAGE_SIZE = 20;

type CertificationsViewProps = {
  initialFilters: CertificationFilters;
};

export function CertificationsView({ initialFilters }: CertificationsViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState(initialFilters.search ?? "");
  const [page, setPage] = React.useState(1);

  const filters = React.useMemo<CertificationFilters>(
    () => ({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE }),
    [search, page],
  );

  const [previousSearch, setPreviousSearch] = React.useState(filters.search);
  if (previousSearch !== filters.search) {
    setPreviousSearch(filters.search);
    if (page !== 1) setPage(1);
  }

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<CertificationListResult>({
    queryKey: myCertificationsQueryKey(filters),
    queryFn: () => fetchMyCertifications(filters),
    placeholderData: (previous) => previous,
  });

  const [deleting, setDeleting] = React.useState<CertificationRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["certifications"] });
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const certifications = data?.certifications ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title"
          className="sm:max-w-xs"
        />

        <Button asChild>
          <Link href="/certifications/new">
            <Plus className="size-4" aria-hidden />
            Add certification
          </Link>
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[200px]">Title</TableHead>
                <TableHead className="min-w-[120px]">Date acquired</TableHead>
                <TableHead className="min-w-[100px]">Attachment</TableHead>
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
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : certifications.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={Award}
                      title="No certifications yet"
                      description="Add your first badge or certificate."
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                certifications.map((row) => (
                  <TableRow key={row.id} className={cn(isFetching && "opacity-70")}>
                    <TableCell>
                      <Link href={`/certifications/${row.id}`} className="font-medium hover:underline">
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(row.dateAcquired)}</TableCell>
                    <TableCell className="text-sm">
                      {row.fileName ? (
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Paperclip className="size-3.5" aria-hidden />
                          File
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={mutation.isPending}
                            aria-label={`Actions for ${row.title}`}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/certifications/${row.id}`}>View / edit</Link>
                          </DropdownMenuItem>
                          {row.fileName ? (
                            <DropdownMenuItem asChild>
                              <a href={`/api/certifications/${row.id}/file?download=1`}>
                                <Download className="size-4" aria-hidden />
                                Download file
                              </a>
                            </DropdownMenuItem>
                          ) : null}
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
            {error instanceof Error ? error.message : "Could not load certifications."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter total={total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="certification" />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this certification?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.title}</span> and its attached file (if
                  any) will be permanently removed. This cannot be undone.
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
                mutation.mutate(() => deleteMyCertification({ id: deleting.id }));
              }}
            >
              Remove certification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
