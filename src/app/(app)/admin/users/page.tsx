import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { UsersView } from "@/components/users/users-view";
import { requirePermission } from "@/lib/session";
import { listRoleOptions } from "@/server/roles/queries";
import { listUsers } from "@/server/users/queries";
import { usersQueryKey } from "@/server/users/query-key";
import type { UserFilters } from "@/server/users/types";

export const metadata: Metadata = {
  title: "User Management",
};

/**
 * Server-renders the first page of results and hands them to TanStack Query via
 * `HydrationBoundary`, so the table is populated in the initial HTML and the
 * client never shows a loading skeleton on first paint. Subsequent filtering
 * and every mutation happen on the client against the same cache.
 */
export default async function UserManagementPage() {
  const actor = await requirePermission("users:read");

  const initialFilters: UserFilters = { status: "all", role: "all" };

  const queryClient = new QueryClient();
  const [, roles] = await Promise.all([
    queryClient.prefetchQuery({
      queryKey: usersQueryKey(initialFilters),
      queryFn: () => listUsers(initialFilters),
    }),
    listRoleOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="User Management"
        description="Approve access requests, assign roles and manage who can sign in to the MCSU console."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <UsersView
          actor={{
            id: actor.id,
            status: actor.status,
            roleId: actor.roleId,
            rank: actor.rank,
            permissions: actor.permissions,
          }}
          roles={roles}
          initialFilters={initialFilters}
        />
      </HydrationBoundary>
    </div>
  );
}
