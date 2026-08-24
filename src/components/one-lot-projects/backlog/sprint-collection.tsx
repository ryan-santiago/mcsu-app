"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { SPRINT_STATUS_LABELS } from "@/lib/one-lot-project-backlog-format";
import type { SprintFormInput } from "@/lib/validation/one-lot-project-backlog";
import {
  completeOneLotProjectSprint,
  createOneLotProjectWorkItemWithSubtasks,
  startOneLotProjectSprint,
  updateOneLotProjectSprint,
} from "@/server/one-lot-projects/backlog-actions";
import type { BoardColumnRow, SprintRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { CreateSprintDialog } from "./create-sprint-dialog";
import { CreateWorkItemDialog } from "./create-work-item-dialog";
import { WorkItemRow } from "./work-item-row";

const STATUS_BADGE_CLASS: Record<SprintRow["status"], string> = {
  planned: "border-border text-foreground",
  active: "border-brand/30 bg-brand/10 text-brand",
  completed: "border-success/30 bg-success/10 text-success",
};

type SprintCollectionProps = {
  projectId: string;
  sprint: SprintRow;
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  canEdit: boolean;
  onItemClick: (id: string) => void;
};

export function SprintCollection({ projectId, sprint, members, columns, canEdit, onItemClick }: SprintCollectionProps) {
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const { setNodeRef } = useDroppable({ id: `sprint:${sprint.id}` });
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });

  const createMutation = useMutation({
    mutationFn: createOneLotProjectWorkItemWithSubtasks,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCreating(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const editMutation = useMutation({
    mutationFn: (values: SprintFormInput) => updateOneLotProjectSprint({ ...values, id: sprint.id, projectId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setEditing(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const lifecycleMutation = useMutation({
    mutationFn: (task: () => ReturnType<typeof startOneLotProjectSprint>) => task(),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const storyPointSum = sprint.items.reduce((sum, item) => sum + (item.storyPoints ? Number(item.storyPoints) : 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {sprint.name}
          <span className="text-muted-foreground text-xs font-normal">
            {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
          </span>
          <span className="text-muted-foreground font-normal">({sprint.items.length} work item{sprint.items.length === 1 ? "" : "s"})</span>
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_BADGE_CLASS[sprint.status]}>
            {SPRINT_STATUS_LABELS[sprint.status]}
          </Badge>
          {storyPointSum > 0 ? (
            <Badge variant="outline" className="font-normal">
              {storyPointSum} pts
            </Badge>
          ) : null}
          {canEdit ? (
            <>
              {sprint.status === "planned" ? (
                sprint.startDate && sprint.endDate ? (
                  <Button size="sm" onClick={() => lifecycleMutation.mutate(() => startOneLotProjectSprint({ id: sprint.id, projectId }))}>
                    Start sprint
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button size="sm" disabled>
                          Start sprint
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Set a start and end date before starting this sprint.</TooltipContent>
                  </Tooltip>
                )
              ) : null}
              {sprint.status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => lifecycleMutation.mutate(() => completeOneLotProjectSprint({ id: sprint.id, projectId }))}
                >
                  Complete sprint
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Sprint actions">
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Edit sprint</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {sprint.goal ? <p className="text-muted-foreground text-sm">{sprint.goal}</p> : null}

        <SortableContext items={sprint.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="min-h-10 space-y-2">
            {sprint.items.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">No work items yet.</p>
            ) : (
              sprint.items.map((item) => <WorkItemRow key={item.id} item={item} columns={columns} onOpenItem={onItemClick} />)
            )}
          </div>
        </SortableContext>

        {canEdit ? (
          sprint.status === "completed" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button variant="ghost" size="sm" disabled>
                    <Plus className="size-4" aria-hidden />
                    Create
                  </Button>
                </span>
              </TooltipTrigger>
              {/* Drag-and-drop stays on regardless — this only blocks new items, so a wrongly-completed sprint can still be corrected by moving cards back in. */}
              <TooltipContent>This sprint is completed — drag items in to correct a mistake instead.</TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden />
              Create
            </Button>
          )
        ) : null}
      </CardContent>

      <CreateWorkItemDialog
        open={creating}
        members={members}
        destinationLabel={sprint.name}
        pending={createMutation.isPending}
        onOpenChange={setCreating}
        onSubmit={(values) => createMutation.mutate({ ...values, projectId, sprintId: sprint.id })}
      />

      <CreateSprintDialog
        open={editing}
        sprint={sprint}
        pending={editMutation.isPending}
        onOpenChange={setEditing}
        onSubmit={(values) => editMutation.mutate(values)}
      />
    </Card>
  );
}
