"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CalendarSprintRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

type CalendarToolbarProps = {
  visibleMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  /** Only sprints overlapping the visible month — the filter's own options change as the user navigates months, same as Jira only offering sprints you can currently see. */
  sprints: CalendarSprintRow[];
  members: OneLotProjectMemberRow[];
  sprintFilter: string;
  onSprintFilterChange: (value: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
};

export function CalendarToolbar({
  visibleMonth,
  onPrevMonth,
  onNextMonth,
  onToday,
  sprints,
  members,
  sprintFilter,
  onSprintFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon-sm" onClick={onPrevMonth} aria-label="Previous month">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" onClick={onNextMonth} aria-label="Next month">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <h3 className="ml-2 text-sm font-semibold">{format(visibleMonth, "MMMM yyyy")}</h3>
      </div>

      <div className="flex items-center gap-2">
        <Select value={sprintFilter} onValueChange={onSprintFilterChange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sprints</SelectItem>
            <SelectItem value="backlog">Backlog (no sprint)</SelectItem>
            {sprints.map((sprint) => (
              <SelectItem key={sprint.id} value={sprint.id}>
                {sprint.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={onAssigneeFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
