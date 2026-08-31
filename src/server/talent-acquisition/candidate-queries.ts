import "server-only";

import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  client,
  gender,
  jobPostingSource,
  jobProfile,
  level,
  position,
  taApplication,
  taCandidate,
  taRequest,
} from "@/db/schema";
import { authorize } from "@/lib/session";

import type {
  TaCandidateFilters,
  TaCandidatePoolResult,
  TaCandidatePoolRow,
  TaCandidateProfileRow,
  TaCandidateRow,
} from "./candidate-types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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
 * used by "search existing candidates" when adding someone to a request.
 * Deliberately unpaginated (capped at 50) and without stage/status/source
 * context — a lightweight picker, not the main list. See
 * `listTaCandidatesPage` below for the full, paginated, filterable list.
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

/**
 * Each candidate's "most relevant application right now" — the most recent
 * *active* one if they have one, else their most recent application overall
 * (rejected/withdrawn/hired). `null` for a candidate who's never applied to
 * anything. `DISTINCT ON` per candidate, same idiom as
 * `latestEmploymentSubquery()` in `src/server/employees/queries.ts`.
 */
function latestApplicationSubquery() {
  return db
    .selectDistinctOn([taApplication.candidateId], {
      candidateId: taApplication.candidateId,
      requestId: taApplication.requestId,
      status: taApplication.status,
      currentStage: taApplication.currentStage,
      sourceId: taApplication.sourceId,
      sourceName: sql<string | null>`${jobPostingSource.name}`.as("source_name"),
    })
    .from(taApplication)
    .leftJoin(jobPostingSource, eq(taApplication.sourceId, jobPostingSource.id))
    .orderBy(
      taApplication.candidateId,
      sql`${taApplication.status} = 'active' desc`,
      desc(taApplication.createdAt),
    )
    .as("latest_application");
}

function buildPoolWhere(filters: TaCandidateFilters, latestApplication: ReturnType<typeof latestApplicationSubquery>): SQL | undefined {
  const clauses: SQL[] = [];

  const term = filters.search?.trim();
  if (term) {
    const match = or(
      ilike(taCandidate.firstName, `%${term}%`),
      ilike(taCandidate.lastName, `%${term}%`),
      ilike(taCandidate.personalEmail, `%${term}%`),
      ilike(taCandidate.mobileNumber, `%${term}%`),
    );
    if (match) clauses.push(match);
  }
  if (filters.stage) clauses.push(eq(latestApplication.currentStage, filters.stage));
  if (filters.applicationStatus) clauses.push(eq(latestApplication.status, filters.applicationStatus));
  if (filters.sourceId) clauses.push(eq(latestApplication.sourceId, filters.sourceId));

  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * The full talent pool list — paginated, filterable by stage/application
 * status/source, carrying each candidate's current pipeline context. This is
 * what `/talent-acquisition/candidates` renders; `listTaCandidatePool` above
 * stays the lightweight unpaginated search for the "add existing candidate"
 * picker.
 */
export async function listTaCandidatesPage(filters: TaCandidateFilters = {}): Promise<TaCandidatePoolResult> {
  await authorize("talent_acquisition:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const latestApplication = latestApplicationSubquery();
  const where = buildPoolWhere(filters, latestApplication);

  const rows = await db
    .select({
      ...CANDIDATE_SELECTION,
      requestId: latestApplication.requestId,
      status: latestApplication.status,
      currentStage: latestApplication.currentStage,
      sourceName: latestApplication.sourceName,
    })
    .from(taCandidate)
    .leftJoin(gender, eq(taCandidate.genderId, gender.id))
    .leftJoin(latestApplication, eq(latestApplication.candidateId, taCandidate.id))
    .where(where)
    .orderBy(desc(taCandidate.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(taCandidate)
    .leftJoin(latestApplication, eq(latestApplication.candidateId, taCandidate.id))
    .where(where);

  const candidates: TaCandidatePoolRow[] = rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    genderId: row.genderId,
    genderName: row.genderName,
    mobileNumber: row.mobileNumber,
    personalEmail: row.personalEmail,
    cvFileName: row.cvFileName,
    cvMimeType: row.cvMimeType,
    cvSize: row.cvSize,
    employeeId: row.employeeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentStage: row.currentStage ?? null,
    applicationStatus: row.status ?? null,
    sourceName: row.sourceName ?? null,
    latestRequestId: row.requestId ?? null,
  }));

  return { candidates, total, page, pageSize };
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
