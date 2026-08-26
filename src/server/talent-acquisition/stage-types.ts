import type { TaStage, TaStageStatus } from "@/db/schema";

export type TaApplicationStageRow = {
  id: string;
  applicationId: string;
  stage: TaStage;
  status: TaStageStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  notes: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const TA_STAGE_LABELS: Record<TaStage, string> = {
  l1_assessment: "L1 Assessment",
  l2_assessment: "L2 Assessment",
  client_interview: "Client Interview",
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
