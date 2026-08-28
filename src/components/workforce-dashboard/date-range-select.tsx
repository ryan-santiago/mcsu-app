"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/date-range-presets";

type DateRangeSelectProps = {
  value: DateRangePreset;
  onChange: (value: DateRangePreset) => void;
  disabled?: boolean;
};

export function DateRangeSelect({ value, onChange, disabled }: DateRangeSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as DateRangePreset)} disabled={disabled}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATE_RANGE_PRESETS.map((preset) => (
          <SelectItem key={preset} value={preset}>
            {DATE_RANGE_PRESET_LABELS[preset]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
