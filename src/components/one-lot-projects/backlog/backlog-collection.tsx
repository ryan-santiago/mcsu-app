"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createOneLotProjectWorkItemWithSubtasks } from "@/server/one-lot-projects/backlog-actions";
import type { BoardColumnRow, WorkItemRow as WorkItemRowData } from "@/server/one-lot-projects/backlog-types";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

import { CreateWorkItemDialog } from "./create-work-item-dialog";
import { WorkItemRow } from "./work-item-row";

type BacklogCollectionProps = {
  projectId: string;
  items: WorkItemRowData[];
  members: OneLotProjectMemberRow[];
  columns: BoardColumnRow[];
  canEdit: boolean;
  onItemClick: (id: string) => void;
};

export function BacklogCollection({ projectId, items, members, columns, canEdit, onItemClick }: BacklogCollectionProps) {
  const [creating, setCreating] = React.useState(false);
  const { setNodeRef } = useDroppable({ id: "backlog" });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createOneLotProjectWorkItemWithSubtasks,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(result.message);
        setCreating(false);
        queryClient.invalidateQueries({ queryKey: ["one-lot-project-backlog", projectId] });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Backlog <span className="text-muted-foreground font-normal">({items.length} work item{items.length === 1 ? "" : "s"})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div ref={setNodeRef} className="min-h-10 space-y-2">
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">Your backlog is empty.</p>
            ) : (
              items.map((item) => <WorkItemRow key={item.id} item={item} columns={columns} onOpenItem={onItemClick} />)
            )}
          </div>
        </SortableContext>

        {canEdit ? (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Create
          </Button>
        ) : null}
      </CardContent>

      <CreateWorkItemDialog
        open={creating}
        members={members}
        destinationLabel="the Backlog"
        pending={mutation.isPending}
        onOpenChange={setCreating}
        onSubmit={(values) => mutation.mutate({ ...values, projectId, sprintId: null })}
      />
    </Card>
  );
}
