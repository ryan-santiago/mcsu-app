import type { UserStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** A user row as rendered by User Management. */
export type ManagedUser = {
  id: string;
  name: string;
  /** The account name, unless a matching Employee record's name should be shown instead. */
  displayName: string;
  email: string;
  image: string | null;
  roleId: string;
  roleLabel: string;
  rank: number;
  status: UserStatus;
  /** Latest "Level - Position" from the matching Employee record, if any. */
  position: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type UserFilters = {
  search?: string;
  status?: UserStatus | "all";
  role?: string | "all";
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type UserCounts = Record<UserStatus | "all", number>;

export type UserListResult = {
  users: ManagedUser[];
  counts: UserCounts;
  total: number;
  page: number;
  pageSize: number;
};
