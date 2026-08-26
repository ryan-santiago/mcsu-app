import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { gender, jobPostingSource, taCandidate } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaCandidateRow } from "./candidate-types";

export async function listTaCandidates(requestId: string): Promise<TaCandidateRow[]> {
  await authorize("talent_acquisition:read");

  return db
    .select({
      id: taCandidate.id,
      requestId: taCandidate.requestId,
      firstName: taCandidate.firstName,
      middleName: taCandidate.middleName,
      lastName: taCandidate.lastName,
      genderId: taCandidate.genderId,
      genderName: gender.name,
      mobileNumber: taCandidate.mobileNumber,
      personalEmail: taCandidate.personalEmail,
      sourceId: taCandidate.sourceId,
      sourceName: jobPostingSource.name,
      cvFileName: taCandidate.cvFileName,
      cvMimeType: taCandidate.cvMimeType,
      cvSize: taCandidate.cvSize,
      clientInterviewRequired: taCandidate.clientInterviewRequired,
      targetOnboardDate: taCandidate.targetOnboardDate,
      status: taCandidate.status,
      employeeId: taCandidate.employeeId,
      createdAt: taCandidate.createdAt,
      updatedAt: taCandidate.updatedAt,
    })
    .from(taCandidate)
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
    .leftJoin(jobPostingSource, eq(taCandidate.sourceId, jobPostingSource.id))
    .where(eq(taCandidate.requestId, requestId))
    .orderBy(asc(taCandidate.createdAt));
}

export async function getTaCandidateById(candidateId: string): Promise<TaCandidateRow | null> {
  await authorize("talent_acquisition:read");

  const [row] = await db
    .select({
      id: taCandidate.id,
      requestId: taCandidate.requestId,
      firstName: taCandidate.firstName,
      middleName: taCandidate.middleName,
      lastName: taCandidate.lastName,
      genderId: taCandidate.genderId,
      genderName: gender.name,
      mobileNumber: taCandidate.mobileNumber,
      personalEmail: taCandidate.personalEmail,
      sourceId: taCandidate.sourceId,
      sourceName: jobPostingSource.name,
      cvFileName: taCandidate.cvFileName,
      cvMimeType: taCandidate.cvMimeType,
      cvSize: taCandidate.cvSize,
      clientInterviewRequired: taCandidate.clientInterviewRequired,
      targetOnboardDate: taCandidate.targetOnboardDate,
      status: taCandidate.status,
      employeeId: taCandidate.employeeId,
      createdAt: taCandidate.createdAt,
      updatedAt: taCandidate.updatedAt,
    })
    .from(taCandidate)
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
    .leftJoin(jobPostingSource, eq(taCandidate.sourceId, jobPostingSource.id))
    .where(eq(taCandidate.id, candidateId))
    .limit(1);

  return row ?? null;
}

/** For the CV download route only — the one place `cvStorageKey` is ever read back out. */
export async function getTaCandidateCvFile(candidateId: string) {
  const [row] = await db
    .select({
      cvStorageKey: taCandidate.cvStorageKey,
      cvFileName: taCandidate.cvFileName,
      cvMimeType: taCandidate.cvMimeType,
    })
    .from(taCandidate)
    .where(eq(taCandidate.id, candidateId))
    .limit(1);

  return row ?? null;
}
