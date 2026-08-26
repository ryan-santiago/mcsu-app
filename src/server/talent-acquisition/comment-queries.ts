import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { taCandidateComment, user } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { TaCandidateCommentRow } from "./comment-types";

const AUTHOR_SELECTION = { id: user.id, name: user.name, image: user.image };

export async function listTaCandidateComments(candidateId: string): Promise<TaCandidateCommentRow[]> {
  await authorize("talent_acquisition:read");

  const rows = await db
    .select({
      id: taCandidateComment.id,
      candidateId: taCandidateComment.candidateId,
      body: taCandidateComment.body,
      createdAt: taCandidateComment.createdAt,
      author: AUTHOR_SELECTION,
    })
    .from(taCandidateComment)
    .leftJoin(user, eq(taCandidateComment.authorId, user.id))
    .where(eq(taCandidateComment.candidateId, candidateId))
    .orderBy(asc(taCandidateComment.createdAt));

  return rows.map((row) => ({ ...row, author: row.author?.id ? row.author : null }));
}
