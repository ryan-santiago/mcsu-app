"use client";

import { Pin } from "lucide-react";

import { cn } from "@/lib/utils";

type PinToggleButtonProps = {
  pinned: boolean;
  onToggle: () => void;
  label: string;
};

/** Keeps a collapsible sidebar section open by default across visits — see `usePinnedNavSections`. Always a sibling of its row's link/trigger, never nested inside one, so a click here never also navigates or toggles the collapsible. */
export function PinToggleButton({ pinned, onToggle, label }: PinToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label} open`}
      title={pinned ? `Unpin ${label}` : `Pin ${label} open`}
      className={cn(
        "shrink-0 rounded-md p-1.5 transition-colors",
        pinned
          ? "text-brand-accent hover:text-brand-accent/80"
          : "text-muted-foreground/40 opacity-0 group-hover/navrow:opacity-100 hover:text-sidebar-accent-foreground",
      )}
    >
      <Pin className={cn("size-3.5", pinned && "fill-current")} aria-hidden />
    </button>
  );
}
