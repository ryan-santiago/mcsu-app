"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createRecommendation, fetchRecommendationEmployeeOptions } from "@/server/employee-recommendations/actions";
import { recommendationEmployeeOptionsQueryKey, recommendationQueueQueryKey } from "@/server/employee-recommendations/query-key";
import type { RecommendationEmployeeOption } from "@/server/employee-recommendations/types";

type NewRecommendationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Manual (`manual_regular`) recommendation — a Manager picks any active
 * employee in their scope directly, for the annual KPI cycle. Recommendations
 * started from the monitoring queue instead skip this dialog entirely (all
 * the data is already known from the queue row) — see
 * `RecommendationQueueView`'s "Start recommendation" button.
 */
export function NewRecommendationDialog({ open, onOpenChange }: NewRecommendationDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const options = useQuery({
    queryKey: recommendationEmployeeOptionsQueryKey(),
    queryFn: () => fetchRecommendationEmployeeOptions(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => createRecommendation({ employeeId: employeeId ?? "", triggerType: "manual_regular" }),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: recommendationQueueQueryKey() });
        onOpenChange(false);
        router.push(`/employee-recommendations/${result.data.id}`);
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const employees = options.data ?? [];
  const query = search.trim().toLowerCase();
  const filtered = query ? employees.filter((e) => e.name.toLowerCase().includes(query)) : employees;
  const selected = employees.find((e) => e.id === employeeId) ?? null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEmployeeId(null);
      setSearch("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Employee Recommendation</DialogTitle>
          <DialogDescription>
            For a Regular employee&apos;s annual KPI cycle. Contract/probationary recommendations are started from
            the monitoring queue instead.
          </DialogDescription>
        </DialogHeader>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-full justify-between font-normal">
              {selected ? (
                <span className="truncate">{selected.name}</span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-2">
                  <UserRound className="size-4" aria-hidden />
                  Select an employee
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
              {options.isPending ? (
                <p className="text-muted-foreground p-3 text-sm">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">No matching employees.</p>
              ) : (
                filtered.map((employee: RecommendationEmployeeOption) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => {
                      setEmployeeId(employee.id);
                      setPickerOpen(false);
                      setSearch("");
                    }}
                    className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors"
                  >
                    <div className="flex flex-1 flex-col">
                      <span className="truncate">{employee.name}</span>
                      {employee.levelPositionLabel ? (
                        <span className="text-muted-foreground text-xs">{employee.levelPositionLabel}</span>
                      ) : null}
                    </div>
                    {employeeId === employee.id ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button disabled={!employeeId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Start recommendation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
