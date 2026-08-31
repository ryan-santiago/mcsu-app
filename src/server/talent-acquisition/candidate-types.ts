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

/**
 * `TaCandidateRow` plus the pool list's per-row pipeline context — from
 * whichever of this candidate's applications is "most relevant right now"
 * (most recent active one, else most recent overall; `null` if they've never
 * applied to anything). A candidate can have many applications across
 * requests, so this is deliberately a single-row summary, not the full
 * history (`TaCandidateProfileRow.applications` below has that).
 */
export type TaCandidatePoolRow = TaCandidateRow & {
  currentStage: TaStage | null;
  applicationStatus: TaApplicationStatus | null;
  sourceName: string | null;
  latestRequestId: string | null;
};

export type TaCandidateFilters = {
  search?: string;
  stage?: TaStage;
  applicationStatus?: TaApplicationStatus;
  sourceId?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type TaCandidatePoolResult = {
  candidates: TaCandidatePoolRow[];
  total: number;
  page: number;
  pageSize: number;
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
