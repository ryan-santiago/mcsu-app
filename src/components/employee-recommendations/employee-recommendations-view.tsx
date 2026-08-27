"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NewRecommendationDialog } from "./new-recommendation-dialog";
import { PendingApprovalsView } from "./pending-approvals-view";
import { RecommendationQueueView } from "./recommendation-queue-view";
import { RecommendationsInProgressView } from "./recommendations-in-progress-view";

const TABS = [
  { value: "queue", label: "Needs recommendation" },
  { value: "in-progress", label: "In progress" },
  { value: "pending-approval", label: "Needs your approval" },
] as const;

type Tab = (typeof TABS)[number]["value"];

type EmployeeRecommendationsViewProps = {
  canCreate: boolean;
  canApprove: boolean;
};

export function EmployeeRecommendationsView({ canCreate, canApprove }: EmployeeRecommendationsViewProps) {
  const [tab, setTab] = React.useState<Tab>("queue");
  const [newOpen, setNewOpen] = React.useState(false);

  const visibleTabs = canApprove ? TABS : TABS.filter((option) => option.value !== "pending-approval");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Employee Recommendation views"
          className="bg-muted flex w-full gap-1 overflow-x-auto rounded-lg p-1 sm:w-auto"
        >
          {visibleTabs.map((option) => {
            const active = tab === option.value;
            return (
              <button
                key={option.value}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(option.value)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {canCreate ? (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New Recommendation
          </Button>
        ) : null}
      </div>

      {tab === "queue" ? (
        <RecommendationQueueView />
      ) : tab === "in-progress" ? (
        <RecommendationsInProgressView />
      ) : (
        <PendingApprovalsView />
      )}

      <NewRecommendationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
