import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmployeeDetailView } from "@/components/employees/employee-detail-view";
import { PageHeader } from "@/components/layout/page-header";
import { formatEmployeeName } from "@/lib/employee-format";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getEmployeeById } from "@/server/employees/queries";
import { employeeQueryKey } from "@/server/employees/query-key";

type EmployeeDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: EmployeeDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const employee = await getEmployeeById(id);
  return { title: employee ? formatEmployeeName(employee) : "Employee" };
}

export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const actor = await requirePermission("employees:read");
  const { id } = await params;

  const queryClient = new QueryClient();
  const employee = await queryClient.fetchQuery({
    queryKey: employeeQueryKey(id),
    queryFn: () => getEmployeeById(id),
  });

  if (!employee) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="View / Edit Employee"
        description="Update this employee's profile, employment and deployment history."
      />

      <HydrationBoundary state={dehydrate(queryClient)}>
        <EmployeeDetailView
          employeeId={id}
          canUpdate={can(actor, "employees:update")}
          canDelete={can(actor, "employees:delete")}
          canViewSalary={can(actor, "employees:read_salary")}
        />
      </HydrationBoundary>
    </div>
  );
}
