import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns";

export type RenewalStatus = "no_project" | "ongoing" | "renewal_45" | "renewal_30" | "ended";

/**
 * `projectName`/`endDate` both come from the same latest-deployment row
 * (`latestDeploymentSubquery`) — they're null together (no deployment record
 * at all) or set together, so checking `projectName` is how we tell "no
 * deployment yet" apart from "deployed with no end date". No end date on an
 * actual deployment means it runs indefinitely — Ongoing. Otherwise the most
 * urgent bracket wins: Ended once the end date has passed, then the 30-day
 * window, then the 45-day window.
 */
export function getRenewalStatus(
  assignment: { projectName: string | null; endDate: string | null },
  today: Date = startOfToday(),
): RenewalStatus {
  if (!assignment.projectName) return "no_project";
  if (!assignment.endDate) return "ongoing";

  const daysRemaining = differenceInCalendarDays(parseISO(assignment.endDate), today);
  if (daysRemaining <= 0) return "ended";
  if (daysRemaining <= 30) return "renewal_30";
  if (daysRemaining <= 45) return "renewal_45";
  return "ongoing";
}

export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  no_project: "No assigned project",
  ongoing: "Ongoing",
  renewal_45: "Renewal due (45 days)",
  renewal_30: "Renewal due (30 days)",
  ended: "Ended",
};

/** Most-urgent-needs-attention to least, for the Staff Augmentation table's status sort. */
export const RENEWAL_STATUS_URGENCY_RANK: Record<RenewalStatus, number> = {
  ended: 0,
  renewal_30: 1,
  renewal_45: 2,
  ongoing: 3,
  no_project: 4,
};
