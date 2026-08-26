import type { TaCandidateStatus } from "@/db/schema";

export type TaCandidateRow = {
  id: string;
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
  /** The storage key itself is never exposed here — see `getTaCandidateCvFile` in `candidate-queries.ts`, used only by the download route. */
  cvFileName: string | null;
  cvMimeType: string | null;
  cvSize: number | null;
  clientInterviewRequired: boolean;
  targetOnboardDate: string | null;
  status: TaCandidateStatus;
  employeeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const TA_CANDIDATE_STATUS_LABELS: Record<TaCandidateStatus, string> = {
  active: "Active",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
