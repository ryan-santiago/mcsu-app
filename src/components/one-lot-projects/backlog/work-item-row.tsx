"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, MessageSquare, SquareStack } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { columnColor } from "@/lib/one-lot-project-backlog-format";
import { cn } from "@/lib/utils";
import type { BoardColumnRow, WorkItemRow as WorkItemRowData, WorkItemSubtaskRow } from "@/server/one-lot-projects/backlog-types";

import { WorkItemCoverBar, WorkItemPriorityBadge, WorkItemStatusBadge, WorkItemTypeBadge } from "./work-item-badges";

type WorkItemRowProps = {
  item: WorkItemRowData;
  columns: BoardColumnRow[];
  onOpenItem: (id: string) => void;
};

export function WorkItemRow({ item, columns, onOpenItem }: WorkItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [expanded, setExpanded] = React.useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("overflow-hidden rounded-lg border", isDragging && "opacity-50")}>
      <WorkItemCoverBar color={item.coverColor} />
      <div className="bg-card hover:bg-accent/40 flex items-center gap-3 px-3 py-2 transition-colors">
        <button
          type="button"
          className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>

        {item.subtaskCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} aria-hidden />
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}

        <button type="button" onClick={() => onOpenItem(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <WorkItemTypeBadge type={item.type} className="shrink-0" />
          <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.code}</span>
          <span className="truncate text-sm">{item.title}</span>
        </button>

        <div className="flex shrink-0 items-center gap-3">
          {item.subtaskCount > 0 ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs" title="Subtasks">
              <SquareStack className="size-3.5" aria-hidden />
              {item.doneSubtaskCount}/{item.subtaskCount}
            </span>
          ) : null}
          {item.commentCount > 0 ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs" title="Comments">
              <MessageSquare className="size-3.5" aria-hidden />
              {item.commentCount}
            </span>
          ) : null}
          {item.storyPoints ? (
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs tabular-nums">
              {item.storyPoints}
            </span>
          ) : null}
          <WorkItemPriorityBadge priority={item.priority} />
          <Avatar size="sm" title={item.assignee?.name ?? "Unassigned"}>
            <AvatarImage src={item.assignee?.image ?? undefined} alt="" />
            <AvatarFallback>{item.assignee ? initialsOf(item.assignee.name) : "—"}</AvatarFallback>
          </Avatar>
        </div>
      </div>

      {expanded && item.subtasks.length > 0 ? (
        <div className="border-t">
          {item.subtasks.map((subtask) => (
            <SubtaskPreviewRow key={subtask.id} subtask={subtask} columns={columns} onClick={() => onOpenItem(subtask.id)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubtaskPreviewRow({
  subtask,
  columns,
  onClick,
}: {
  subtask: WorkItemSubtaskRow;
  columns: BoardColumnRow[];
  onClick: () => void;
}) {
  const columnIndex = columns.findIndex((c) => c.id === subtask.columnId);
  const column = columns[columnIndex];

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-muted/20 hover:bg-accent/40 flex w-full items-center gap-3 border-t px-3 py-1.5 pl-10 text-left transition-colors first:border-t-0"
    >
      <span className="text-muted-foreground shrink-0 font-mono text-xs">{subtask.code}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{subtask.title}</span>
      {column ? <WorkItemStatusBadge name={column.name} color={columnColor(columnIndex)} className="shrink-0" /> : null}
      <WorkItemPriorityBadge priority={subtask.priority} className="shrink-0" />
      <Avatar size="sm" title={subtask.assignee?.name ?? "Unassigned"}>
        <AvatarFallback>{subtask.assignee ? initialsOf(subtask.assignee.name) : "—"}</AvatarFallback>
      </Avatar>
    </button>
  );
}
