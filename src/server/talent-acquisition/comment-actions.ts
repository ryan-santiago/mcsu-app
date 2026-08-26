"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { taCandidate, taCandidateComment } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { AuthorizationError, authorize } from "@/lib/session";

import { listTaCandidateComments } from "./comment-queries";
import type { TaCandidateCommentRow } from "./comment-types";

const commentBodySchema = z.string().trim().min(1, "Comment can't be empty").max(2000, "That's too long");

async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "That request was not valid." };
    }
    console.error("[talent-acquisition/comments] action failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function fetchTaCandidateComments(candidateId: string): Promise<TaCandidateCommentRow[]> {
  return listTaCandidateComments(candidateId);
}

export async function addTaCandidateComment(input: {
  candidateId: string;
  requestId: string;
  body: string;
}): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const actor = await authorize("talent_acquisition:write");
    const body = commentBodySchema.parse(input.body);

    const [candidate] = await db.select({ id: taCandidate.id }).from(taCandidate).where(eq(taCandidate.id, input.candidateId)).limit(1);
    if (!candidate) return { ok: false, error: "That candidate no longer exists." };

    const id = crypto.randomUUID();
    await db.insert(taCandidateComment).values({ id, candidateId: input.candidateId, body, authorId: actor.id });

    await recordAudit({
      module: "ta_candidates",
      action: "comment_added",
      entityId: input.candidateId,
      actorId: actor.id,
      actorEmail: actor.email,
    });

    revalidatePath(`/talent-acquisition/${input.requestId}`);
    return { ok: true, data: { id }, message: "Comment added." };
  });
}
