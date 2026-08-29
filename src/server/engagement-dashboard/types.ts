import type { BreakdownRow } from "@/server/workforce-dashboard/types";

export type { BreakdownRow };

export type StaffAugmentationDashboardData = {
  totalEngagements: number;
  /** Distinct active employees staffed on at least one engagement — not a sum of per-engagement counts, since the same person can be on more than one. */
  staffedHeadcount: number;
  newAssignments: number;
  teamBreakdown: BreakdownRow[];
  /** One row per engagement, headcount as the value. */
  engagementBreakdown: BreakdownRow[];
};

export type OneLotProjectRollupRow = {
  id: string;
  name: string;
  activeSprints: number;
  plannedSprints: number;
  completedSprints: number;
  workItemCount: number;
  storyPoints: number;
  memberCount: number;
};

export type OneLotProjectsDashboardData = {
  totalProjects: number;
  activeSprints: number;
  workItems: number;
  /** Story points from sprints completed within the selected range, summed across every visible project. */
  pointsDelivered: number;
  projects: OneLotProjectRollupRow[];
  priorityBreakdown: BreakdownRow[];
  typesOfWorkBreakdown: BreakdownRow[];
  teamWorkload: BreakdownRow[];
};

export type EngagementDashboardData = {
  staffAugmentation: StaffAugmentationDashboardData | null;
  oneLotProjects: OneLotProjectsDashboardData | null;
};
