import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { AccessControlView } from "@/components/roles/access-control-view";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listRoles } from "@/server/roles/queries";
import { rolesQueryKey } from "@/server/roles/query-key";

export const metadata: Metadata = {
  title: "Access Control",
};

export default async function AccessControlPage() {
  const actor = await requirePermission("access_control:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: rolesQueryKey(),
    queryFn: () => listRoles(),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Access Control"
        description="Manage roles and the permissions each one grants across the console."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <AccessControlView
          canWrite={can(actor, "access_control:write")}
          canEdit={can(actor, "access_control:edit")}
          canDelete={can(actor, "access_control:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
