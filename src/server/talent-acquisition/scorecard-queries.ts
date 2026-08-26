import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { taCandidateScorecard, user } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaScorecardRow } from "./scorecard-types";

export async function listTaScorecards(applicationStageId: string): Promise<TaScorecardRow[]> {
  await authorize("talent_acquisition:read");

  return db
    .select({
      id: taCandidateScorecard.id,
      applicationStageId: taCandidateScorecard.applicationStageId,
      evaluatorId: taCandidateScorecard.evaluatorId,
      evaluatorName: user.name,
      rating: taCandidateScorecard.rating,
      comments: taCandidateScorecard.comments,
      createdAt: taCandidateScorecard.createdAt,
      updatedAt: taCandidateScorecard.updatedAt,
    })
    .from(taCandidateScorecard)
    .leftJoin(user, eq(taCandidateScorecard.evaluatorId, user.id))
    .where(eq(taCandidateScorecard.applicationStageId, applicationStageId))
    .orderBy(asc(taCandidateScorecard.createdAt));
}
