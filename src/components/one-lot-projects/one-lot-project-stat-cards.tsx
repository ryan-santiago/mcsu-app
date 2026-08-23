"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_OPTIONS, type PeriodValue } from "@/lib/one-lot-project-backlog-format";
import type { StatCardsData } from "@/server/one-lot-projects/backlog-types";

function StatCard({
  label,
  value,
  period,
  onPeriodChange,
}: {
  label: string;
  value: number;
  period?: PeriodValue;
  onPeriodChange?: (value: PeriodValue) => void;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{label}</p>
          {period && onPeriodChange ? (
            <Select value={period} onValueChange={(value) => onPeriodChange(value as PeriodValue)}>
              <SelectTrigger size="sm" className="h-6 w-auto gap-1 border-none px-1.5 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function OneLotProjectStatCards({ data }: { data: StatCardsData }) {
  const [updatedPeriod, setUpdatedPeriod] = React.useState<PeriodValue>("7d");
  const [createdPeriod, setCreatedPeriod] = React.useState<PeriodValue>("7d");

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Completed" value={data.completed} />
      <StatCard
        label="Updated"
        value={data.updated[updatedPeriod]}
        period={updatedPeriod}
        onPeriodChange={setUpdatedPeriod}
      />
      <StatCard
        label="Created"
        value={data.created[createdPeriod]}
        period={createdPeriod}
        onPeriodChange={setCreatedPeriod}
      />
      <StatCard label="Due Soon" value={data.dueSoon} />
    </div>
  );
}
