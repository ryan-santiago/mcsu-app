import type { UserRole, UserStatus } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** A user row as rendered by User Management. */
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  jobTitle: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export type UserFilters = {
  search?: string;
  status?: UserStatus | "all";
  role?: UserRole | "all";
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
