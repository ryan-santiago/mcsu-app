import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { count, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { client, jobProfile, level, position, taApplication, taRequest, user } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaRequestRow } from "./types";

const approver = alias(user, "approver");

const REQUEST_SELECTION = {
  id: taRequest.id,
  jobProfileId: taRequest.jobProfileId,
  positionName: position.name,
  levelName: level.name,
  jobDescription: jobProfile.jobDescription,
  jobQualification: jobProfile.jobQualification,
  clientId: taRequest.clientId,
  clientName: client.name,
  headcountNeeded: taRequest.headcountNeeded,
  workSetup: taRequest.workSetup,
  workSetupDetail: taRequest.workSetupDetail,
  status: taRequest.status,
  notes: taRequest.notes,
  reviewNote: taRequest.reviewNote,
  approvedAt: taRequest.approvedAt,
  createdAt: taRequest.createdAt,
  updatedAt: taRequest.updatedAt,
  requesterId: user.id,
  requesterName: user.name,
  approverId: approver.id,
  approverName: approver.name,
};

function baseRequestQuery() {
  return db
    .select(REQUEST_SELECTION)
    .from(taRequest)
    .innerJoin(jobProfile, eq(taRequest.jobProfileId, jobProfile.id))
    .innerJoin(position, eq(jobProfile.positionId, position.id))
    .innerJoin(level, eq(jobProfile.levelId, level.id))
    .innerJoin(client, eq(taRequest.clientId, client.id))
    .leftJoin(user, eq(taRequest.requestedBy, user.id))
    .leftJoin(approver, eq(taRequest.approvedBy, approver.id));
}

/** Hired-application count per request — cheap enough to compute for every list render, this isn't a large table. */
async function headcountFilledByRequest(): Promise<Map<string, number>> {
  const rows = await db
    .select({ requestId: taApplication.requestId, total: count() })
    .from(taApplication)
    .where(eq(taApplication.status, "hired"))
    .groupBy(taApplication.requestId);

  return new Map(rows.map((row) => [row.requestId, row.total]));
}

function toRow(row: Awaited<ReturnType<typeof baseRequestQuery>>[number], filledMap: Map<string, number>): TaRequestRow {
  return {
    id: row.id,
    jobProfileId: row.jobProfileId,
    positionName: row.positionName,
    levelName: row.levelName,
    jobDescription: row.jobDescription,
    jobQualification: row.jobQualification,
    clientId: row.clientId,
    clientName: row.clientName,
    headcountNeeded: row.headcountNeeded,
    headcountFilled: filledMap.get(row.id) ?? 0,
    workSetup: row.workSetup,
    workSetupDetail: row.workSetupDetail,
    status: row.status,
    notes: row.notes,
    requestedBy: row.requesterId ? { id: row.requesterId, name: row.requesterName ?? "" } : null,
    approvedBy: row.approverId ? { id: row.approverId, name: row.approverName ?? "" } : null,
    approvedAt: row.approvedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTaRequests(): Promise<TaRequestRow[]> {
  await authorize("talent_acquisition:read");

  const [rows, filledMap] = await Promise.all([
    baseRequestQuery().orderBy(desc(taRequest.createdAt)),
    headcountFilledByRequest(),
  ]);

  return rows.map((row) => toRow(row, filledMap));
}

export async function getTaRequestById(id: string): Promise<TaRequestRow | null> {
  await authorize("talent_acquisition:read");

  const [[row], filledMap] = await Promise.all([
    baseRequestQuery().where(eq(taRequest.id, id)).limit(1),
    headcountFilledByRequest(),
  ]);

  return row ? toRow(row, filledMap) : null;
}
