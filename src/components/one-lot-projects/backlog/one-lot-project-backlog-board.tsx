"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SprintFormInput } from "@/lib/validation/one-lot-project-backlog";
import {
  createOneLotProjectSprint,
  fetchOneLotProjectBacklogBoard,
  reorderOneLotProjectWorkItems,
} from "@/server/one-lot-projects/backlog-actions";
import type { BacklogBoardData, WorkItemRow as WorkItemRowData } from "@/server/one-lot-projects/backlog-types";

import { BacklogCollection } from "./backlog-collection";
import { CreateSprintDialog } from "./create-sprint-dialog";
import { SprintCollection } from "./sprint-collection";
import { WorkItemDetailSheet } from "./work-item-detail-sheet";

type ContainerId = "backlog" | `sprint:${string}`;

function getBuckets(board: BacklogBoardData): Record<ContainerId, WorkItemRowData[]> {
  const buckets: Record<string, WorkItemRowData[]> = { backlog: board.backlogItems };
  for (const sprint of board.sprints) buckets[`sprint:${sprint.id}`] = sprint.items;
  return buckets as Record<ContainerId, WorkItemRowData[]>;
}

function findContainer(buckets: Record<ContainerId, WorkItemRowData[]>, id: string): ContainerId | null {
  if (id === "backlog" || id.startsWith("sprint:")) return id as ContainerId;
  for (const [key, items] of Object.entries(buckets)) {
    if (items.some((item) => item.id === id)) return key as ContainerId;
  }
  return null;
}

function withContainerItems(board: BacklogBoardData, container: ContainerId, items: WorkItemRowData[]): BacklogBoardData {
  if (container === "backlog") return { ...board, backlogItems: items };
  const sprintId = container.slice("sprint:".length);
  return { ...board, sprints: board.sprints.map((sprint) => (sprint.id === sprintId ? { ...sprint, items } : sprint)) };
}

function containerSprintId(container: ContainerId): string | null {
  return container === "backlog" ? null : container.slice("sprint:".length);
}

type OneLotProjectBacklogBoardProps = {
  projectId: string;
  initialBoard: BacklogBoardData;
  canEdit: boolean;
};

export function OneLotProjectBacklogBoard({ projectId, initialBoard, canEdit }: OneLotProjectBacklogBoardProps) {
  const [openWorkItemId, setOpenWorkItemId] = React.useState<string | null>(null);
  const [creatingSprint, setCreatingSprint] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: board } = useQuery({
    queryKey: ["one-lot-project-backlog", projectId],
    queryFn: () => fetchOneLotProjectBacklogBoard(projectId),
    initialData: initialBoard,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: reorderOneLotProjectWorkItems,
    onError: () => {
      toast.error("Couldn't save the new order — reloading.");
      queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
    },
  });

  const createSprintMutation = useMutation({
    mutationFn: (values: SprintFormInput) => createOneLotProjectSprint({ ...values, projectId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCreatingSprint(false);
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const buckets = getBuckets(board);
    const sourceContainer = findContainer(buckets, String(active.id));
    const destContainer = findContainer(buckets, String(over.id));
    if (!sourceContainer || !destContainer) return;

    const sourceItems = [...buckets[sourceContainer]];
    const activeIndex = sourceItems.findIndex((item) => item.id === active.id);
    if (activeIndex === -1) return;

    let next = board;
    const moves: { id: string; sprintId: string | null; sortOrder: number }[] = [];

    if (sourceContainer === destContainer) {
      const overIndex = sourceItems.findIndex((item) => item.id === over.id);
      const reordered = arrayMove(sourceItems, activeIndex, overIndex === -1 ? sourceItems.length - 1 : overIndex);
      next = withContainerItems(board, destContainer, reordered);
      reordered.forEach((item, index) =>
        moves.push({ id: item.id, sprintId: containerSprintId(destContainer), sortOrder: index }),
      );
    } else {
      const destItems = [...buckets[destContainer]];
      const [moved] = sourceItems.splice(activeIndex, 1);
      const overIndex = destItems.findIndex((item) => item.id === over.id);
      destItems.splice(overIndex === -1 ? destItems.length : overIndex, 0, moved);

      next = withContainerItems(withContainerItems(board, sourceContainer, sourceItems), destContainer, destItems);
      sourceItems.forEach((item, index) =>
        moves.push({ id: item.id, sprintId: containerSprintId(sourceContainer), sortOrder: index }),
      );
      destItems.forEach((item, index) =>
        moves.push({ id: item.id, sprintId: containerSprintId(destContainer), sortOrder: index }),
      );
    }

    queryClient.setQueryData(["one-lot-project-backlog", projectId], next);
    reorderMutation.mutate({ projectId, moves });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {canEdit ? (
          <Button size="sm" onClick={() => setCreatingSprint(true)}>
            <Plus className="size-4" aria-hidden />
            Create sprint
          </Button>
        ) : null}
      </div>

      <DndContext
        id={`one-lot-project-backlog-${projectId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4">
          {board.sprints
            .filter((sprint) => sprint.status !== "completed")
            .map((sprint) => (
              <SprintCollection
                key={sprint.id}
                projectId={projectId}
                sprint={sprint}
                members={board.members}
                columns={board.columns}
                canEdit={canEdit}
                onItemClick={setOpenWorkItemId}
              />
            ))}

          <BacklogCollection
            projectId={projectId}
            items={board.backlogItems}
            members={board.members}
            columns={board.columns}
            canEdit={canEdit}
            onItemClick={setOpenWorkItemId}
          />

          {board.sprints
            .filter((sprint) => sprint.status === "completed")
            .map((sprint) => (
              <SprintCollection
                key={sprint.id}
                projectId={projectId}
                sprint={sprint}
                members={board.members}
                columns={board.columns}
                canEdit={canEdit}
                onItemClick={setOpenWorkItemId}
              />
            ))}
        </div>
      </DndContext>

      <WorkItemDetailSheet
        workItemId={openWorkItemId}
        projectId={projectId}
        members={board.members}
        columns={board.columns}
        onOpenChange={(open) => !open && setOpenWorkItemId(null)}
      />

      <CreateSprintDialog
        open={creatingSprint}
        pending={createSprintMutation.isPending}
        onOpenChange={setCreatingSprint}
        onSubmit={(values) => createSprintMutation.mutate(values)}
      />
    </div>
  );
}
