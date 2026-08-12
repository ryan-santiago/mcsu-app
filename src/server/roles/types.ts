import type { ActionResult } from "@/lib/action-result";
import type { Permission, RoleOption } from "@/lib/rbac";

export type { ActionResult, RoleOption };

/** A role row as rendered by Access Control, with its full permission set and how many users hold it. */
export type Role = RoleOption & {
  permissions: Permission[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
};
