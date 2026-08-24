"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, Loader2, Plus } from "lucide-react";
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
import type { BoardColumnRow, WorkItemDetailRow, WorkItemSubtaskRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { AssigneePicker } from "./assignee-picker";
import { CommentList } from "./comment-list";
import { CoverColorPicker } from "./cover-color-picker";
import { WorkItemCoverBar, WorkItemPriorityBadge, WorkItemStatusBadge } from "./work-item-badges";

type WorkItemDetailSheetProps = {
  workItemId: string | null;
  projectId: string;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  onOpenChange: (open: boolean) => void;
};

export function WorkItemDetailSheet({ workItemId, projectId, members, columns, onOpenChange }: WorkItemDetailSheetProps) {
  return (
    <Sheet open={Boolean(workItemId)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {workItemId ? (
          // Keyed by the externally-opened id so drilling into a subtask (internal
          // navigation state below) resets automatically whenever a *different*
          // item is opened from the board, without an effect syncing state to props.
          <WorkItemDetailNavigator key={workItemId} rootId={workItemId} projectId={projectId} members={members} columns={columns} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function WorkItemDetailNavigator({
  rootId,
  projectId,
  members,
  columns,
}: {
  rootId: string;
  projectId: string;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
}) {
  const [displayedId, setDisplayedId] = React.useState(rootId);
  const queryClient = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["one-lot-project-work-item", displayedId],
    queryFn: () => fetchOneLotProjectWorkItemDetail(displayedId, projectId),
  });

  const patchMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateOneLotProjectWorkItem>[0]["patch"]) =>
      updateOneLotProjectWorkItem({ id: displayedId, projectId, patch }),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-work-item", displayedId] });
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (isLoading || !item) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <WorkItemDetailBody
      key={item.id}
      item={item}
      projectId={projectId}
      members={members}
      columns={columns}
      onPatch={(patch) => patchMutation.mutate(patch)}
      onNavigate={setDisplayedId}
    />
  );
}

function WorkItemDetailBody({
  item,
  projectId,
  members,
  columns,
  onPatch,
  onNavigate,
}: {
  item: WorkItemDetailRow;
  projectId: string;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  onPatch: (patch: Parameters<typeof updateOneLotProjectWorkItem>[0]["patch"]) => void;
  onNavigate: (id: string) => void;
}) {
  const [title, setTitle] = React.useState(item.title);
  const [description, setDescription] = React.useState(item.description ?? "");
  const [storyPoints, setStoryPoints] = React.useState(item.storyPoints ?? "");
  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const canHaveCover = item.type !== "subtask";

  return (
    <div className="flex flex-col">
      <WorkItemCoverBar color={item.coverColor} />

      <SheetHeader className="border-b">
        {item.parentId ? (
          <button
            type="button"
            onClick={() => onNavigate(item.parentId!)}
            className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1 text-xs font-medium"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Back to {item.parentCode}
          </button>
        ) : null}
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
        <div className="flex flex-wrap items-center gap-2">
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

          {canHaveCover ? (
            <CoverColorPicker value={item.coverColor} onChange={(color) => onPatch({ coverColor: color })} />
          ) : null}
        </div>

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

        {item.type === "task" ? (
          <SubtasksSection item={item} projectId={projectId} columns={columns} onNavigate={onNavigate} />
        ) : null}

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
  columns,
  onNavigate,
}: {
  item: WorkItemDetailRow;
  projectId: string;
  columns: BoardColumnRow[];
  onNavigate: (id: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-work-item", item.id] });
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createOneLotProjectWorkItem({
        projectId,
        sprintId: item.sprintId,
        parentId: item.id,
        type: "subtask",
        title,
      }),
    onSuccess: (result) => {
      if (result.ok) {
        setTitle("");
        setAdding(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; columnId: string }) =>
      updateOneLotProjectWorkItem({ id: input.id, projectId, patch: { columnId: input.columnId } }),
    onSuccess: (result) => {
      if (result.ok) invalidate();
      else toast.error(result.error);
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
        <div className="overflow-hidden rounded-md border">
          <div className="bg-muted/40 text-muted-foreground grid grid-cols-[1fr_auto_auto_8.5rem] items-center gap-2 border-b px-2.5 py-1.5 text-xs font-medium">
            <span>Work</span>
            <span>Priority</span>
            <span>Assignee</span>
            <span>Status</span>
          </div>
          {item.subtasks.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              subtask={subtask}
              columns={columns}
              onOpen={() => onNavigate(subtask.id)}
              onStatusChange={(columnId) => statusMutation.mutate({ id: subtask.id, columnId })}
            />
          ))}
        </div>
      ) : null}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Subtask title"
            disabled={createMutation.isPending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && title.trim()) createMutation.mutate();
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" disabled={!title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Add"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SubtaskRow({
  subtask,
  columns,
  onOpen,
  onStatusChange,
}: {
  subtask: WorkItemSubtaskRow;
  columns: BoardColumnRow[];
  onOpen: () => void;
  onStatusChange: (columnId: string) => void;
}) {
  const columnIndex = columns.findIndex((c) => c.id === subtask.columnId);
  const column = columns[columnIndex];

  return (
    <div className="grid grid-cols-[1fr_auto_auto_8.5rem] items-center gap-2 border-b px-2.5 py-1.5 text-sm last:border-b-0">
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2 text-left">
        <span className="text-brand shrink-0 font-mono text-xs hover:underline">{subtask.code}</span>
        <span className="truncate">{subtask.title}</span>
      </button>
      <WorkItemPriorityBadge priority={subtask.priority} />
      <Avatar size="sm" title={subtask.assignee?.name ?? "Unassigned"}>
        <AvatarFallback>{subtask.assignee ? initialsOf(subtask.assignee.name) : "—"}</AvatarFallback>
      </Avatar>
      <Select value={subtask.columnId} onValueChange={onStatusChange}>
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue>{column ? <WorkItemStatusBadge name={column.name} color={columnColor(columnIndex)} /> : null}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
