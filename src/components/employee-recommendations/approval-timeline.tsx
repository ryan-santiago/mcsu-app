import { CircleCheck, CircleX, Clock3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ApprovalStepStatus } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecommendationApproval } from "@/server/employee-recommendations/types";

const STEP_STYLES: Record<ApprovalStepStatus, { icon: LucideIcon; className: string }> = {
  pending: { icon: Clock3, className: "border-warning/30 bg-warning/10 text-warning" },
  approved: { icon: CircleCheck, className: "border-success/30 bg-success/10 text-success" },
  rejected: { icon: CircleX, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  skipped: { icon: Clock3, className: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
};

/**
 * A vertical stepper for one recommendation's approval chain — built to be
 * embeddable in a future generic Approval Workflow inbox too, not just this
 * module's own detail page (see docs/EMPLOYEE_RECOMMENDATION.md §1/§11), so
 * its only prop is the approval data itself.
 */
export function ApprovalTimeline({ approval }: { approval: RecommendationApproval }) {
  return (
    <ol className="space-y-4">
      {approval.steps.map((step, index) => {
        const { icon: Icon, className } = STEP_STYLES[step.status];
        const isLast = index === approval.steps.length - 1;

        return (
          <li key={step.id} className="relative flex gap-3">
            {!isLast ? <span className="bg-border absolute top-8 left-[15px] h-[calc(100%-1.25rem)] w-px" aria-hidden /> : null}
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", className)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="flex-1 space-y-0.5 pb-1">
              <p className="text-sm font-medium">
                {step.roleLabel} <span className="text-muted-foreground font-normal">— {step.approverName}</span>
              </p>
              {step.status === "pending" ? (
                <p className="text-muted-foreground text-xs">Waiting for review</p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {step.status === "approved" ? "Approved" : "Rejected"}
                  {step.decidedByName ? ` by ${step.decidedByName}` : ""}
                  {step.decidedAt ? ` · ${formatDateTime(step.decidedAt)}` : ""}
                </p>
              )}
              {step.note ? <p className="text-sm">{step.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
