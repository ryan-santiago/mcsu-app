"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taCandidateScorecard, type TaStage } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import type { Permission } from "@/lib/rbac";
import { AuthorizationError, authorize } from "@/lib/session";

import { listTaScorecards } from "./scorecard-queries";
import { TA_SCORECARD_RATING_LABELS, type TaScorecardRow } from "./scorecard-types";

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition/scorecards] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Same stage-tier permission that gates recording the stage's own result — anyone holding it may leave a scorecard, not only the assignee. */
const STAGE_PERMISSION: Record<TaStage, Permission> = {
  l1_assessment: "talent_acquisition:l1_assess",
  l2_assessment: "talent_acquisition:l2_assess",
  client_interview: "talent_acquisition:l2_assess",
  final_interview: "talent_acquisition:finalize",
  job_offer: "talent_acquisition:finalize",
};

const scorecardInputSchema = z.object({
  applicationStageId: z.string().min(1),
  requestId: z.string().min(1),
  stage: z.enum(["l1_assessment", "l2_assessment", "client_interview", "final_interview", "job_offer"]),
  rating: z.enum(["strong_yes", "yes", "no", "strong_no"]),
  comments: z.string().max(2000, "That's too long").optional(),
});

export async function fetchTaScorecards(applicationStageId: string): Promise<TaScorecardRow[]> {
  return listTaScorecards(applicationStageId);
}

/** Upserts the acting evaluator's own scorecard for a stage — re-scoring updates their existing row rather than adding a second one. */
export async function submitTaScorecard(input: {
  applicationStageId: string;
  requestId: string;
  stage: TaStage;
  rating: "strong_yes" | "yes" | "no" | "strong_no";
  comments?: string;
}): Promise<ActionResult> {
  return run(async () => {
    const values = scorecardInputSchema.parse(input);
    const actor = await authorize(STAGE_PERMISSION[values.stage]);
    const comments = values.comments?.trim() || null;

    const [existing] = await db
      .select()
      .from(taCandidateScorecard)
      .where(and(eq(taCandidateScorecard.applicationStageId, values.applicationStageId), eq(taCandidateScorecard.evaluatorId, actor.id)))
      .limit(1);

    if (existing) {
      await db
        .update(taCandidateScorecard)
        .set({ rating: values.rating, comments })
        .where(eq(taCandidateScorecard.id, existing.id));
    } else {
      await db.insert(taCandidateScorecard).values({
        id: crypto.randomUUID(),
        applicationStageId: values.applicationStageId,
        evaluatorId: actor.id,
        rating: values.rating,
        comments,
      });
    }

    await recordAudit({
      module: "ta_applications",
      action: "scorecard_submitted",
      entityId: values.applicationStageId,
      actorId: actor.id,
      actorEmail: actor.email,
      changes: diffFields(
        existing ? { rating: TA_SCORECARD_RATING_LABELS[existing.rating] } : null,
        { rating: TA_SCORECARD_RATING_LABELS[values.rating] },
        { rating: "Scorecard rating" },
      ),
    });

    revalidatePath(`/talent-acquisition/${values.requestId}`);
    return { ok: true, data: undefined, message: existing ? "Scorecard updated." : "Scorecard submitted." };
  });
}
