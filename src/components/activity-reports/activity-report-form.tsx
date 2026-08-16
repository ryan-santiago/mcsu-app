"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACTIVITY_REPORT_STATUS_LABELS } from "@/lib/activity-report-format";
import {
  activityReportFormSchema,
  activityReportStatusValues,
  type ActivityReportFormInput,
} from "@/lib/validation/activity-report";
import {
  createMyActivityReport,
  updateMyActivityReport,
} from "@/server/activity-reports/actions";
import type { ActivityReportDetail } from "@/server/activity-reports/types";

const BLANK_ITEM = {
  activityCode: "",
  activityName: "",
  description: "",
  issueBlockers: "",
};

function toFormValues(
  detail: ActivityReportDetail | undefined,
): ActivityReportFormInput {
  if (!detail) {
    return {
      date: "",
      status: "present",
      timeIn: "",
      timeOut: "",
      otHours: "0",
      items: [BLANK_ITEM],
    };
  }

  return {
    date: detail.date,
    status: detail.status,
    timeIn: detail.timeIn ?? "",
    timeOut: detail.timeOut ?? "",
    otHours: detail.otHours ?? "0",
    items:
      detail.status === "on_leave"
        ? []
        : detail.items.length > 0
          ? detail.items.map((item) => ({
              activityCode: item.activityCode,
              activityName: item.activityName,
              description: item.description,
              issueBlockers: item.issueBlockers ?? "",
            }))
          : [BLANK_ITEM],
  };
}

type ActivityReportFormProps =
  | { mode: "create" }
  | { mode: "edit"; reportId: string; initialData: ActivityReportDetail };

export function ActivityReportForm(props: ActivityReportFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<ActivityReportFormInput>({
    resolver: zodResolver(activityReportFormSchema),
    defaultValues: toFormValues(
      props.mode === "edit" ? props.initialData : undefined,
    ),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const isSubmitting = form.formState.isSubmitting;
  const status = useWatch({ control: form.control, name: "status" });
  const isOnLeave = status === "on_leave";

  function handleStatusChange(value: ActivityReportFormInput["status"]) {
    form.setValue("status", value);
    if (value === "on_leave") {
      form.setValue("timeIn", "");
      form.setValue("timeOut", "");
      form.setValue("otHours", "");
      form.setValue("items", []);
    } else if (form.getValues("items").length === 0) {
      form.setValue("items", [BLANK_ITEM]);
    }
  }

  async function onSubmit(values: ActivityReportFormInput) {
    if (props.mode === "create") {
      const result = await createMyActivityReport(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["activity-reports"] });
      router.push(`/activity-reports/${result.data.id}`);
      return;
    }

    const result = await updateMyActivityReport({
      id: props.reportId,
      ...values,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["activity-reports"] });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={handleStatusChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activityReportStatusValues.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ACTIVITY_REPORT_STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timeIn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time in</FormLabel>
                  <FormControl>
                    <Input {...field} type="time" disabled={isSubmitting || isOnLeave} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timeOut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time out</FormLabel>
                  <FormControl>
                    <Input {...field} type="time" disabled={isSubmitting || isOnLeave} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="otHours"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>OT hours</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isSubmitting || isOnLeave}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {isOnLeave ? (
          <p className="text-muted-foreground text-sm">
            Activities aren&apos;t required for an on-leave day.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Activities</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => append(BLANK_ITEM)}
              >
                <Plus className="size-4" aria-hidden />
                Add activity
              </Button>
            </div>

            {form.formState.errors.items?.root ? (
              <p className="text-destructive text-sm">
                {form.formState.errors.items.root.message}
              </p>
            ) : null}

            {fields.map((item, index) => (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm">Activity {index + 1}</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isSubmitting || fields.length === 1}
                    aria-label={`Remove activity ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.activityCode`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Activity ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              disabled={isSubmitting}
                              placeholder="TASK-001 or N/A"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`items.${index}.activityName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Activity name</FormLabel>
                          <FormControl>
                            <Input {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`items.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} disabled={isSubmitting} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`items.${index}.issueBlockers`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Issue / blockers{" "}
                          <span className="text-muted-foreground font-normal">
                            (optional)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea {...field} disabled={isSubmitting} rows={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {props.mode === "create" ? "Add report" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
