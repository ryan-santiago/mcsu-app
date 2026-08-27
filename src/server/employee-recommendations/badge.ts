import type { RecommendationTriggerType } from "@/db/schema";

/**
 * `warning`/`destructive` map straight onto the semantic tokens
 * `RecommendationBadge` (see `src/components/employee-recommendations/recommendation-badges.tsx`)
 * renders with — same `border-X/30 bg-X/10 text-X` treatment as
 * `src/components/users/user-badges.tsx`. Never `--brand-orange`: that
 * token is reserved for graphics, not status text, and fails AA as text on
 * a light surface.
 */
export type RecommendationBadgeTone = "warning" | "destructive";

export type RecommendationBadge = {
  tone: RecommendationBadgeTone;
  label: string;
};

/** Project Hired ("project_based") thresholds — see docs/EMPLOYEE_RECOMMENDATION.md §6. */
const PH_AMBER_DAYS = 60;
const PH_RED_DAYS = 30;

/**
 * Probationary only has one confirmed threshold from the source process
 * (30 days). Past the end date is treated as `destructive` — see open
 * question 3 in docs/EMPLOYEE_RECOMMENDATION.md if a second earlier
 * threshold is wanted later.
 */
const PROBATIONARY_AMBER_DAYS = 30;

/**
 * `null` means "not in the monitoring window yet" — the caller should drop
 * the row rather than render a badge with no meaning.
 */
export function resolveRecommendationBadge(
  triggerType: Extract<RecommendationTriggerType, "ph_contract_expiring" | "probationary_expiring">,
  daysRemaining: number,
): RecommendationBadge | null {
  if (triggerType === "ph_contract_expiring") {
    if (daysRemaining > PH_AMBER_DAYS) return null;
    return daysRemaining <= PH_RED_DAYS
      ? { tone: "destructive", label: "Renewal urgent" }
      : { tone: "warning", label: "Renewal due" };
  }

  if (daysRemaining > PROBATIONARY_AMBER_DAYS) return null;
  return daysRemaining < 0 ? { tone: "destructive", label: "Overdue" } : { tone: "warning", label: "Review due" };
}
