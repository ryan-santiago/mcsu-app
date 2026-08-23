import { CircleCheck, CircleX, Clock3, FolderX, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RENEWAL_STATUS_LABELS, type RenewalStatus } from "@/lib/staff-augmentation-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<RenewalStatus, { icon: LucideIcon; className: string }> = {
  /** Neutral, not alert-colored — same convention as "deployed" in device-badges.tsx: a fact, not an alert. */
  no_project: {
    icon: FolderX,
    className: "border-border text-muted-foreground",
  },
  ongoing: {
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  renewal_45: {
    icon: Clock3,
    className: "border-info/30 bg-info/10 text-info",
  },
  renewal_30: {
    icon: TriangleAlert,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  ended: {
    icon: CircleX,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

export function StaffAugmentationStatusBadge({ status, className }: { status: RenewalStatus; className?: string }) {
  const { icon: Icon, className: tone } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {RENEWAL_STATUS_LABELS[status]}
    </Badge>
  );
}
