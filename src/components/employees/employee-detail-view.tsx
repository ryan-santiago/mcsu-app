"use client";

import { useQuery } from "@tanstack/react-query";
import { Link as LinkIcon, RotateCcw, UserX } from "lucide-react";
import Link from "next/link";

import { DeploymentHistoryTable } from "@/components/employees/deployment-history-table";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmploymentHistoryTable } from "@/components/employees/employment-history-table";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchEmployee } from "@/server/employees/actions";
import { employeeQueryKey } from "@/server/employees/query-key";
import type { EmployeeDetail } from "@/server/employees/types";

type EmployeeDetailViewProps = {
  employeeId: string;
  canUpdate: boolean;
  canDelete: boolean;
  canViewSalary: boolean;
  /** True when this is the signed-in user's own linked Employee record. */
  isSelf: boolean;
};

export function EmployeeDetailView({
  employeeId,
  canUpdate,
  canDelete,
  canViewSalary,
  isSelf,
}: EmployeeDetailViewProps) {
  const { data, isPending, isError, refetch } = useQuery<EmployeeDetail | null>({
    queryKey: employeeQueryKey(employeeId),
    queryFn: () => fetchEmployee(employeeId),
  });

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between gap-4 rounded-lg border p-4">
        <p className="text-destructive text-sm">Could not load this employee.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw className="size-4" aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={UserX} title="Employee not found" description="This record may have been removed." />;
  }

  return (
    <div className="space-y-6">
      {isSelf && !canUpdate ? (
        <Alert>
          <LinkIcon aria-hidden />
          <AlertTitle>This is your own record</AlertTitle>
          <AlertDescription>
            Edits to your own profile go through approval instead.{" "}
            <Link href="/admin/settings">Request a change from Settings &amp; Profile</Link>.
          </AlertDescription>
        </Alert>
      ) : null}
      <EmployeeForm mode="edit" employeeId={employeeId} initialData={data} readOnly={!canUpdate} />
      <EmploymentHistoryTable
        employeeId={employeeId}
        records={data.employments}
        canEdit={canUpdate}
        canDelete={canDelete}
        canViewSalary={canViewSalary}
      />
      <DeploymentHistoryTable
        employeeId={employeeId}
        records={data.deployments}
        canEdit={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
