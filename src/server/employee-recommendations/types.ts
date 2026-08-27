import type { ApprovalRequestStatus, ApprovalStepStatus, RecommendationStatus, RecommendationTriggerType } from "@/db/schema";
import type { RequestedActions } from "@/lib/validation/employee-recommendations";

import type { RecommendationBadge } from "./badge";

/**
 * One row in the "needs recommendation" queue — computed on read from
 * `employeeEmployment`/`employee`, never stored. Not the same thing as an
 * `employeeRecommendation` row: this is what a Manager sees *before* one
 * exists for that employment record. See
 * docs/EMPLOYEE_RECOMMENDATION.md §6.
 */
export type RecommendationQueueItem = {
  employeeId: string;
  employmentId: string;
  employeeCode: string | null;
  employeeName: string;
  triggerType: "ph_contract_expiring" | "probationary_expiring";
  employmentTypeName: string;
  endDate: string;
  /** Negative once past `endDate`. */
  daysRemaining: number;
  badge: RecommendationBadge;
};

/** An employee an actor may start a manual recommendation for — their own team's roster. */
export type RecommendationEmployeeOption = {
  id: string;
  code: string | null;
  name: string;
  levelPositionLabel: string | null;
};

/**
 * The employee's current data, read live — used to populate "FROM" fields
 * when a manager opens the form (see docs/EMPLOYEE_RECOMMENDATION.md §5) and
 * to compute the General Information snapshot at creation time. Not stored
 * on the recommendation itself except as a copy inside `requestedActions`
 * once a section is toggled on.
 */
export type EmployeeRecommendationSnapshot = {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  teamId: string | null;
  teamName: string | null;
  levelId: string | null;
  levelName: string | null;
  positionId: string | null;
  positionName: string | null;
  levelPositionLabel: string | null;
  employmentTypeId: string | null;
  employmentTypeName: string | null;
  salary: string | null;
  communicationAllowance: string | null;
  transportationAllowance: string | null;
};

/** One row in the "In progress" list — real `employeeRecommendation` rows, unlike `RecommendationQueueItem`. */
export type RecommendationListItem = {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  triggerType: RecommendationTriggerType;
  status: RecommendationStatus;
  updatedAt: Date;
};

/** One approval step for the timeline UI — see `resolveApprovalChain()`. */
export type ApprovalStepView = {
  id: string;
  stepOrder: number;
  roleLabel: string;
  approverName: string;
  status: ApprovalStepStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
  note: string | null;
};

export type RecommendationApproval = {
  approvalRequestId: string;
  status: ApprovalRequestStatus;
  currentStepOrder: number;
  steps: ApprovalStepView[];
};

export type RecommendationDetail = {
  id: string;
  employeeId: string;
  employeeName: string;
  triggerType: RecommendationTriggerType;
  status: RecommendationStatus;
  submittedByName: string;
  employeeNumberSnapshot: string | null;
  departmentSnapshot: string;
  positionSnapshot: string;
  managerNameSnapshot: string;
  requestedActions: RequestedActions;
  accomplishmentsAndRecommendation: string | null;
  hasKpiResult: boolean;
  hasErf: boolean;
  erfGeneratedAt: Date | null;
  appliedToEmploymentHistoryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Whether the current viewer may edit this draft — status must be `draft` and the viewer must be in scope. */
  canEdit: boolean;
  /** Whether the current viewer may submit this draft for approval — same gate as `canEdit`. */
  canSubmit: boolean;
  /** Whether the current viewer may withdraw this recommendation — `draft` or `submitted`, same scope gate as `canEdit`. Broader than `canEdit`'s status check since a still-pending submission (not just a draft) can need withdrawing — see `cancelRecommendation`. */
  canCancel: boolean;
  /** Whether the current viewer may generate the ERF — `employee_recommendations:generate_erf`, status must be `approved`. Not team-scoped: the Talent Acquisition Manager handles this org-wide, same reasoning as approvers not being team-scoped. */
  canGenerateErf: boolean;
  /** Whether the current viewer may apply this recommendation to employment history — same permission as `canGenerateErf`, status must be `erf_generated`. */
  canApply: boolean;
  approval: RecommendationApproval | null;
  /** The id of the pending `approvalStep` the current viewer may act on right now, if any. */
  actionableStepId: string | null;
};

/** One row in the "Needs your approval" list. */
export type PendingApprovalItem = {
  approvalRequestId: string;
  stepId: string;
  recommendationId: string;
  employeeName: string;
  employeeCode: string | null;
  roleLabel: string;
  requestedByLabel: string;
  submittedAt: Date;
};
