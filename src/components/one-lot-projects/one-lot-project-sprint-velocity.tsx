import { TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompletedSprintRow } from "@/server/one-lot-projects/backlog-types";

import { DistributionBarRow } from "./distribution-bar-row";

type OneLotProjectSprintVelocityProps = {
  sprints: CompletedSprintRow[];
};

/** Story points delivered per completed sprint — same rows as the Completed Sprints card, so the two stay in sync. */
export function OneLotProjectSprintVelocity({ sprints }: OneLotProjectSprintVelocityProps) {
  const max = Math.max(1, ...sprints.map((s) => s.storyPoints));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sprint Velocity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sprints.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No completed sprints yet"
            description="Velocity appears once a sprint finishes."
          />
        ) : (
          sprints.map((sprint) => (
            <DistributionBarRow
              key={sprint.id}
              label={sprint.name}
              value={sprint.storyPoints}
              pct={(sprint.storyPoints / max) * 100}
              barClassName="bg-chart-1"
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
