import type { TaApplicationStatus, TaStage } from "@/db/schema";

/**
 * One candidate's pursuit of one request — the row the request detail page's
 * list/board actually renders. Carries the candidate's display fields
 * (joined from `taCandidate`) so the UI doesn't need a second round trip.
 */
export type TaApplicationRow = {
  id: string;
  candidateId: string;
  requestId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  genderId: string | null;
  genderName: string | null;
  mobileNumber: string | null;
  personalEmail: string | null;
  sourceId: string | null;
  sourceName: string | null;
  cvFileName: string | null;
  cvMimeType: string | null;
  cvSize: number | null;
  clientInterviewRequired: boolean;
  targetOnboardDate: string | null;
  status: TaApplicationStatus;
  statusReason: string | null;
  currentStage: TaStage;
  employeeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const TA_APPLICATION_STATUS_LABELS: Record<TaApplicationStatus, string> = {
  active: "Active",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
