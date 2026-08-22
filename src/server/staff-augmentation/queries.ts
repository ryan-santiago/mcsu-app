import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { staffAugmentationEngagement } from "@/db/schema";
import { authorize } from "@/lib/session";

export type StaffAugmentationEngagementRow = {
  id: string;
  name: string;
};

/** Visibility is pure RBAC — anyone holding `staff_augmentation:read` sees every item. */
export async function listStaffAugmentationEngagements(): Promise<StaffAugmentationEngagementRow[]> {
  await authorize("staff_augmentation:read");

  return db
    .select({ id: staffAugmentationEngagement.id, name: staffAugmentationEngagement.name })
    .from(staffAugmentationEngagement)
    .orderBy(asc(staffAugmentationEngagement.name));
}

export async function getStaffAugmentationEngagementById(
  id: string,
): Promise<StaffAugmentationEngagementRow | null> {
  await authorize("staff_augmentation:read");

  const [row] = await db
    .select({ id: staffAugmentationEngagement.id, name: staffAugmentationEngagement.name })
    .from(staffAugmentationEngagement)
    .where(eq(staffAugmentationEngagement.id, id))
    .limit(1);

  return row ?? null;
}
