import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Intentionally empty for now — the metric cards, charts and activity feed land
 * in a later milestone (docs/ROADMAP.md). The permission guard and page frame
 * are wired up so adding content is the only work left.
 */
export default async function DashboardPage() {
  const user = await requirePermission("dashboard:read");
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Managed Cloud Services Unit — Questronix Corporation."
      />

      <EmptyState
        icon={LayoutDashboard}
        title="Your dashboard is being built"
        description="Service health, ticket volume and team activity will appear here. Nothing to show yet."
      />
    </div>
  );
}
