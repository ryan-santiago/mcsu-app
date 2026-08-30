"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/format";
import { WORK_ITEM_COVER_COLORS } from "@/lib/one-lot-project-backlog-format";
import { cn } from "@/lib/utils";
import type { CalendarItemRow } from "@/server/one-lot-projects/backlog-types";

import { WorkItemPriorityBadge } from "../backlog/work-item-badges";

type CalendarWorkItemChipProps = {
  item: CalendarItemRow;
  onClick: () => void;
  className?: string;
};

/** Dense single-line chip for a calendar day cell — a scaled-down cousin of `KanbanCard`, not a composition of the full-size type/status badges (they don't fit at this density). */
export function CalendarWorkItemChip({ item, onClick, className }: CalendarWorkItemChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${item.code} — ${item.title}`}
      className={cn(
        "hover:bg-accent flex w-full min-w-0 items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 text-left text-xs transition-colors",
        className,
      )}
      style={item.coverColor ? { borderLeft: `3px solid ${WORK_ITEM_COVER_COLORS[item.coverColor].value}` } : undefined}
    >
      <WorkItemPriorityBadge priority={item.priority} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <Avatar size="sm" className="shrink-0" title={item.assignee?.name ?? "Unassigned"}>
        <AvatarImage src={item.assignee?.image ?? undefined} alt="" />
        <AvatarFallback>{item.assignee ? initialsOf(item.assignee.name) : "—"}</AvatarFallback>
      </Avatar>
    </button>
  );
}
