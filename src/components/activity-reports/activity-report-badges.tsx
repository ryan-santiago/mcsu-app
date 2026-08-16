import { CalendarOff, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ActivityReportStatus } from "@/db/schema";
import { ACTIVITY_REPORT_STATUS_LABELS } from "@/lib/activity-report-format";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ActivityReportStatus, { icon: LucideIcon; className: string }> = {
  present: {
    icon: CircleCheck,
    className: "border-success/30 bg-success/10 text-success",
  },
  on_leave: {
    icon: CalendarOff,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
};

export function ActivityReportStatusBadge({
  status,
  className,
}: {
  status: ActivityReportStatus;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STATUS_STYLES[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {ACTIVITY_REPORT_STATUS_LABELS[status]}
    </Badge>
  );
}
