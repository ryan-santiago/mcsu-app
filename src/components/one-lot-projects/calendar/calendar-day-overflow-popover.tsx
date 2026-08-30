"use client";

import { format } from "date-fns";
import * as React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CalendarItemRow } from "@/server/one-lot-projects/backlog-types";

import { CalendarWorkItemChip } from "./calendar-work-item-chip";

type CalendarDayOverflowPopoverProps = {
  day: Date;
  items: CalendarItemRow[];
  onOpenItem: (id: string) => void;
  trigger: React.ReactNode;
};

/** "+N more" overflow for a day cell — modeled on `NotificationBell`'s Popover + ScrollArea + divided list; renders straight from the day's already-loaded items, no fetch. */
export function CalendarDayOverflowPopover({ day, items, onOpenItem, trigger }: CalendarDayOverflowPopoverProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{format(day, "EEEE, MMM d")}</p>
          <p className="text-muted-foreground text-xs">
            {items.length} item{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <ScrollArea className="max-h-80">
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="p-1">
                <CalendarWorkItemChip
                  item={item}
                  onClick={() => {
                    setOpen(false);
                    onOpenItem(item.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
