"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquare, SquareStack } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkItemRow } from "@/server/one-lot-projects/backlog-types";

import { WorkItemPriorityBadge, WorkItemTypeBadge } from "../backlog/work-item-badges";

type KanbanCardProps = {
  item: WorkItemRow;
  onClick: () => void;
};

export function KanbanCard({ item, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

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
        "bg-card hover:border-foreground/20 cursor-pointer touch-none space-y-2 rounded-lg border p-3 shadow-xs transition-colors",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <p className="text-sm">{item.title}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <WorkItemTypeBadge type={item.type} />
          <span className="text-muted-foreground truncate font-mono text-xs">{item.code}</span>
          {item.subtaskCount > 0 ? (
            <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-xs" title="Subtasks">
              <SquareStack className="size-3.5" aria-hidden />
              {item.doneSubtaskCount}/{item.subtaskCount}
            </span>
          ) : null}
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
    </div>
  );
}
