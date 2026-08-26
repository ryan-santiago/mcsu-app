import "server-only";

import { desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db";
import { client, gender, jobProfile, level, position, taApplication, taCandidate, taRequest } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaCandidateProfileRow, TaCandidateRow } from "./candidate-types";

const CANDIDATE_SELECTION = {
  id: taCandidate.id,
  firstName: taCandidate.firstName,
  middleName: taCandidate.middleName,
  lastName: taCandidate.lastName,
  genderId: taCandidate.genderId,
  genderName: gender.name,
  mobileNumber: taCandidate.mobileNumber,
  personalEmail: taCandidate.personalEmail,
  cvFileName: taCandidate.cvFileName,
  cvMimeType: taCandidate.cvMimeType,
  cvSize: taCandidate.cvSize,
  employeeId: taCandidate.employeeId,
  createdAt: taCandidate.createdAt,
  updatedAt: taCandidate.updatedAt,
};

/**
 * The talent pool, optionally filtered by a name/email/mobile search term —
 * used both by the standalone pool page and by "search existing candidates"
 * when adding someone to a request.
 */
export async function listTaCandidatePool(search?: string): Promise<TaCandidateRow[]> {
  await authorize("talent_acquisition:read");

  const term = search?.trim();
  const filter = term
    ? or(ilike(taCandidate.firstName, `%${term}%`), ilike(taCandidate.lastName, `%${term}%`), ilike(taCandidate.personalEmail, `%${term}%`), ilike(taCandidate.mobileNumber, `%${term}%`))
    : undefined;

  return db
    .select(CANDIDATE_SELECTION)
    .from(taCandidate)
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
    .where(filter)
    .orderBy(desc(taCandidate.createdAt))
    .limit(50);
}

/** The durable profile view: contact/CV plus every application this person has ever had, across every request. */
export async function getTaCandidateProfile(candidateId: string): Promise<TaCandidateProfileRow | null> {
  await authorize("talent_acquisition:read");

  const candidate = await getTaCandidateById(candidateId);
  if (!candidate) return null;

  const applications = await db
    .select({
      id: taApplication.id,
      requestId: taApplication.requestId,
      positionName: position.name,
      levelName: level.name,
      clientName: client.name,
      status: taApplication.status,
      currentStage: taApplication.currentStage,
      createdAt: taApplication.createdAt,
    })
    .from(taApplication)
    .innerJoin(taRequest, eq(taApplication.requestId, taRequest.id))
    .innerJoin(jobProfile, eq(taRequest.jobProfileId, jobProfile.id))
    .innerJoin(position, eq(jobProfile.positionId, position.id))
    .innerJoin(level, eq(jobProfile.levelId, level.id))
    .innerJoin(client, eq(taRequest.clientId, client.id))
    .where(eq(taApplication.candidateId, candidateId))
    .orderBy(desc(taApplication.createdAt));

  return { ...candidate, applications };
}

export async function getTaCandidateById(candidateId: string): Promise<TaCandidateRow | null> {
  await authorize("talent_acquisition:read");

  const [row] = await db
    .select(CANDIDATE_SELECTION)
    .from(taCandidate)
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
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
