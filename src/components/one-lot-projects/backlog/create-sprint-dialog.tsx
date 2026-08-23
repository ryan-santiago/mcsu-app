"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { addWeeks, format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sprintFormSchema, type SprintFormInput } from "@/lib/validation/one-lot-project-backlog";
import type { SprintRow } from "@/server/one-lot-projects/backlog-types";

type DurationValue = "1" | "2" | "3" | "4" | "custom";

type CreateSprintDialogProps = {
  open: boolean;
  sprint?: SprintRow;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SprintFormInput) => void;
};

export function CreateSprintDialog({ open, sprint, pending, onOpenChange, onSubmit }: CreateSprintDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <SprintForm sprint={sprint} pending={pending} onOpenChange={onOpenChange} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SprintForm({
  sprint,
  pending,
  onOpenChange,
  onSubmit,
}: {
  sprint?: SprintRow;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SprintFormInput) => void;
}) {
  const [duration, setDuration] = React.useState<DurationValue>("2");

  const form = useForm<SprintFormInput>({
    resolver: zodResolver(sprintFormSchema),
    defaultValues: {
      name: sprint?.name ?? "",
      itemCode: sprint?.itemCode ?? "",
      startDate: sprint?.startDate ?? "",
      endDate: sprint?.endDate ?? "",
      goal: sprint?.goal ?? "",
    },
  });

  function applyDuration(next: DurationValue, startDate: string) {
    setDuration(next);
    if (next === "custom" || !startDate) return;
    const weeks = Number(next);
    const computed = format(addWeeks(parseISO(startDate), weeks), "yyyy-MM-dd");
    form.setValue("endDate", computed, { shouldValidate: true });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{sprint ? "Edit sprint" : "Create sprint"}</DialogTitle>
        <DialogDescription>
          {sprint
            ? "Update this sprint's details."
            : "Item Code prefixes every work item created in this sprint (e.g. \"SCRUM-1\")."}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sprint name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} placeholder="Sprint 1" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="itemCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Item Code</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} placeholder="SCRUM" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Duration</FormLabel>
            <Select
              value={duration}
              onValueChange={(value) => applyDuration(value as DurationValue, form.getValues("startDate"))}
              disabled={pending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="1">1 week</SelectItem>
                <SelectItem value="2">2 weeks</SelectItem>
                <SelectItem value="3">3 weeks</SelectItem>
                <SelectItem value="4">4 weeks</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        applyDuration(duration, value);
                      }}
                      disabled={pending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={pending || duration !== "custom"} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="goal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sprint goal</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={pending} rows={3} placeholder="What should this sprint accomplish?" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {sprint ? "Update" : "Create sprint"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
