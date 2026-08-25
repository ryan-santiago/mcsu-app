"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "@/components/layout/empty-state";
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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { ActionResult } from "@/lib/action-result";
import {
  createJobProfile,
  deleteJobProfile,
  fetchJobProfiles,
  fetchPositionLevelOptions,
  setJobProfileActive,
  updateJobProfile,
} from "@/server/job-profiles/actions";
import { jobProfilesQueryKey } from "@/server/job-profiles/query-key";
import type { JobProfileRow } from "@/server/job-profiles/types";
import type { LookupOption } from "@/server/maintenance/types";

type JobProfilesTableProps = {
  canManage: boolean;
};

export function JobProfilesTable({ canManage }: JobProfilesTableProps) {
  const queryClient = useQueryClient();

  const { data, isPending, isFetching, isError, error, refetch } = useQuery<JobProfileRow[]>({
    queryKey: jobProfilesQueryKey(),
    queryFn: fetchJobProfiles,
    placeholderData: (previous) => previous,
  });

  const optionsQuery = useQuery({
    queryKey: ["job-profiles", "options"],
    queryFn: fetchPositionLevelOptions,
  });

  const [editing, setEditing] = React.useState<JobProfileRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<JobProfileRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: jobProfilesQueryKey() });
        setEditing(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const rows = data ?? [];

  function handleSubmit(values: JobProfileFormValues) {
    if (editing === "new") {
      mutation.mutate(() => createJobProfile(values));
    } else if (editing) {
      mutation.mutate(() => updateJobProfile({ id: editing.id, ...values }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {rows.length} job profile{rows.length === 1 ? "" : "s"}
        </p>
        {canManage ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Add job profile
          </Button>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Position</TableHead>
                <TableHead>Level</TableHead>
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
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
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
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4 + (canManage ? 1 : 0)} className="p-0">
                    <EmptyState
                      icon={BriefcaseBusiness}
                      title="No job profiles yet"
                      description={
                        canManage
                          ? "Pair a Position with a Level to define its job description and qualifications."
                          : "Job profiles appear here once an administrator adds one."
                      }
                      className="rounded-none border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id} className={isFetching ? "opacity-70" : undefined}>
                    <TableCell className="font-medium">{row.positionName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.levelName}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            size="sm"
                            checked={row.isActive}
                            disabled={mutation.isPending}
                            onCheckedChange={(checked) =>
                              mutation.mutate(() => setJobProfileActive({ id: row.id, isActive: checked }))
                            }
                            aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.positionName} — ${row.levelName}`}
                          />
                          <span className="text-muted-foreground text-xs">
                            {row.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">{row.isActive ? "Active" : "Inactive"}</span>
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
                              aria-label={`Actions for ${row.positionName} — ${row.levelName}`}
                            >
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(row)}>
                              <Pencil className="size-4" aria-hidden />
                              Edit
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
            {error instanceof Error ? error.message : "Could not load job profiles."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}

      <JobProfileDialog
        target={editing}
        positions={optionsQuery.data?.positions ?? []}
        levels={optionsQuery.data?.levels ?? []}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job profile?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">
                    {deleting.positionName} — {deleting.levelName}
                  </span>{" "}
                  will be permanently removed, including its job description and qualifications.
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
                mutation.mutate(() => deleteJobProfile({ id: deleting.id }));
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

const jobProfileFormSchema = z.object({
  positionId: z.string().min(1, "Select a position"),
  levelId: z.string().min(1, "Select a level"),
  jobDescription: z.string().optional(),
  jobQualification: z.string().optional(),
});
type JobProfileFormInput = z.infer<typeof jobProfileFormSchema>;
type JobProfileFormValues = JobProfileFormInput;

type JobProfileDialogProps = {
  target: JobProfileRow | "new" | null;
  positions: LookupOption[];
  levels: LookupOption[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: JobProfileFormValues) => void;
};

function JobProfileDialog({ target, positions, levels, pending, onOpenChange, onSubmit }: JobProfileDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {target ? (
          <JobProfileForm
            key={isEdit ? target.id : "new-job-profile"}
            isEdit={isEdit}
            positions={positions}
            levels={levels}
            defaultValues={
              isEdit
                ? {
                    positionId: target.positionId,
                    levelId: target.levelId,
                    jobDescription: target.jobDescription ?? "",
                    jobQualification: target.jobQualification ?? "",
                  }
                : { positionId: "", levelId: "", jobDescription: "", jobQualification: "" }
            }
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function JobProfileForm({
  isEdit,
  positions,
  levels,
  defaultValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  positions: LookupOption[];
  levels: LookupOption[];
  defaultValues: JobProfileFormInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: JobProfileFormValues) => void;
}) {
  const form = useForm<JobProfileFormInput>({
    resolver: zodResolver(jobProfileFormSchema),
    defaultValues,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit job profile" : "Add job profile"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the job description and qualifications for this position and level."
            : "Pair a position with a level to define what that combination actually means day to day."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="positionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {positions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="levelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {levels.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="jobDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job description</FormLabel>
                <FormControl>
                  <RichTextEditor
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    disabled={pending}
                    placeholder="What does someone in this role actually do?"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="jobQualification"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job qualification</FormLabel>
                <FormControl>
                  <RichTextEditor
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    disabled={pending}
                    placeholder="What's required or preferred to be considered for this role?"
                  />
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
              {isEdit ? "Save changes" : "Add job profile"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
