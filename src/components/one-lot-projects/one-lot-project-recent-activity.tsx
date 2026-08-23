import { History } from "lucide-react";

import { ActionBadge } from "@/components/audit/audit-badges";
import { EmptyState } from "@/components/layout/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditChange } from "@/db/schema";
import { formatDateTime, formatRelative, initialsOf } from "@/lib/format";
import type { AuditEntry } from "@/server/audit/types";

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.join(", ");
  return String(value);
}

function summarize(changes: AuditChange[] | null): string | null {
  if (!changes || changes.length === 0) return null;
  if (changes.length === 1) {
    const c = changes[0];
    return `${c.label}: ${formatChangeValue(c.oldValue)} → ${formatChangeValue(c.newValue)}`;
  }
  return `${changes.length} fields changed`;
}

type OneLotProjectRecentActivityProps = {
  activity: AuditEntry[];
};

/** Real data — this project's own slice of the Audit Trail, so a Summary viewer without Audit Trail access still sees what changed. */
export function OneLotProjectRecentActivity({ activity }: OneLotProjectRecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" description="Changes to this project will show up here." />
        ) : (
          <ul className="space-y-4">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3">
                <Avatar size="sm" className="mt-0.5">
                  <AvatarFallback>{entry.actorName ? initialsOf(entry.actorName) : "SY"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{entry.actorName ?? "System"}</span>
                    <ActionBadge action={entry.action} />
                  </div>
                  {summarize(entry.changes) ? (
                    <p className="text-muted-foreground truncate text-xs">{summarize(entry.changes)}</p>
                  ) : null}
                  <p className="text-muted-foreground text-xs" title={formatDateTime(entry.createdAt)}>
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
