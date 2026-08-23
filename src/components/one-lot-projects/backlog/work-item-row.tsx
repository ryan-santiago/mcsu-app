"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquare, SquareStack } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkItemRow as WorkItemRowData } from "@/server/one-lot-projects/backlog-types";

import { WorkItemPriorityBadge, WorkItemTypeBadge } from "./work-item-badges";

type WorkItemRowProps = {
  item: WorkItemRowData;
  onClick: () => void;
};

export function WorkItemRow({ item, onClick }: WorkItemRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card hover:bg-accent/40 flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
  );
}
