import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";

import { EmployeesView } from "@/components/employees/employees-view";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listEmployees } from "@/server/employees/queries";
import { employeesQueryKey } from "@/server/employees/query-key";
import type { EmployeeFilters } from "@/server/employees/types";

export const metadata: Metadata = {
  title: "Employees",
};

export default async function EmployeesPage() {
  const actor = await requirePermission("employees:read");

  const initialFilters: EmployeeFilters = {};

  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: employeesQueryKey(initialFilters),
    queryFn: () => listEmployees(initialFilters),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Employees"
        description="The MCSU staff directory — profiles, current roles and deployments."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <EmployeesView
          initialFilters={initialFilters}
          canCreate={can(actor, "employees:write")}
          canDelete={can(actor, "employees:delete")}
        />
      </HydrationBoundary>
    </div>
  );
}
