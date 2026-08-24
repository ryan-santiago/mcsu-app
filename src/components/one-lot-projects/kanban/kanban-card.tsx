"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, MessageSquare, SquareStack } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { columnColor } from "@/lib/one-lot-project-backlog-format";
import { cn } from "@/lib/utils";
import type { BoardColumnRow, WorkItemRow, WorkItemSubtaskRow } from "@/server/one-lot-projects/backlog-types";

import { WorkItemCoverBar, WorkItemPriorityBadge, WorkItemStatusBadge, WorkItemTypeBadge } from "../backlog/work-item-badges";

type KanbanCardProps = {
  item: WorkItemRow;
  columns: BoardColumnRow[];
  onClick: () => void;
  onOpenItem: (id: string) => void;
};

export function KanbanCard({ item, columns, onClick, onOpenItem }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [expanded, setExpanded] = React.useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        "bg-card hover:border-foreground/20 cursor-pointer touch-none overflow-hidden rounded-lg border shadow-xs transition-colors",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <WorkItemCoverBar color={item.coverColor} />
      <div className="space-y-2 p-3">
        <p className="text-sm">{item.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <WorkItemTypeBadge type={item.type} />
            <span className="text-muted-foreground truncate font-mono text-xs">{item.code}</span>
            {item.commentCount > 0 ? (
              <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs" title="Comments">
                <MessageSquare className="size-3.5" aria-hidden />
                {item.commentCount}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
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
          </span>
        </div>

        {item.subtaskCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} aria-hidden />
            <SquareStack className="size-3.5" aria-hidden />
            Subtasks {item.doneSubtaskCount}/{item.subtaskCount}
          </button>
        ) : null}
      </div>

      {expanded && item.subtasks.length > 0 ? (
        <div className="border-t">
          {item.subtasks.map((subtask) => (
            <SubtaskPreviewRow
              key={subtask.id}
              subtask={subtask}
              columns={columns}
              onClick={(event) => {
                event.stopPropagation();
                onOpenItem(subtask.id);
              }}
            />
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
  onClick: (event: React.MouseEvent) => void;
}) {
  const columnIndex = columns.findIndex((c) => c.id === subtask.columnId);
  const column = columns[columnIndex];

  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent/40 flex w-full items-center gap-2 border-t px-3 py-1.5 text-left transition-colors first:border-t-0"
    >
      <span className="text-muted-foreground shrink-0 font-mono text-xs">{subtask.code}</span>
      <span className="min-w-0 flex-1 truncate text-xs">{subtask.title}</span>
      {column ? <WorkItemStatusBadge name={column.name} color={columnColor(columnIndex)} className="shrink-0" /> : null}
      <Avatar size="sm" title={subtask.assignee?.name ?? "Unassigned"}>
        <AvatarFallback>{subtask.assignee ? initialsOf(subtask.assignee.name) : "—"}</AvatarFallback>
      </Avatar>
    </button>
  );
}
