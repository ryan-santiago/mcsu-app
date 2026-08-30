"use client";

import { format, isSameMonth, isToday } from "date-fns";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarItemRow } from "@/server/one-lot-projects/backlog-types";

import { CalendarDayOverflowPopover } from "./calendar-day-overflow-popover";
import { CalendarWorkItemChip } from "./calendar-work-item-chip";

const MAX_VISIBLE = 3;

type CalendarDayCellProps = {
  day: Date;
  monthAnchor: Date;
  items: CalendarItemRow[];
  canEdit: boolean;
  onOpenItem: (id: string) => void;
  onQuickAdd: (dayIso: string) => void;
};

/** One grid cell — up to 3 chips, "+N more" overflow popover, and a hover-revealed quick-add affordance (cell-scoped, unlike Kanban's column-scoped "+ Create" button, since a day cell is much smaller). */
export function CalendarDayCell({ day, monthAnchor, items, canEdit, onOpenItem, onQuickAdd }: CalendarDayCellProps) {
  const inCurrentMonth = isSameMonth(day, monthAnchor);
  const today = isToday(day);
  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.slice(MAX_VISIBLE);

  return (
    <div
      className={cn(
        "group/day min-h-28 border-r border-b p-1.5 last:border-r-0",
        !inCurrentMonth && "bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs",
            !inCurrentMonth && "text-muted-foreground",
            today && "bg-primary text-primary-foreground font-semibold",
          )}
        >
          {format(day, "d")}
        </span>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="opacity-0 transition-opacity group-hover/day:opacity-100"
            aria-label={`Add item due ${format(day, "MMM d")}`}
            onClick={() => onQuickAdd(format(day, "yyyy-MM-dd"))}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="space-y-0.5">
        {visible.map((item) => (
          <CalendarWorkItemChip key={item.id} item={item} onClick={() => onOpenItem(item.id)} />
        ))}
        {overflow.length > 0 ? (
          <CalendarDayOverflowPopover
            day={day}
            items={items}
            onOpenItem={onOpenItem}
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-accent w-full rounded-md px-2 py-0.5 text-left text-xs transition-colors"
              >
                +{overflow.length} more
              </button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
