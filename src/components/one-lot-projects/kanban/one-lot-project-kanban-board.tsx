"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KanbanSquare } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import {
  fetchOneLotProjectKanbanBoard,
  reorderOneLotProjectBoardColumns,
  reorderOneLotProjectWorkItemsOnBoard,
} from "@/server/one-lot-projects/backlog-actions";
import type { KanbanBoardData, WorkItemRow as WorkItemRowData } from "@/server/one-lot-projects/backlog-types";

import { WorkItemDetailSheet } from "../backlog/work-item-detail-sheet";
import { AddColumnButton } from "./add-column-button";
import { COLUMN_DRAG_PREFIX, KanbanColumn } from "./kanban-column";

/**
 * A column's own drag-to-reorder rect (`col-sort:{id}`, the whole column div)
 * fully overlaps its nested card-drop rect (`column:{id}`) — plain
 * `closestCorners` can't tell them apart. While dragging a column, this
 * restricts candidates to other columns only, so a column drag never gets
 * mistaken for a card drop (and vice versa).
 */
const collisionDetection: CollisionDetection = (args) => {
  const isColumnDrag = String(args.active.id).startsWith(COLUMN_DRAG_PREFIX);
  const containers = args.droppableContainers.filter((c) => String(c.id).startsWith(COLUMN_DRAG_PREFIX) === isColumnDrag);
  return closestCorners({ ...args, droppableContainers: containers });
};

function findColumnId(itemsByColumn: Record<string, WorkItemRowData[]>, id: string): string | null {
  if (id.startsWith("column:")) return id.slice("column:".length);
  for (const [columnId, items] of Object.entries(itemsByColumn)) {
    if (items.some((item) => item.id === id)) return columnId;
  }
  return null;
}

type OneLotProjectKanbanBoardProps = {
  projectId: string;
  initialBoard: KanbanBoardData;
  canEdit: boolean;
};

export function OneLotProjectKanbanBoard({ projectId, initialBoard, canEdit }: OneLotProjectKanbanBoardProps) {
  const [openWorkItemId, setOpenWorkItemId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: board } = useQuery({
    queryKey: ["one-lot-project-kanban", projectId],
    queryFn: () => fetchOneLotProjectKanbanBoard(projectId),
    initialData: initialBoard,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: reorderOneLotProjectWorkItemsOnBoard,
    onError: () => {
      toast.error("Couldn't save the new order — reloading.");
      queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
    },
  });

  const reorderColumnsMutation = useMutation({
    mutationFn: reorderOneLotProjectBoardColumns,
    onError: () => {
      toast.error("Couldn't save the new column order — reloading.");
      queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (String(active.id).startsWith(COLUMN_DRAG_PREFIX)) {
      const activeColumnId = String(active.id).slice(COLUMN_DRAG_PREFIX.length);
      const overId = String(over.id);
      const overColumnId = overId.startsWith(COLUMN_DRAG_PREFIX) ? overId.slice(COLUMN_DRAG_PREFIX.length) : overId;
      const oldIndex = board.columns.findIndex((c) => c.id === activeColumnId);
      const newIndex = board.columns.findIndex((c) => c.id === overColumnId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reorderedColumns = arrayMove(board.columns, oldIndex, newIndex);
      queryClient.setQueryData(["one-lot-project-kanban", projectId], { ...board, columns: reorderedColumns });
      reorderColumnsMutation.mutate({
        projectId,
        moves: reorderedColumns.map((c, index) => ({ id: c.id, sortOrder: index })),
      });
      return;
    }

    const sourceColumnId = findColumnId(board.itemsByColumn, String(active.id));
    const destColumnId = findColumnId(board.itemsByColumn, String(over.id));
    if (!sourceColumnId || !destColumnId) return;

    const sourceItems = [...(board.itemsByColumn[sourceColumnId] ?? [])];
    const activeIndex = sourceItems.findIndex((item) => item.id === active.id);
    if (activeIndex === -1) return;

    const moves: { id: string; columnId: string; boardSortOrder: number }[] = [];
    const nextItemsByColumn = { ...board.itemsByColumn };

    if (sourceColumnId === destColumnId) {
      const overIndex = sourceItems.findIndex((item) => item.id === over.id);
      const reordered = arrayMove(sourceItems, activeIndex, overIndex === -1 ? sourceItems.length - 1 : overIndex);
      nextItemsByColumn[destColumnId] = reordered;
      reordered.forEach((item, index) => moves.push({ id: item.id, columnId: destColumnId, boardSortOrder: index }));
    } else {
      const destItems = [...(board.itemsByColumn[destColumnId] ?? [])];
      const [moved] = sourceItems.splice(activeIndex, 1);
      const overIndex = destItems.findIndex((item) => item.id === over.id);
      destItems.splice(overIndex === -1 ? destItems.length : overIndex, 0, moved);

      nextItemsByColumn[sourceColumnId] = sourceItems;
      nextItemsByColumn[destColumnId] = destItems;
      sourceItems.forEach((item, index) => moves.push({ id: item.id, columnId: sourceColumnId, boardSortOrder: index }));
      destItems.forEach((item, index) => moves.push({ id: item.id, columnId: destColumnId, boardSortOrder: index }));
    }

    queryClient.setQueryData(["one-lot-project-kanban", projectId], { ...board, itemsByColumn: nextItemsByColumn });
    reorderMutation.mutate({ projectId, moves });
  }

  if (!board.activeSprint) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="No active sprint"
        description="Start a sprint from the Backlog tab to see it here."
        action={
          <Link href={`/one-lot-projects/${projectId}/list`} className="text-brand text-sm font-medium hover:underline">
            Go to Backlog
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">Showing: {board.activeSprint.name}</p>

      <DndContext
        id={`one-lot-project-kanban-${projectId}`}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-4 overflow-x-auto pb-2">
          <SortableContext
            items={board.columns.map((c) => `${COLUMN_DRAG_PREFIX}${c.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                projectId={projectId}
                activeSprintId={board.activeSprint!.id}
                column={column}
                columns={board.columns}
                items={board.itemsByColumn[column.id] ?? []}
                members={board.members}
                canEdit={canEdit}
                onItemClick={setOpenWorkItemId}
              />
            ))}
          </SortableContext>
          {canEdit ? <AddColumnButton projectId={projectId} /> : null}
        </div>
      </DndContext>

      <WorkItemDetailSheet
        workItemId={openWorkItemId}
        projectId={projectId}
        members={board.members}
        columns={board.columns}
        onOpenChange={(open) => !open && setOpenWorkItemId(null)}
      />
    </div>
  );
}
