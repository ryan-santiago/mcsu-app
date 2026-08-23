"use client";

import { Check, ChevronsUpDown, Search, UserRound } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OneLotProjectMemberRow } from "@/server/one-lot-projects/types";

type AssigneePickerProps = {
  members: OneLotProjectMemberRow[];
  value: string | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Client-side filter over the project's already-loaded member roster — not a
 * server search like `OneLotProjectS3pLinkPicker`, since assignees are
 * scoped to a small, already-fetched member list, not the whole company.
 */
export function AssigneePicker({ members, value, onChange, disabled, className }: AssigneePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = members.find((m) => m.userId === value) ?? null;
  const query = search.trim().toLowerCase();
  const filtered = query ? members.filter((m) => m.name.toLowerCase().includes(query)) : members;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar size="sm">
                <AvatarImage src={selected.image ?? undefined} alt="" />
                <AvatarFallback>{initialsOf(selected.name)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <UserRound className="size-4" aria-hidden />
              Unassigned
            </span>
          )}
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              autoFocus
              placeholder="Search member"
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
            <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate">Unassigned</span>
            {!value ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          </button>
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                onChange(member.userId);
                setOpen(false);
                setSearch("");
              }}
              className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
            >
              <Avatar size="sm">
                <AvatarImage src={member.image ?? undefined} alt="" />
                <AvatarFallback>{initialsOf(member.name)}</AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{member.name}</span>
              {value === member.userId ? <Check className="size-4 shrink-0" aria-hidden /> : null}
            </button>
          ))}
          {filtered.length === 0 ? <p className="text-muted-foreground p-3 text-sm">No matching members.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
