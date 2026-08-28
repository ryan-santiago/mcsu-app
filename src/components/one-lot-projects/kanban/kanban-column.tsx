"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Loader2, MoreHorizontal, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { boardColumnFormSchema } from "@/lib/validation/one-lot-project-backlog";
import { createOneLotProjectWorkItemWithSubtasks, deleteOneLotProjectBoardColumn, renameOneLotProjectBoardColumn } from "@/server/one-lot-projects/backlog-actions";
import type { BoardColumnRow, WorkItemRow } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { CreateWorkItemDialog } from "../backlog/create-work-item-dialog";
import { KanbanCard } from "./kanban-card";

/** Namespaces a column's own drag-to-reorder id apart from `column:{id}` (the card drop-target id `useDroppable` below already owns) and from bare work-item ids. */
export const COLUMN_DRAG_PREFIX = "col-sort:";

type KanbanColumnProps = {
  projectId: string;
  activeSprintId: string;
  column: BoardColumnRow;
  columns: BoardColumnRow[];
  items: WorkItemRow[];
  members: OneLotProjectMemberRow[];
  canEdit: boolean;
  onItemClick: (id: string) => void;
};

export function KanbanColumn({ projectId, activeSprintId, column, columns, items, members, canEdit, onItemClick }: KanbanColumnProps) {
  const [creating, setCreating] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(column.name);
  const { setNodeRef } = useDroppable({ id: `column:${column.id}` });
  const {
    attributes: columnDragAttributes,
    listeners: columnDragListeners,
    setNodeRef: setColumnSortableRef,
    transform: columnTransform,
    transition: columnTransition,
    isDragging: isColumnDragging,
  } = useSortable({ id: `${COLUMN_DRAG_PREFIX}${column.id}` });
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["one-lot-project-kanban", projectId] });

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

  const renameMutation = useMutation({
    mutationFn: () => renameOneLotProjectBoardColumn({ id: column.id, projectId, name }),
    onSuccess: (result) => {
      if (result.ok) {
        setRenaming(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOneLotProjectBoardColumn({ id: column.id, projectId }),
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

  const validName = boardColumnFormSchema.safeParse({ name }).success;

  return (
    <div
      ref={setColumnSortableRef}
      style={{
        transform: CSS.Transform.toString(columnTransform),
        transition: columnTransition,
        opacity: isColumnDragging ? 0.5 : 1,
      }}
      className="ring-foreground/10 bg-muted flex w-72 shrink-0 flex-col gap-3 rounded-xl p-3 ring-1"
    >
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <div className="flex flex-1 items-center gap-1">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={renameMutation.isPending}
              className="h-8"
              onKeyDown={(event) => {
                if (event.key === "Enter" && validName) renameMutation.mutate();
                if (event.key === "Escape") {
                  setName(column.name);
                  setRenaming(false);
                }
              }}
              onBlur={() => {
                if (validName && name !== column.name) renameMutation.mutate();
                else setRenaming(false);
              }}
            />
            {renameMutation.isPending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
          </div>
        ) : (
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            {canEdit ? (
              <button
                type="button"
                {...columnDragAttributes}
                {...columnDragListeners}
                className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
                aria-label="Drag to reorder column"
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
            ) : null}
            <span className="truncate">{column.name}</span>
            <span className="text-muted-foreground bg-background shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
              {items.length}
            </span>
          </h3>
        )}

        {canEdit && !renaming ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {column.isDone ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="bg-success size-2 rounded-full"
                    aria-label="Done column — tracks completed work for Sprint Burndown, Velocity, and sprint completion"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  This is the project&apos;s Done column — Sprint Burndown, Velocity, and sprint completion all track
                  finished work through it. Rename it freely; it can&apos;t be deleted.
                </TooltipContent>
              </Tooltip>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Column actions">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={column.isDone}
                  onSelect={() => {
                    if (column.isDone) return;
                    deleteMutation.mutate();
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="min-h-16 flex-1 space-y-2">
          {items.map((item) => (
            <KanbanCard key={item.id} item={item} columns={columns} onClick={() => onItemClick(item.id)} onOpenItem={onItemClick} />
          ))}
        </div>
      </SortableContext>

      {canEdit ? (
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Create
        </Button>
      ) : null}

      <CreateWorkItemDialog
        open={creating}
        members={members}
        destinationLabel={column.name}
        pending={createMutation.isPending}
        onOpenChange={setCreating}
        onSubmit={(values) => createMutation.mutate({ ...values, projectId, sprintId: activeSprintId, columnId: column.id })}
      />
    </div>
  );
}
