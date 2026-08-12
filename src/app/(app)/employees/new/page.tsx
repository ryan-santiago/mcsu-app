import type { Metadata } from "next";

import { EmployeeForm } from "@/components/employees/employee-form";
import { PageHeader } from "@/components/layout/page-header";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add employee",
};

export default async function NewEmployeePage() {
  await requirePermission("employees:create");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Add employee"
        description="Save the profile first — employment and deployment history can be added once the record exists."
      />

      <EmployeeForm mode="create" />
    </div>
  );
}
