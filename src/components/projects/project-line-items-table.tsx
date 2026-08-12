"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { formatMoneyInput, formatSalary } from "@/lib/employee-format";
import { projectDetailSchema, type ProjectDetailInput } from "@/lib/validation/project";
import {
  addProjectDetail,
  deleteProjectDetail,
  fetchProjectLookupOptions,
  updateProjectDetail,
} from "@/server/projects/actions";
import type { ProjectLineItemRow } from "@/server/projects/types";

function grossProfit(contractPrice: string, estimatedCost: string): number {
  const price = Number(contractPrice.replace(/,/g, ""));
  const cost = Number(estimatedCost.replace(/,/g, ""));
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return 0;
  return price - cost;
}

type ProjectLineItemsTableProps = {
  projectId: string;
  lineItems: ProjectLineItemRow[];
  canEdit: boolean;
  canDelete: boolean;
};

export function ProjectLineItemsTable({ projectId, lineItems, canEdit, canDelete }: ProjectLineItemsTableProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<ProjectLineItemRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectLineItemRow | null>(null);

  const mutation = useMutation({
    mutationFn: async (task: () => Promise<ActionResult>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        setEditing(null);
        setDeleting(null);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const totals = lineItems.reduce(
    (acc, line) => {
      const price = Number(line.contractPrice);
      const cost = Number(line.estimatedCost);
      acc.contractPrice += Number.isFinite(price) ? price : 0;
      acc.estimatedCost += Number.isFinite(cost) ? cost : 0;
      return acc;
    },
    { contractPrice: 0, estimatedCost: 0 },
  );
  const totalGrossProfit = totals.contractPrice - totals.estimatedCost;

  return (
    <Card>
      <CardHeader>
        <CardTitle>S3P Financial Information</CardTitle>
        <CardDescription>Contract value, cost and gross profit per line.</CardDescription>
        <CardAction>
          {canEdit ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              Add detail
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {lineItems.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No S3P details yet"
            description={
              canEdit
                ? "Add the first financial line to start projecting this project's gross profit."
                : "S3P details will appear here once one is added."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Description</TableHead>
                  <TableHead>Team(s)</TableHead>
                  <TableHead className="text-right">Contract Price</TableHead>
                  <TableHead className="text-right">Estimated Cost</TableHead>
                  <TableHead className="text-right">Estimated Gross Profit</TableHead>
                  {canEdit || canDelete ? <TableHead className="w-12" aria-label="Actions" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {line.teams.map((team) => (
                          <Badge key={team.id} variant="outline" className="font-normal">
                            {team.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatSalary(line.contractPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatSalary(line.estimatedCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSalary(grossProfit(line.contractPrice, line.estimatedCost))}
                    </TableCell>
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
                              <DropdownMenuItem onSelect={() => setEditing(line)}>
                                <Pencil className="size-4" aria-hidden />
                                Edit
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(line)}>
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
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={2} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatSalary(totals.contractPrice)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatSalary(totals.estimatedCost)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatSalary(totalGrossProfit)}
                  </TableCell>
                  {canEdit || canDelete ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>

      <ProjectDetailDialog
        target={editing}
        pending={mutation.isPending}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={(values) => {
          if (editing === "new") {
            mutation.mutate(() => addProjectDetail({ projectId, ...values }));
          } else if (editing) {
            mutation.mutate(() => updateProjectDetail({ id: editing.id, projectId, ...values }));
          }
        }}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this S3P detail?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? (
                <>
                  <span className="text-foreground font-medium">{deleting.description}</span> will be permanently
                  removed.
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
                mutation.mutate(() => deleteProjectDetail({ id: deleting.id, projectId }));
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

type ProjectDetailDialogProps = {
  target: ProjectLineItemRow | "new" | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectDetailInput) => void;
};

function ProjectDetailDialog({ target, pending, onOpenChange, onSubmit }: ProjectDetailDialogProps) {
  const isEdit = target !== null && target !== "new";

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <ProjectDetailForm
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

function ProjectDetailForm({
  isEdit,
  record,
  pending,
  onOpenChange,
  onSubmit,
}: {
  isEdit: boolean;
  record?: ProjectLineItemRow;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectDetailInput) => void;
}) {
  const teamOptions = useQuery({
    queryKey: ["project-lookup-options", "team"],
    queryFn: () => fetchProjectLookupOptions("team"),
  });

  const form = useForm<ProjectDetailInput>({
    resolver: zodResolver(projectDetailSchema),
    defaultValues: {
      description: record?.description ?? "",
      contractPrice: record ? formatMoneyInput(record.contractPrice) : "",
      estimatedCost: record ? formatMoneyInput(record.estimatedCost) : "",
      teamIds: record?.teams.map((team) => team.id) ?? [],
    },
  });

  // `useWatch` rather than `form.watch()`: the latter returns a fresh function
  // each render, which opts the whole component out of React Compiler memoing.
  const contractPrice = useWatch({ control: form.control, name: "contractPrice" }) ?? "";
  const estimatedCost = useWatch({ control: form.control, name: "estimatedCost" }) ?? "";
  const teamIds = useWatch({ control: form.control, name: "teamIds" }) ?? [];
  const previewGrossProfit = grossProfit(contractPrice, estimatedCost);

  function toggleTeam(teamId: string, checked: boolean) {
    const next = checked ? [...teamIds, teamId] : teamIds.filter((id) => id !== teamId);
    form.setValue("teamIds", next, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit S3P detail" : "Add S3P detail"}</DialogTitle>
        <DialogDescription>Estimated gross profit is contract price minus estimated cost.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} placeholder="e.g. Support Services 8x5 (12 Months)" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="contractPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Price</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(event) => field.onChange(formatMoneyInput(event.target.value))}
                      disabled={pending}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Cost</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      onChange={(event) => field.onChange(formatMoneyInput(event.target.value))}
                      disabled={pending}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="bg-muted/50 flex items-center justify-between rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">Estimated Gross Profit</span>
            <span className="font-semibold tabular-nums">{formatSalary(previewGrossProfit)}</span>
          </div>

          <FormField
            control={form.control}
            name="teamIds"
            render={() => (
              <FormItem>
                <FormLabel>Team(s)</FormLabel>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {teamOptions.data?.length ? (
                    teamOptions.data.map((option) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`team-${option.id}`}
                          checked={teamIds.includes(option.id)}
                          disabled={pending}
                          onCheckedChange={(checked) => toggleTeam(option.id, checked === true)}
                        />
                        <Label htmlFor={`team-${option.id}`} className="text-sm font-normal">
                          {option.name}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No teams available yet.</p>
                  )}
                </div>
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
              {isEdit ? "Save changes" : "Add detail"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
