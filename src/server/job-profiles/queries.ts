import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { jobProfile, level, position } from "@/db/schema";
import { authorize } from "@/lib/session";

import type { JobProfileRow } from "./types";

/** Every Job Profile, newest-defined position name first then level name — this is an admin config list, not a large table, so no pagination. */
export async function listJobProfiles(): Promise<JobProfileRow[]> {
  await authorize("maintenance:read");

  return db
    .select({
      id: jobProfile.id,
      positionId: jobProfile.positionId,
      positionName: position.name,
      levelId: jobProfile.levelId,
      levelName: level.name,
      jobDescription: jobProfile.jobDescription,
      jobQualification: jobProfile.jobQualification,
      isActive: jobProfile.isActive,
      createdAt: jobProfile.createdAt,
      updatedAt: jobProfile.updatedAt,
    })
    .from(jobProfile)
    .innerJoin(position, eq(jobProfile.positionId, position.id))
    .innerJoin(level, eq(jobProfile.levelId, level.id))
    .orderBy(asc(position.name), asc(level.name));
}
