import { CheckCircle2 } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import type { CompletedSprintRow } from "@/server/one-lot-projects/backlog-types";

type OneLotProjectCompletedSprintsProps = {
  sprints: CompletedSprintRow[];
};

/** Summary page's history of finished sprints — the Backlog tab only ever shows these tucked below the active/planned ones. */
export function OneLotProjectCompletedSprints({ sprints }: OneLotProjectCompletedSprintsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Completed Sprints{" "}
          <span className="text-muted-foreground font-normal">
            ({sprints.length} sprint{sprints.length === 1 ? "" : "s"})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sprints.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No completed sprints yet"
            description="Finished sprints will be listed here."
          />
        ) : (
          <ul className="divide-y">
            {sprints.map((sprint) => (
              <li key={sprint.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{sprint.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
                    {sprint.completedAt ? ` · Completed ${formatDateTime(sprint.completedAt)}` : ""}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {sprint.doneItemCount}/{sprint.itemCount} done
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
