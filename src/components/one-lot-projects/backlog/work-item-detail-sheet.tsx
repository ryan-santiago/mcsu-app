"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, initialsOf } from "@/lib/format";
import { columnColor, WORK_ITEM_PRIORITY_LABELS } from "@/lib/one-lot-project-backlog-format";
import { workItemPriorityValues } from "@/lib/validation/one-lot-project-backlog";
import { createOneLotProjectWorkItem, fetchOneLotProjectWorkItemDetail, updateOneLotProjectWorkItem } from "@/server/one-lot-projects/backlog-actions";
import type { BoardColumnRow, WorkItemDetailRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { AssigneePicker } from "./assignee-picker";
import { CommentList } from "./comment-list";
import { WorkItemStatusBadge } from "./work-item-badges";

type WorkItemDetailSheetProps = {
  workItemId: string | null;
  projectId: string;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  onOpenChange: (open: boolean) => void;
};

export function WorkItemDetailSheet({ workItemId, projectId, members, columns, onOpenChange }: WorkItemDetailSheetProps) {
  const queryClient = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["one-lot-project-work-item", workItemId],
    queryFn: () => fetchOneLotProjectWorkItemDetail(workItemId as string, projectId),
    enabled: Boolean(workItemId),
  });

  const patchMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateOneLotProjectWorkItem>[0]["patch"]) =>
      updateOneLotProjectWorkItem({ id: workItemId as string, projectId, patch }),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-work-item", workItemId] });
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Sheet open={Boolean(workItemId)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {isLoading || !item ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <WorkItemDetailBody
            key={item.id}
            item={item}
            projectId={projectId}
            members={members}
            columns={columns}
            onPatch={(patch) => patchMutation.mutate(patch)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function WorkItemDetailBody({
  item,
  projectId,
  members,
  columns,
  onPatch,
}: {
  item: WorkItemDetailRow;
  projectId: string;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  onPatch: (patch: Parameters<typeof updateOneLotProjectWorkItem>[0]["patch"]) => void;
}) {
  const [title, setTitle] = React.useState(item.title);
  const [description, setDescription] = React.useState(item.description ?? "");
  const [storyPoints, setStoryPoints] = React.useState(item.storyPoints ?? "");
  const [detailsOpen, setDetailsOpen] = React.useState(true);

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b">
        <span className="text-muted-foreground font-mono text-xs">{item.code}</span>
        <SheetTitle className="sr-only">{item.title}</SheetTitle>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() && title !== item.title && onPatch({ title: title.trim() })}
          className="border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
      </SheetHeader>

      <div className="space-y-6 p-4">
        <Select value={item.columnId} onValueChange={(value) => onPatch({ columnId: value })}>
          <SelectTrigger className="w-40">
            <SelectValue>
              {(() => {
                const index = columns.findIndex((c) => c.id === item.columnId);
                const current = columns[index];
                return current ? <WorkItemStatusBadge name={current.name} color={columnColor(index)} /> : null;
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium">Description</p>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => description !== (item.description ?? "") && onPatch({ description })}
            rows={4}
            placeholder="Add a description..."
          />
        </div>

        <SubtasksSection item={item} projectId={projectId} />

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "" : "-rotate-90"}`} aria-hidden />
              Details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Assignee</p>
              <AssigneePicker members={members} value={item.assignee?.id ?? null} onChange={(id) => onPatch({ assigneeId: id ?? "" })} />
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Priority</p>
              <Select value={item.priority} onValueChange={(value) => onPatch({ priority: value as WorkItemDetailRow["priority"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workItemPriorityValues.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {WORK_ITEM_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Parent</p>
              <p className="text-sm">{item.parentCode ?? "—"}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Sprint</p>
              <p className="text-sm">{item.sprintName ?? "Backlog"}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Due date</p>
              <DatePicker value={item.dueDate ?? undefined} onChange={(value) => onPatch({ dueDate: value })} />
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Story points</p>
              <Input
                value={storyPoints}
                onChange={(event) => setStoryPoints(event.target.value)}
                onBlur={() => storyPoints !== (item.storyPoints ?? "") && onPatch({ storyPoints })}
                inputMode="decimal"
                placeholder="0.5"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="text-muted-foreground space-y-0.5 text-xs">
          <p>Created {formatDateTime(item.createdAt)}</p>
          <p>Updated {formatDateTime(item.updatedAt)}</p>
        </div>

        <CommentList workItemId={item.id} projectId={projectId} comments={item.comments} />
      </div>
    </div>
  );
}

function SubtasksSection({
  item,
  projectId,
}: {
  item: WorkItemDetailRow;
  projectId: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createOneLotProjectWorkItem({
        projectId,
        sprintId: item.sprintId,
        parentId: item.id,
        type: item.type,
        title,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        setTitle("");
        setAdding(false);
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-work-item", item.id] });
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">
          Subtasks {item.subtasks.length > 0 ? `(${item.doneSubtaskCount}/${item.subtaskCount})` : ""}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="size-3.5" aria-hidden />
          Add subtask
        </Button>
      </div>

      {item.subtasks.length > 0 ? (
        <ul className="space-y-1">
          {item.subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              <span className="text-muted-foreground shrink-0 font-mono text-xs">{subtask.code}</span>
              <span className="min-w-0 flex-1 truncate">{subtask.title}</span>
              <Avatar size="sm">
                <AvatarFallback>{subtask.assignee ? initialsOf(subtask.assignee.name) : "—"}</AvatarFallback>
              </Avatar>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Subtask title"
            disabled={mutation.isPending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && title.trim()) mutation.mutate();
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" disabled={!title.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
