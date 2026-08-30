"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORK_ITEM_PRIORITY_LABELS } from "@/lib/one-lot-project-backlog-format";
import { workItemFormSchema, workItemPriorityValues, type WorkItemFormInput } from "@/lib/validation/one-lot-project-backlog";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { AssigneePicker } from "./assignee-picker";
import { WorkItemPriorityBadge } from "./work-item-badges";

const BLANK_SUBTASK = { title: "", assigneeId: "" };

type CreateWorkItemDialogProps = {
  open: boolean;
  members: OneLotProjectMemberRow[];
  destinationLabel: string;
  /** Prefills the Due date field — the Calendar's quick-add uses this; every other caller omits it. */
  initialDueDate?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WorkItemFormInput) => void;
};

export function CreateWorkItemDialog({
  open,
  members,
  destinationLabel,
  initialDueDate,
  pending,
  onOpenChange,
  onSubmit,
}: CreateWorkItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {open ? (
          <WorkItemForm
            members={members}
            destinationLabel={destinationLabel}
            initialDueDate={initialDueDate}
            pending={pending}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WorkItemForm({
  members,
  destinationLabel,
  initialDueDate,
  pending,
  onOpenChange,
  onSubmit,
}: {
  members: OneLotProjectMemberRow[];
  destinationLabel: string;
  initialDueDate?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WorkItemFormInput) => void;
}) {
  const form = useForm<WorkItemFormInput>({
    resolver: zodResolver(workItemFormSchema),
    defaultValues: {
      type: "task",
      title: "",
      description: "",
      assigneeId: "",
      priority: "medium",
      dueDate: initialDueDate ?? "",
      storyPoints: "",
      subtasks: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "subtasks" });
  // Subtasks are only ever created under a Task, never a Bug.
  const type = useWatch({ control: form.control, name: "type" });
  const canHaveSubtasks = type === "task";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create work item</DialogTitle>
        <DialogDescription>Adding to {destinationLabel}.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} placeholder="What needs to be done?" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <RichTextEditor value={field.value ?? ""} onChange={field.onChange} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {canHaveSubtasks ? (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Subtasks</FormLabel>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => append(BLANK_SUBTASK)}
              >
                <Plus className="size-4" aria-hidden />
                Add subtask
              </Button>
            </div>
            {fields.length > 0 ? (
              <div className="space-y-2">
                {fields.map((subtaskField, index) => (
                  <div key={subtaskField.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`subtasks.${index}.title`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input {...field} disabled={pending} placeholder="Subtask title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`subtasks.${index}.assigneeId`}
                      render={({ field }) => (
                        <FormItem className="w-48">
                          <AssigneePicker
                            members={members}
                            value={field.value || null}
                            onChange={(id) => field.onChange(id ?? "")}
                            disabled={pending}
                          />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`Remove subtask ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </FormItem>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignee</FormLabel>
                  <AssigneePicker
                    members={members}
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? "")}
                    disabled={pending}
                  />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {workItemPriorityValues.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          <span className="flex items-center gap-2">
                            <WorkItemPriorityBadge priority={priority} />
                            {WORK_ITEM_PRIORITY_LABELS[priority]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="storyPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story points</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={pending} inputMode="decimal" placeholder="0.5" />
                  </FormControl>
                  <p className="text-muted-foreground text-xs">1 story point ≈ 2 hours.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
