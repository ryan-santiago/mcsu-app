import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser } from "@/lib/session";
import { getMyEmployeeDetail, getMyPendingChangeRequest } from "@/server/settings/queries";
import { myPendingRequestQueryKey, myProfileQueryKey } from "@/server/settings/query-key";

export const metadata: Metadata = {
  title: "Settings & Profile",
};

/** No `requirePermission()` — every active signed-in user reaches their own profile. */
export default async function SettingsPage() {
  await requireUser();

  const queryClient = new QueryClient();
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: myProfileQueryKey, queryFn: () => getMyEmployeeDetail() }),
    queryClient.prefetchQuery({ queryKey: myPendingRequestQueryKey, queryFn: () => getMyPendingChangeRequest() }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title="Settings & Profile" description="Your account, password and HR profile." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <SettingsView />
      </HydrationBoundary>
    </div>
  );
}
