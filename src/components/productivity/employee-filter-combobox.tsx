"use client";

import { Check, ChevronsUpDown, Search, UserRound } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EmployeeOption } from "@/server/employees/types";

type EmployeeFilterComboboxProps = {
  options: EmployeeOption[];
  /** `null` = "All employees". */
  value: string | null;
  onChange: (employeeId: string | null) => void;
  loading?: boolean;
};

/**
 * A search-and-pick employee filter, structurally the same Popover+search+
 * list pattern as `NewRecommendationDialog`'s employee picker
 * (`src/components/employee-recommendations/new-recommendation-dialog.tsx`),
 * generalized into a reusable filter component — shared by Activity Report
 * and Certifications monitoring instead of duplicating the block twice.
 */
export function EmployeeFilterCombobox({ options, value, onChange, loading }: EmployeeFilterComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const query = search.trim().toLowerCase();
  const filtered = query ? options.filter((option) => option.name.toLowerCase().includes(query)) : options;
  const selected = options.find((option) => option.id === value) ?? null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal sm:w-56">
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <UserRound className="size-4" aria-hidden />
              All employees
            </span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-72 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              autoFocus
              placeholder="Search employee"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 pl-8"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setSearch("");
            }}
            className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
          >
            <span className="text-muted-foreground flex-1">All employees</span>
            {value === null ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          </button>

          {loading ? (
            <p className="text-muted-foreground p-3 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No matching employees.</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setSearch("");
                }}
                className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
              >
                <div className="flex flex-1 flex-col">
                  <span className="truncate">{option.name}</span>
                  {option.teamName ? <span className="text-muted-foreground text-xs">{option.teamName}</span> : null}
                </div>
                {value === option.id ? <Check className="size-4 shrink-0" aria-hidden /> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
