"use client";

import { differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, parseISO, startOfMonth, startOfWeek } from "date-fns";

import { columnColor } from "@/lib/one-lot-project-backlog-format";
import type { CalendarItemRow, CalendarSprintRow } from "@/server/one-lot-projects/backlog-types";

import { CalendarDayCell } from "./calendar-day-cell";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarMonthGridProps = {
  visibleMonth: Date;
  itemsByDay: Map<string, CalendarItemRow[]>;
  sprints: CalendarSprintRow[];
  canEdit: boolean;
  onOpenItem: (id: string) => void;
  onQuickAdd: (dayIso: string) => void;
};

/** 7xN grid, date-fns generated. Sprint-band computation lives here as a `useMemo`-free plain pass per render — cheap (at most ~6 weeks x a handful of sprints) — day cells themselves stay unaware of sprints. */
export function CalendarMonthGrid({ visibleMonth, itemsByDay, sprints, canEdit, onOpenItem, onQuickAdd }: CalendarMonthGridProps) {
  const gridStart = startOfWeek(startOfMonth(visibleMonth));
  const gridEnd = endOfWeek(endOfMonth(visibleMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const sprintIndex = new Map(sprints.map((s, i) => [s.id, i]));

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-muted-foreground px-2 py-2 text-center text-xs font-medium">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week, weekIndex) => {
        const bands = computeWeekBands(week, sprints, sprintIndex, gridStart);
        return (
          <div key={weekIndex}>
            {bands.length > 0 ? (
              <div className="space-y-0.5 px-0.5 pt-0.5">
                {bands.map((band) => (
                  <div key={band.sprintId} className="grid grid-cols-7 gap-x-0.5">
                    <div
                      style={{ gridColumn: `${band.startCol} / span ${band.span}`, backgroundColor: band.color }}
                      className="flex h-4 min-w-0 items-center truncate rounded-sm px-1.5 text-[0.6rem] leading-none font-medium text-white"
                      title={band.name}
                    >
                      {band.showLabel ? band.name : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-7">
              {week.map((day) => (
                <CalendarDayCell
                  key={day.toISOString()}
                  day={day}
                  monthAnchor={visibleMonth}
                  items={itemsByDay.get(format(day, "yyyy-MM-dd")) ?? []}
                  canEdit={canEdit}
                  onOpenItem={onOpenItem}
                  onQuickAdd={onQuickAdd}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Band = {
  sprintId: string;
  name: string;
  color: string;
  startCol: number;
  span: number;
  showLabel: boolean;
};

/** One band segment per sprint whose date range overlaps this week, clamped to the week's 7 days. Two overlapping sprints stack as separate rows rather than merging — simplest correct behavior for a case the schema doesn't rule out but is expected to be rare. */
function computeWeekBands(
  week: Date[],
  sprints: CalendarSprintRow[],
  sprintIndex: Map<string, number>,
  gridStart: Date,
): Band[] {
  const bands: Band[] = [];
  const weekStart = week[0];
  const weekEnd = week[6];

  for (const sprint of sprints) {
    if (!sprint.startDate || !sprint.endDate) continue;
    const sprintStart = parseISO(sprint.startDate);
    const sprintEnd = parseISO(sprint.endDate);
    if (sprintEnd < weekStart || sprintStart > weekEnd) continue;

    const segStart = sprintStart > weekStart ? sprintStart : weekStart;
    const segEnd = sprintEnd < weekEnd ? sprintEnd : weekEnd;
    const startCol = differenceInCalendarDays(segStart, weekStart) + 1;
    const span = differenceInCalendarDays(segEnd, segStart) + 1;
    // Label the segment where the band actually starts — or, if the sprint
    // started before the visible grid entirely, the grid's very first week.
    const showLabel = isSameDay(segStart, sprintStart) || (isSameDay(weekStart, gridStart) && sprintStart < gridStart);

    bands.push({
      sprintId: sprint.id,
      name: sprint.name,
      color: columnColor(sprintIndex.get(sprint.id) ?? 0),
      startCol,
      span,
      showLabel,
    });
  }

  return bands;
}
