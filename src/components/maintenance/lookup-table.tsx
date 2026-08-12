"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, type LucideIcon } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "@/components/layout/empty-state";
import { PaginationFooter } from "@/components/layout/pagination-footer";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate } from "@/lib/format";
import {
  createLookupEntry,
  deleteLookupEntry,
  fetchLookup,
  setLookupActive,
  updateLookupEntry,
} from "@/server/maintenance/actions";
import { lookupQueryKey } from "@/server/maintenance/query-key";
import type { LookupKind, LookupRow } from "@/server/maintenance/types";
import type { ActionResult } from "@/lib/action-result";

const nameFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "That name is too long"),
});
type NameFormInput = z.infer<typeof nameFormSchema>;

const PAGE_SIZE = 20;

type LookupTableProps = {
  kind: LookupKind;
  label: string;
  singular: string;
  icon: LucideIcon;
  canManage: boolean;
};

export function LookupTable({ kind, label, singular, icon: Icon, canManage }: LookupTableProps) {
  const queryClient = useQueryClient();

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<LookupRow[]>({
    queryKey: lookupQueryKey(kind),
    queryFn: () => fetchLookup(kind),
    placeholderData: (previous) => previous,
  });

  const [editing, setEditing] = React.useState<LookupRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<LookupRow | null>(null);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const debouncedSearch = useDebounced(search);

  // A new search should snap back to page 1 — same reasoning as every other
  // paginated list in the console (Users, Employees, Audit Trail).
  const [previousSearch, setPreviousSearch] = React.useState(debouncedSearch);
  if (previousSearch !== debouncedSearch) {
    setPreviousSearch(debouncedSearch);
    if (page !== 1) setPage(1);
  }

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: lookupQueryKey(kind) });
        setEditing(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const rows = data ?? [];
  const query = debouncedSearch.trim().toLowerCase();
  const filteredRows = query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="pl-9"
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <p className="text-muted-foreground text-sm whitespace-nowrap">
            {filteredRows.length} {filteredRows.length === 1 ? singular.toLowerCase() : label.toLowerCase()}
          </p>
          {canManage ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              Add {singular.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-36">Added</TableHead>
                {canManage ? <TableHead className="w-12" aria-label="Actions" /> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {isPending ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-3.5 w-20" />
                    </TableCell>
                    {canManage ? <TableCell /> : null}
                  </TableRow>
                ))
              ) : filteredRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={canManage ? 4 : 3} className="p-0">
                    <EmptyState
                      icon={Icon}
                      title={search ? `No matching ${label.toLowerCase()}` : `No ${label.toLowerCase()} yet`}
                      description={
                        search
                          ? "Try a different name."
                          : canManage
                            ? `Add the first ${singular.toLowerCase()} to make it available on employee records.`
                            : `${label} appear here once an administrator adds one.`
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((row) => (
                  <TableRow key={row.id} className={isFetching ? "opacity-70" : undefined}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            size="sm"
                            checked={row.isActive}
                            disabled={mutation.isPending}
                            onCheckedChange={(checked) =>
                              mutation.mutate(() => setLookupActive({ kind, id: row.id, isActive: checked }))
                            }
                            aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.name}`}
                          />
                          <span className="text-muted-foreground text-xs">
                            {row.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ) : (
                        <Badge variant={row.isActive ? "default" : "outline"}>
                          {row.isActive ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={mutation.isPending}
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(row)}>
                              <Pencil className="size-4" aria-hidden />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                              <Trash2 className="size-4" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
          <p className="text-destructive text-sm">
            {error instanceof Error ? error.message : `Could not load ${label.toLowerCase()}.`}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <PaginationFooter
        total={filteredRows.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        itemLabel={singular.toLowerCase()}
      />

      <LookupEntryDialog
        kind={kind}
        singular={singular}
        target={editing}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={(name) => {
          if (editing === "new") {
            mutation.mutate(() => createLookupEntry({ kind, name }));
          } else if (editing) {
            mutation.mutate(() => updateLookupEntry({ kind, id: editing.id, name }));
          }
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {singular.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.name}</span> will be permanently
                  removed. If it&apos;s used by any employee record, deletion is blocked — deactivate it instead.
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
                mutation.mutate(() => deleteLookupEntry({ kind, id: deleting.id }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type LookupEntryDialogProps = {
  kind: LookupKind;
  singular: string;
  target: LookupRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
};

function LookupEntryDialog({ kind, singular, target, pending, onOpenChange, onSubmit }: LookupEntryDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <LookupEntryForm
            key={isEdit ? target.id : `new-${kind}`}
            singular={singular}
            isEdit={isEdit}
            defaultName={isEdit ? target.name : ""}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LookupEntryForm({
  singular,
  isEdit,
  defaultName,
  pending,
  onOpenChange,
  onSubmit,
}: {
  singular: string;
  isEdit: boolean;
  defaultName: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const form = useForm<NameFormInput>({
    resolver: zodResolver(nameFormSchema),
    defaultValues: { name: defaultName },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Rename ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? `Update the name shown wherever ${singular.toLowerCase()} appears.`
            : `This becomes selectable on employee records right away.`}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => onSubmit(values.name.trim()))}
          className="space-y-4"
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus disabled={pending} placeholder={`e.g. ${singular}`} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isEdit ? "Save changes" : `Add ${singular.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
