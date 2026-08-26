"use client";

import { useDroppable } from "@dnd-kit/core";

import type { TaStage } from "@/db/schema";
import { cn } from "@/lib/utils";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { TA_STAGE_LABELS } from "@/server/talent-acquisition/stage-types";

import { TaApplicationCard } from "./ta-application-card";

type TaApplicationColumnProps = {
  stage: TaStage;
  applications: TaApplicationRow[];
  onCardClick: (id: string) => void;
};

export function TaApplicationColumn({ stage, applications, onCardClick }: TaApplicationColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${stage}` });

  return (
    <div className="ring-foreground/10 bg-muted flex w-64 shrink-0 flex-col gap-3 rounded-xl p-3 ring-1">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="truncate">{TA_STAGE_LABELS[stage]}</span>
        <span className="text-muted-foreground bg-background shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums">
          {applications.length}
        </span>
      </h3>

      <div
        ref={setNodeRef}
        className={cn("min-h-24 flex-1 space-y-2 rounded-lg transition-colors", isOver && "bg-accent/40 ring-brand/40 ring-2")}
      >
        {applications.map((application) => (
          <TaApplicationCard key={application.id} application={application} onClick={() => onCardClick(application.id)} />
        ))}
      </div>
    </div>
  );
}
