import { ArrowDown, ArrowUp, Bug, ChevronsDown, ChevronsUp, Equal, ListChecks, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { WorkItemPriority, WorkItemStatus, WorkItemType } from "@/db/schema";
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_STATUS_COLORS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_TYPE_LABELS,
} from "@/lib/one-lot-project-backlog-format";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<WorkItemType, LucideIcon> = {
  task: ListChecks,
  bug: Bug,
};

/** Type is distinguished by icon and label, not colour — colour is reserved for Status, same convention as `DeviceTypeBadge`. */
export function WorkItemTypeBadge({ type, className }: { type: WorkItemType; className?: string }) {
  const Icon = TYPE_ICONS[type];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {WORK_ITEM_TYPE_LABELS[type]}
    </Badge>
  );
}

/** Ordinal severity — one icon shape per level, colour intensifying toward the destructive end, mirrors the Priority Breakdown chart's light→dark logic. */
export const PRIORITY_STYLES: Record<WorkItemPriority, { icon: LucideIcon; className: string }> = {
  highest: { icon: ChevronsUp, className: "text-destructive" },
  high: { icon: ArrowUp, className: "text-warning" },
  medium: { icon: Equal, className: "text-muted-foreground" },
  low: { icon: ArrowDown, className: "text-info" },
  lowest: { icon: ChevronsDown, className: "text-success" },
};

export function WorkItemPriorityBadge({ priority, className }: { priority: WorkItemPriority; className?: string }) {
  const { icon: Icon, className: tone } = PRIORITY_STYLES[priority];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", tone, className)} title={WORK_ITEM_PRIORITY_LABELS[priority]}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{WORK_ITEM_PRIORITY_LABELS[priority]}</span>
    </span>
  );
}

const STATUS_STYLES: Record<WorkItemStatus, string> = {
  todo: "border-border text-foreground",
  in_progress: "border-brand/30 bg-brand/10 text-brand",
  done: "border-success/30 bg-success/10 text-success",
};

export function WorkItemStatusBadge({ status, className }: { status: WorkItemStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal", STATUS_STYLES[status], className)}
      style={{ borderColor: `color-mix(in oklab, ${WORK_ITEM_STATUS_COLORS[status]} 30%, transparent)` }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: WORK_ITEM_STATUS_COLORS[status] }} aria-hidden />
      {WORK_ITEM_STATUS_LABELS[status]}
    </Badge>
  );
}
