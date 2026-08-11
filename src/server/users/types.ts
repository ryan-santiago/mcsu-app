import type { UserRole, UserStatus } from "@/db/schema";

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
};

export type UserCounts = Record<UserStatus | "all", number>;

export type UserListResult = {
  users: ManagedUser[];
  counts: UserCounts;
};

/** Uniform result shape for every user mutation, so the UI has one thing to handle. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message: string }
  | { ok: false; error: string };
