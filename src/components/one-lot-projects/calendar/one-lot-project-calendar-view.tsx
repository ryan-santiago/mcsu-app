"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { CalendarDays } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { CreateWorkItemDialog } from "@/components/one-lot-projects/backlog/create-work-item-dialog";
import { WorkItemDetailSheet } from "@/components/one-lot-projects/backlog/work-item-detail-sheet";
import type { WorkItemFormInput } from "@/lib/validation/one-lot-project-backlog";
import {
  createOneLotProjectWorkItemWithSubtasks,
  fetchOneLotProjectCalendarMonth,
} from "@/server/one-lot-projects/backlog-actions";
import type { BoardColumnRow, CalendarBoardData, CalendarItemRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { CalendarMonthGrid } from "./calendar-month-grid";
import { CalendarToolbar } from "./calendar-toolbar";

type OneLotProjectCalendarViewProps = {
  projectId: string;
  /** ISO `yyyy-MM-dd`, first of the server-rendered month. */
  initialMonth: string;
  initialBoard: CalendarBoardData;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  canEdit: boolean;
};

/** Top-level state owner — the calendar's equivalent of `one-lot-project-kanban-board.tsx`. */
export function OneLotProjectCalendarView({
  projectId,
  initialMonth,
  initialBoard,
  members,
  columns,
  canEdit,
}: OneLotProjectCalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = React.useState(() => startOfMonth(parseISO(initialMonth)));
  const [sprintFilter, setSprintFilter] = React.useState("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState("all");
  const [openWorkItemId, setOpenWorkItemId] = React.useState<string | null>(null);
  const [quickAddDate, setQuickAddDate] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const monthKey = format(visibleMonth, "yyyy-MM");
  // Only seed `initialData` for the month the server actually fetched —
  // otherwise navigating months would show stale data under a mismatched key.
  const isInitialMonth = monthKey === format(parseISO(initialMonth), "yyyy-MM");

  const query = useQuery({
    queryKey: ["one-lot-project-calendar", projectId, monthKey],
    queryFn: () => fetchOneLotProjectCalendarMonth(projectId, format(visibleMonth, "yyyy-MM-dd")),
    initialData: isInitialMonth ? initialBoard : undefined,
  });

  const board = query.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-calendar", projectId] });
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
    queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
  };

  const createMutation = useMutation({
    mutationFn: createOneLotProjectWorkItemWithSubtasks,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setQuickAddDate(null);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarItemRow[]>();
    if (!board) return map;

    for (const item of board.items) {
      if (sprintFilter === "backlog" && item.sprintId !== null) continue;
      if (sprintFilter !== "all" && sprintFilter !== "backlog" && item.sprintId !== sprintFilter) continue;
      if (assigneeFilter === "unassigned" && item.assignee !== null) continue;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && item.assignee?.id !== assigneeFilter) continue;

      const bucket = map.get(item.dueDate) ?? [];
      bucket.push(item);
      map.set(item.dueDate, bucket);
    }
    return map;
  }, [board, sprintFilter, assigneeFilter]);

  return (
    <div className="space-y-4">
      <CalendarToolbar
        visibleMonth={visibleMonth}
        onPrevMonth={() => setVisibleMonth((m) => subMonths(m, 1))}
        onNextMonth={() => setVisibleMonth((m) => addMonths(m, 1))}
        onToday={() => setVisibleMonth(startOfMonth(new Date()))}
        sprints={board?.sprints ?? []}
        members={members}
        sprintFilter={sprintFilter}
        onSprintFilterChange={setSprintFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
      />

      {!board ? (
        <div className="text-muted-foreground py-16 text-center text-sm">Loading…</div>
      ) : (
        <>
          {board.sprints.length === 0 && board.items.length === 0 ? (
            <div className="text-muted-foreground bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              Nothing scheduled this month — items get a due date from the Backlog board, the detail sheet, or the
              quick-add below.
            </div>
          ) : null}

          <CalendarMonthGrid
            visibleMonth={visibleMonth}
            itemsByDay={itemsByDay}
            sprints={board.sprints}
            canEdit={canEdit}
            onOpenItem={setOpenWorkItemId}
            onQuickAdd={setQuickAddDate}
          />
        </>
      )}

      <WorkItemDetailSheet
        workItemId={openWorkItemId}
        projectId={projectId}
        members={members}
        columns={columns}
        onOpenChange={(open) => !open && setOpenWorkItemId(null)}
      />

      <CreateWorkItemDialog
        open={quickAddDate !== null}
        members={members}
        destinationLabel={quickAddDate ? format(parseISO(quickAddDate), "MMM d") : ""}
        initialDueDate={quickAddDate ?? undefined}
        pending={createMutation.isPending}
        onOpenChange={(open) => !open && setQuickAddDate(null)}
        onSubmit={(values: WorkItemFormInput) => createMutation.mutate({ ...values, projectId, sprintId: null })}
      />
    </div>
  );
}
