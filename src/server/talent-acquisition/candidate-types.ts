import type { TaApplicationStatus, TaStage } from "@/db/schema";

export type TaCandidateRow = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  genderId: string | null;
  genderName: string | null;
  mobileNumber: string | null;
  personalEmail: string | null;
  /** The storage key itself is never exposed here — see `getTaCandidateCvFile`, used only by the download route. */
  cvFileName: string | null;
  cvMimeType: string | null;
  cvSize: number | null;
  employeeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One row in a candidate's application-history table — every request they've ever pursued. */
export type TaCandidateApplicationHistoryRow = {
  id: string;
  requestId: string;
  positionName: string;
  levelName: string;
  clientName: string;
  status: TaApplicationStatus;
  currentStage: TaStage;
  createdAt: Date;
};

export type TaCandidateProfileRow = TaCandidateRow & {
  applications: TaCandidateApplicationHistoryRow[];
};
