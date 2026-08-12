"use client";

import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  /** ISO `yyyy-MM-dd`, matching the `date` columns this feeds. */
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Single-date Popover+Calendar wrapper — the same composition as
 * `DateRangePicker`, but for one date instead of a range.
 */
export function DatePicker({ value, onChange, placeholder = "Select date", disabled, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start gap-2 font-normal", className)}
        >
          <CalendarIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{selected ? format(selected, "d MMM yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
