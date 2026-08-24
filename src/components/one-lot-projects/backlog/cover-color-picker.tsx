"use client";

import { ImageOff, Palette } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WORK_ITEM_COVER_COLORS } from "@/lib/one-lot-project-backlog-format";
import { cn } from "@/lib/utils";
import { workItemCoverColorValues, type WorkItemCoverColorValue } from "@/lib/validation/one-lot-project-backlog";

type CoverColorPickerProps = {
  value: WorkItemCoverColorValue | null;
  onChange: (color: WorkItemCoverColorValue | null) => void;
  disabled?: boolean;
};

/** Task/Bug only — mirrors JIRA's "Select a cover" popover, but colors only (no photo tabs). */
export function CoverColorPicker({ value, onChange, disabled }: CoverColorPickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          {value ? (
            <span
              className="size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: WORK_ITEM_COVER_COLORS[value].value }}
              aria-hidden
            />
          ) : (
            <Palette className="size-3.5" aria-hidden />
          )}
          {value ? "Change cover" : "Add cover"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-3 p-3" align="start">
        <p className="text-muted-foreground text-xs font-medium">Colors</p>
        <div className="grid grid-cols-5 gap-2">
          {workItemCoverColorValues.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={WORK_ITEM_COVER_COLORS[color].label}
              aria-pressed={value === color}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className={cn(
                "ring-offset-popover size-7 rounded-md transition-shadow",
                value === color ? "ring-ring ring-2 ring-offset-2" : "hover:opacity-80",
              )}
              style={{ backgroundColor: WORK_ITEM_COVER_COLORS[color].value }}
            />
          ))}
        </div>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <ImageOff className="size-3.5" aria-hidden />
            Remove cover
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
