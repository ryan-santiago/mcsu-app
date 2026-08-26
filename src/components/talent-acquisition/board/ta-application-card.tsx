"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Paperclip } from "lucide-react";

import { formatEmployeeDisplayName } from "@/lib/employee-format";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";

type TaApplicationCardProps = {
  application: TaApplicationRow;
  onClick: () => void;
};

export function TaApplicationCard({ application, onClick }: TaApplicationCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: application.id });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const fullName = formatEmployeeDisplayName(application);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        "bg-card hover:border-foreground/20 cursor-pointer touch-none space-y-2 rounded-lg border p-3 shadow-xs transition-colors",
        isDragging && "z-10 opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <p className="text-sm font-medium">{fullName}</p>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{application.sourceName ?? "—"}</span>
        {application.cvFileName ? (
          <span className="flex shrink-0 items-center gap-1" title={`${application.cvFileName} (${formatBytes(application.cvSize)})`}>
            <Paperclip className="size-3" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  );
}
