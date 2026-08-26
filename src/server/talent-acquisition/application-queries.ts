import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { gender, jobPostingSource, taApplication, taCandidate } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaApplicationRow } from "./application-types";

const APPLICATION_SELECTION = {
  id: taApplication.id,
  candidateId: taApplication.candidateId,
  requestId: taApplication.requestId,
  firstName: taCandidate.firstName,
  middleName: taCandidate.middleName,
  lastName: taCandidate.lastName,
  genderId: taCandidate.genderId,
  genderName: gender.name,
  mobileNumber: taCandidate.mobileNumber,
  personalEmail: taCandidate.personalEmail,
  sourceId: taApplication.sourceId,
  sourceName: jobPostingSource.name,
  cvFileName: taCandidate.cvFileName,
  cvMimeType: taCandidate.cvMimeType,
  cvSize: taCandidate.cvSize,
  clientInterviewRequired: taApplication.clientInterviewRequired,
  targetOnboardDate: taApplication.targetOnboardDate,
  status: taApplication.status,
  statusReason: taApplication.statusReason,
  currentStage: taApplication.currentStage,
  employeeId: taCandidate.employeeId,
  createdAt: taApplication.createdAt,
  updatedAt: taApplication.updatedAt,
};

function baseApplicationQuery() {
  return db
    .select(APPLICATION_SELECTION)
    .from(taApplication)
    .innerJoin(taCandidate, eq(taApplication.candidateId, taCandidate.id))
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
    .leftJoin(jobPostingSource, eq(taApplication.sourceId, jobPostingSource.id));
}

export async function listTaApplications(requestId: string): Promise<TaApplicationRow[]> {
  await authorize("talent_acquisition:read");

  return baseApplicationQuery().where(eq(taApplication.requestId, requestId)).orderBy(asc(taApplication.createdAt));
}

export async function getTaApplicationById(applicationId: string): Promise<TaApplicationRow | null> {
  await authorize("talent_acquisition:read");

  const [row] = await baseApplicationQuery().where(eq(taApplication.id, applicationId)).limit(1);
  return row ?? null;
}
