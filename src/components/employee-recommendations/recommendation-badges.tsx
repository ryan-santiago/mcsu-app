import { CircleAlert, CircleCheck, CircleX, Clock3, FileCheck2, PenLine, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RecommendationStatus } from "@/db/schema";
import type { RecommendationBadge } from "@/server/employee-recommendations/badge";
import { cn } from "@/lib/utils";

/** Same `border-X/30 bg-X/10 text-X` treatment as `src/components/users/user-badges.tsx` — icon + label, never color alone. */
export function RecommendationBadgePill({ badge, className }: { badge: RecommendationBadge; className?: string }) {
  const Icon = badge.tone === "destructive" ? CircleAlert : TriangleAlert;
  const tone =
    badge.tone === "destructive"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-warning/30 bg-warning/10 text-warning";

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {badge.label}
    </Badge>
  );
}

const STATUS_STYLES: Record<RecommendationStatus, { icon: LucideIcon; label: string; className: string }> = {
  draft: { icon: PenLine, label: "Draft", className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
  submitted: { icon: Clock3, label: "Submitted", className: "border-warning/30 bg-warning/10 text-warning" },
  approved: { icon: CircleCheck, label: "Approved", className: "border-success/30 bg-success/10 text-success" },
  rejected: { icon: CircleX, label: "Rejected", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  erf_generated: { icon: FileCheck2, label: "ERF generated", className: "border-info/30 bg-info/10 text-info" },
  applied: { icon: CircleCheck, label: "Applied", className: "border-success/30 bg-success/10 text-success" },
  cancelled: { icon: CircleX, label: "Cancelled", className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
};

export function RecommendationStatusBadge({ status, className }: { status: RecommendationStatus; className?: string }) {
  const { icon: Icon, label, className: tone } = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}
