"use client";

import { LayoutGrid, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ViewMode } from "@/hooks/use-view-mode";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { mode: "table", icon: Table2, label: "Table view" },
  { mode: "card", icon: LayoutGrid, label: "Card view" },
] as const;

type ViewToggleProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
};

/** Table/Card switch — same segmented-tab visual language as the status filter tabs in Users/Approvals. */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div role="tablist" aria-label="Switch view" className="bg-muted flex shrink-0 items-center gap-1 rounded-lg p-1">
      {OPTIONS.map(({ mode, icon: Icon, label }) => (
        <Button
          key={mode}
          type="button"
          role="tab"
          aria-selected={value === mode}
          aria-label={label}
          variant="ghost"
          size="icon-lg"
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-md",
            value === mode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}
