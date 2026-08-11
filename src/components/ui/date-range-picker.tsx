"use client";

import {
  endOfDay,
  endOfMonth,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfToday,
  subDays,
} from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type { DateRange };

type Preset = {
  label: string;
  /** `undefined` means "All time" — no date filter applied. */
  range: () => DateRange | undefined;
};

const PRESETS: Preset[] = [
  { label: "Today", range: () => ({ from: startOfToday(), to: startOfToday() }) },
  { label: "Last 7 days", range: () => ({ from: subDays(startOfToday(), 6), to: startOfToday() }) },
  { label: "Last 30 days", range: () => ({ from: subDays(startOfToday(), 29), to: startOfToday() }) },
  { label: "This month", range: () => ({ from: startOfMonth(startOfToday()), to: endOfMonth(startOfToday()) }) },
  { label: "All time", range: () => undefined },
];

function matchesPreset(range: DateRange | undefined, preset: Preset): boolean {
  const presetRange = preset.range();
  if (!range?.from || !range.to) return !presetRange;
  if (!presetRange?.from || !presetRange.to) return false;
  return isSameDay(range.from, presetRange.from) && isSameDay(range.to, presetRange.to);
}

function formatRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return "All time";
  if (!range.to || isSameDay(range.from, range.to)) return formatDate(range.from);
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

type DateRangePickerProps = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
};

/**
 * Popover date-range picker with quick presets alongside a two-month range
 * calendar. shadcn has no official range-picker component — this composes
 * `Calendar`'s built-in `mode="range"` with `Popover`, the documented pattern.
 */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  // Local draft so picking a start date doesn't narrow the query until a full
  // range (or a preset) is confirmed.
  const [draft, setDraft] = React.useState<DateRange | undefined>(value);

  function apply(range: DateRange | undefined) {
    // `to` must be the END of its day, not the start — a filter's upper bound
    // needs to include everything created that day. Getting this backwards
    // (startOfDay on both ends) silently excludes every row from today,
    // since "today" always has a createdAt later than today's midnight.
    const normalized = range?.from
      ? { from: startOfDay(range.from), to: endOfDay(range.to ?? range.from) }
      : undefined;
    onChange(normalized);
    setOpen(false);
  }

  // Re-seeding the draft belongs in the event that opens the popover, not an
  // effect reacting to `open` — there's no external system to synchronize
  // with here, just an interaction to respond to.
  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start gap-2 font-normal sm:w-auto", className)}
        >
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{formatRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:border-r sm:border-b-0">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={matchesPreset(value, preset) ? "secondary" : "ghost"}
                size="sm"
                className="justify-start font-normal"
                onClick={() => apply(preset.range())}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={draft?.from}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-end gap-2 border-t px-1 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!draft?.from} onClick={() => apply(draft)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
