import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { AnnouncementsView } from "@/components/announcements/announcements-view";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listAnnouncements } from "@/server/announcements/queries";
import { announcementsQueryKey } from "@/server/announcements/query-key";

export const metadata: Metadata = {
  title: "Announcements",
};

export default async function AnnouncementsPage() {
  const actor = await requirePermission("announcements:read");

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: announcementsQueryKey(),
    queryFn: () => listAnnouncements(),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Announcements"
        description="Company news and activity updates for everyone in the unit."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <AnnouncementsView
          canWrite={can(actor, "announcements:write")}
          canEdit={can(actor, "announcements:edit")}
          canDelete={can(actor, "announcements:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
