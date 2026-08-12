"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatPeriod, sortHistoryRecords, type HistorySortOrder } from "@/lib/employee-format";
import { deploymentRecordSchema, type DeploymentRecordInput } from "@/lib/validation/employee";
import { addDeploymentRecord, deleteDeploymentRecord, fetchLookupOptions, updateDeploymentRecord } from "@/server/employees/actions";
import type { DeploymentRecordRow } from "@/server/employees/types";

type DeploymentHistoryTableProps = {
  employeeId: string;
  records: DeploymentRecordRow[];
  canEdit: boolean;
  canDelete: boolean;
};

export function DeploymentHistoryTable({ employeeId, records, canEdit, canDelete }: DeploymentHistoryTableProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<DeploymentRecordRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<DeploymentRecordRow | null>(null);
  const [sortOrder, setSortOrder] = React.useState<HistorySortOrder>("latest");

  const sortedRecords = React.useMemo(() => sortHistoryRecords(records, sortOrder), [records, sortOrder]);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
        setEditing(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment history</CardTitle>
        <CardDescription>Client and project assignments over time.</CardDescription>
        <CardAction className="flex items-center gap-2">
          {records.length > 1 ? (
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as HistorySortOrder)}>
              <SelectTrigger size="sm" aria-label="Sort deployment history">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Latest to oldest</SelectItem>
                <SelectItem value="oldest">Oldest to latest</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              Add record
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {sortedRecords.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No deployment history yet"
            description={
              canEdit
                ? "Add the first record to establish this employee's current deployment."
                : "Deployment records will appear here once one is added."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  {canEdit || canDelete ? <TableHead className="w-12" aria-label="Actions" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">{formatPeriod(record.startDate, record.endDate)}</TableCell>
                    <TableCell>{record.clientName}</TableCell>
                    <TableCell>{record.project}</TableCell>
                    {canEdit || canDelete ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={mutation.isPending} aria-label="Actions">
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit ? (
                              <DropdownMenuItem onSelect={() => setEditing(record)}>
                                <Pencil className="size-4" aria-hidden />
                                Edit
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(record)}>
                                <Trash2 className="size-4" aria-hidden />
                                Remove
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <DeploymentRecordDialog
        employeeId={employeeId}
        target={editing}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={(values) => {
          if (editing === "new") {
            mutation.mutate(() => addDeploymentRecord({ employeeId, ...values }));
          } else if (editing) {
            mutation.mutate(() => updateDeploymentRecord({ id: editing.id, employeeId, ...values }));
          }
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this deployment record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  The record covering{" "}
                  <span className="text-foreground font-medium">{formatPeriod(deleting.startDate, deleting.endDate)}</span>{" "}
                  will be permanently removed.
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
                mutation.mutate(() => deleteDeploymentRecord({ id: deleting.id, employeeId }));
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type DeploymentRecordDialogProps = {
  employeeId: string;
  target: DeploymentRecordRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeploymentRecordInput) => void;
};

function DeploymentRecordDialog({ target, pending, onOpenChange, onSubmit }: DeploymentRecordDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <DeploymentRecordForm
            key={isEdit ? target.id : "new"}
            isEdit={isEdit}
            record={isEdit ? target : undefined}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeploymentRecordForm({
  isEdit,
  record,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  record?: DeploymentRecordRow;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeploymentRecordInput) => void;
}) {
  const clientOptions = useQuery({ queryKey: ["employee-lookup-options", "client"], queryFn: () => fetchLookupOptions("client") });

  const form = useForm<DeploymentRecordInput>({
    resolver: zodResolver(deploymentRecordSchema),
    defaultValues: {
      clientId: record?.clientId ?? "",
      project: record?.project ?? "",
      startDate: record?.startDate ?? "",
      endDate: record?.endDate ?? "",
    },
  });

  const [ongoing, setOngoing] = React.useState(!record || !record.endDate);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit deployment record" : "Add deployment record"}</DialogTitle>
        <DialogDescription>
          Adding a record with no end date automatically closes any previous ongoing deployment.
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => onSubmit({ ...values, endDate: ongoing ? "" : values.endDate }))}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientOptions.data?.map((option) => (
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
              name="project"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={pending} placeholder="e.g. Fullstack Developer" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <DatePicker value={field.value} onChange={field.onChange} disabled={pending} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {!ongoing ? (
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={pending} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="ongoing-deployment" checked={ongoing} onCheckedChange={(checked) => setOngoing(checked === true)} />
            <Label htmlFor="ongoing-deployment" className="text-sm font-normal">
              Currently deployed here
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {isEdit ? "Save changes" : "Add record"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
