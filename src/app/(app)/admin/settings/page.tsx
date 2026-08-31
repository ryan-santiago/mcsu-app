import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";
import { isDocumentStorageAvailable } from "@/lib/document-storage";
import { requireUser } from "@/lib/session";
import { getMyEmployeeDetail, getMyPendingChangeRequest } from "@/server/settings/queries";
import { myPendingRequestQueryKey, myProfileQueryKey } from "@/server/settings/query-key";

export const metadata: Metadata = {
  title: "Settings & Profile",
};

/** No `requirePermission()` — every active signed-in user reaches their own profile. */
export default async function SettingsPage() {
  const currentUser = await requireUser();

  const queryClient = new QueryClient();
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: myProfileQueryKey, queryFn: () => getMyEmployeeDetail() }),
    queryClient.prefetchQuery({ queryKey: myPendingRequestQueryKey, queryFn: () => getMyPendingChangeRequest() }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title="Settings & Profile" description="Your account, password and HR profile." />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <SettingsView
          user={{ image: currentUser.image, displayName: currentUser.displayName }}
          storageAvailable={isDocumentStorageAvailable()}
        />
      </HydrationBoundary>
    </div>
  );
}
