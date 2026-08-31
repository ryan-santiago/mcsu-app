import type { TaStage, TaStageStatus } from "@/db/schema";

export type TaApplicationStageRow = {
  id: string;
  applicationId: string;
  stage: TaStage;
  status: TaStageStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  notes: string | null;
  /** `client_interview` only. */
  clientFeedback: string | null;
  /** `final_interview` only — all three set together or all null. */
  proposedSalary: string | null;
  proposedCommunicationAllowance: string | null;
  proposedTransportationAllowance: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** `job_offer` is retired (dropped from the pipeline — Final Interview is now terminal) but the key must stay: `TaStage` still includes it at the type level since the DB enum can't be cleanly shrunk. */
export const TA_STAGE_LABELS: Record<TaStage, string> = {
  l1_assessment: "L1 Assessment",
  l2_assessment: "L2 Assessment",
  client_interview: "Client Interview",
  l3_assessment: "L3 Interview & Assessment",
  final_interview: "Final Interview",
  job_offer: "Job Offer",
};

export const TA_STAGE_STATUS_LABELS: Record<TaStageStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
};

export type UserOption = { id: string; name: string };
