import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initialsOf } from "@/lib/format";
import type { WorkloadRow } from "@/server/one-lot-projects/backlog-types";

import { DistributionBarRow } from "./distribution-bar-row";

type OneLotProjectTeamWorkloadProps = {
  workload: WorkloadRow[];
};

/** Weighted by item count (not story points, which are optional per item and would leave this mostly empty early on). */
export function OneLotProjectTeamWorkload({ workload }: OneLotProjectTeamWorkloadProps) {
  const total = workload.reduce((sum, row) => sum + row.count, 0);
  const rows = total === 0 ? [{ assigneeId: null, name: "Unassigned", image: null, count: 0 }] : workload;
  const max = Math.max(1, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Workload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const pct = total === 0 ? 100 : Math.round((row.count / max) * 100);
          return (
            <DistributionBarRow
              key={row.assigneeId ?? "unassigned"}
              labelWidthClassName="w-40"
              label={
                <span className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarImage src={row.image ?? undefined} alt="" />
                    <AvatarFallback>{row.name === "Unassigned" ? "—" : initialsOf(row.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{row.name}</span>
                </span>
              }
              value={row.count}
              pct={pct}
              barClassName="bg-muted-foreground/40"
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
