"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEVICE_STATUS_LABELS, DEVICE_TYPE_LABELS } from "@/lib/device-format";
import { deviceFormSchema, type DeviceFormInput } from "@/lib/validation/device";
import { createDevice, updateDevice } from "@/server/devices/actions";
import type { DeviceDetail } from "@/server/devices/types";

const DEVICE_TYPE_OPTIONS = Object.entries(DEVICE_TYPE_LABELS) as [DeviceFormInput["deviceType"], string][];
const DEVICE_STATUS_OPTIONS = Object.entries(DEVICE_STATUS_LABELS) as [DeviceFormInput["status"], string][];

function toFormValues(detail: DeviceDetail | undefined): DeviceFormInput {
  if (!detail) {
    return {
      deviceType: "laptop",
      brand: "",
      model: "",
      os: "",
      serialNumber: "",
      purchaseDate: "",
      status: "available",
      remarks: "",
    };
  }

  return {
    deviceType: detail.deviceType,
    brand: detail.brand,
    model: detail.model,
    os: detail.os,
    serialNumber: detail.serialNumber,
    purchaseDate: detail.purchaseDate,
    status: detail.status,
    remarks: detail.remarks ?? "",
  };
}

type DeviceFormProps =
  | { mode: "create"; readOnly?: false }
  | { mode: "edit"; deviceId: string; initialData: DeviceDetail; readOnly: boolean };

export function DeviceForm(props: DeviceFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<DeviceFormInput>({
    resolver: zodResolver(deviceFormSchema),
    defaultValues: toFormValues(props.mode === "edit" ? props.initialData : undefined),
  });

  const readOnly = props.mode === "edit" && props.readOnly;
  const isSubmitting = form.formState.isSubmitting;
  const fieldDisabled = readOnly || isSubmitting;

  async function onSubmit(values: DeviceFormInput) {
    if (props.mode === "create") {
      const result = await createDevice(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      router.push(`/admin/devices/${result.data.id}`);
      return;
    }

    const result = await updateDevice({ id: props.deviceId, ...values });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="deviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEVICE_TYPE_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEVICE_STATUS_OPTIONS.map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
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
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} placeholder="Dell, Apple, Samsung..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} placeholder="Latitude 5440, iPhone 13..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="os"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OS</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} placeholder="Windows 11, iOS 18..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="serialNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial number</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={fieldDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase date</FormLabel>
                  <DatePicker value={field.value} onChange={field.onChange} disabled={fieldDisabled} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Remarks <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={fieldDisabled} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {!readOnly ? (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {props.mode === "create" ? "Add device" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
