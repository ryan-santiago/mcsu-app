"use client";

import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { TaStage } from "@/db/schema";
import { taApplicationsQueryKey } from "@/server/talent-acquisition/application-query-key";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { moveApplicationStage } from "@/server/talent-acquisition/stage-actions";
import { TA_STAGE_ORDER } from "@/server/talent-acquisition/stage-order";

import { TaApplicationColumn } from "./ta-application-column";

type TaApplicationBoardProps = {
  requestId: string;
  applications: TaApplicationRow[];
  canMove: boolean;
  onCardClick: (id: string) => void;
};

export function TaApplicationBoard({ requestId, applications, canMove, onCardClick }: TaApplicationBoardProps) {
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const moveMutation = useMutation({
    mutationFn: moveApplicationStage,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.error);
        void queryClient.invalidateQueries({ queryKey: taApplicationsQueryKey(requestId) });
      }
    },
    onError: () => {
      toast.error("Something went wrong. Please try again.");
      void queryClient.invalidateQueries({ queryKey: taApplicationsQueryKey(requestId) });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    if (!canMove) return;
    const { active, over } = event;
    if (!over) return;

    const applicationId = String(active.id);
    const destStage = String(over.id).startsWith("column:") ? (String(over.id).slice("column:".length) as TaStage) : null;
    if (!destStage) return;

    const application = applications.find((item) => item.id === applicationId);
    if (!application || application.currentStage === destStage) return;

    queryClient.setQueryData<TaApplicationRow[]>(taApplicationsQueryKey(requestId), (previous) =>
      previous?.map((item) => (item.id === applicationId ? { ...item, currentStage: destStage } : item)),
    );

    moveMutation.mutate({ applicationId, requestId, stage: destStage });
  }

  return (
    <DndContext id={`ta-application-board-${requestId}`} sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {TA_STAGE_ORDER.map((stage) => (
          <TaApplicationColumn
            key={stage}
            stage={stage}
            applications={applications.filter((application) => application.currentStage === stage)}
            onCardClick={onCardClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
