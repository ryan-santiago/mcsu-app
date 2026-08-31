"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { DeploymentHistoryTable } from "@/components/employees/deployment-history-table";
import { EmploymentHistoryTable } from "@/components/employees/employment-history-table";
import { AvatarUploadForm } from "@/components/settings/avatar-upload-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { SelfProfileForm } from "@/components/settings/self-profile-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActionResult } from "@/lib/action-result";
import { cancelMyChangeRequest, fetchMyEmployeeDetail, fetchMyPendingChangeRequest } from "@/server/settings/actions";
import { myPendingRequestQueryKey, myProfileQueryKey } from "@/server/settings/query-key";
import type { EmployeeDetail } from "@/server/employees/types";
import type { MyPendingChangeRequest } from "@/server/settings/types";

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function PendingRequestBanner({ request }: { request: MyPendingChangeRequest }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cancelMyChangeRequest({ id: request.id }),
    onSuccess: (result: ActionResult) => {
      if (result.ok) {
        toast.success(result.message);
        void queryClient.invalidateQueries({ queryKey: myPendingRequestQueryKey });
        void queryClient.invalidateQueries({ queryKey: myProfileQueryKey });
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  return (
    <Alert>
      <Clock aria-hidden />
      <AlertTitle>Awaiting approval</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Your profile changes below are pending review by someone with a higher rank.</p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground bg-muted/30 text-left text-xs">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {request.changes.map((change) => (
                <tr key={change.field}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{change.label}</td>
                  <td className="text-muted-foreground px-3 py-2">{formatChangeValue(change.oldValue)}</td>
                  <td className="px-3 py-2 font-medium">{formatChangeValue(change.newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          Cancel request
        </Button>
      </AlertDescription>
    </Alert>
  );
}

type SettingsViewProps = {
  user: { image: string | null; displayName: string };
  storageAvailable: boolean;
};

export function SettingsView({ user, storageAvailable }: SettingsViewProps) {
  const employeeQuery = useQuery<EmployeeDetail | null>({
    queryKey: myProfileQueryKey,
    queryFn: () => fetchMyEmployeeDetail(),
  });
  const pendingQuery = useQuery<MyPendingChangeRequest | null>({
    queryKey: myPendingRequestQueryKey,
    queryFn: () => fetchMyPendingChangeRequest(),
  });

  return (
    <div className="space-y-6">
      <AvatarUploadForm user={user} storageAvailable={storageAvailable} />
      <ChangePasswordForm />

      {employeeQuery.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : employeeQuery.isError ? (
        <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-destructive text-sm">Could not load your profile.</p>
          <Button variant="outline" size="sm" onClick={() => void employeeQuery.refetch()}>
            <RotateCcw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      ) : employeeQuery.data ? (
        <>
          {pendingQuery.data ? <PendingRequestBanner request={pendingQuery.data} /> : null}
          <SelfProfileForm employee={employeeQuery.data} readOnly={Boolean(pendingQuery.data)} />
          <EmploymentHistoryTable
            employeeId={employeeQuery.data.id}
            records={employeeQuery.data.employments}
            canEdit={false}
            canDelete={false}
            canViewSalary
          />
          <DeploymentHistoryTable
            employeeId={employeeQuery.data.id}
            records={employeeQuery.data.deployments}
            canEdit={false}
            canDelete={false}
          />
        </>
      ) : null}
    </div>
  );
}
