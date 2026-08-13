"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { PhAddressPicker } from "@/components/employees/ph-address-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ADDRESS_FIELD_KEYS, type AddressInput } from "@/lib/validation/ph";
import { selfServiceFormSchema, type SelfServiceFormInput } from "@/lib/validation/employee";
import { fetchLookupOptions } from "@/server/employees/actions";
import { submitProfileChangeRequest } from "@/server/settings/actions";
import { myPendingRequestQueryKey, myProfileQueryKey } from "@/server/settings/query-key";
import type { EmployeeDetail } from "@/server/employees/types";

const EMPTY_ADDRESS: AddressInput = {
  regionCode: "",
  regionName: "",
  provinceCode: "",
  provinceName: "",
  cityCode: "",
  cityName: "",
  barangayCode: "",
  barangayName: "",
  addressLine: "",
};

function toAddress(address: EmployeeDetail["currentAddress"]): AddressInput {
  return address
    ? {
        regionCode: address.regionCode,
        regionName: address.regionName,
        provinceCode: address.provinceCode ?? "",
        provinceName: address.provinceName ?? "",
        cityCode: address.cityCode,
        cityName: address.cityName,
        barangayCode: address.barangayCode,
        barangayName: address.barangayName,
        addressLine: address.addressLine,
      }
    : EMPTY_ADDRESS;
}

function toFormValues(employee: EmployeeDetail): SelfServiceFormInput {
  return {
    profile: {
      firstName: employee.firstName,
      middleName: employee.middleName ?? "",
      lastName: employee.lastName,
      genderId: employee.genderId,
      mobileNumber: employee.mobileNumber,
      viberNumber: employee.viberNumber ?? "",
      personalEmail: employee.personalEmail ?? "",
      workEmail: employee.workEmail ?? "",
    },
    currentAddress: toAddress(employee.currentAddress),
    permanentAddress: toAddress(employee.permanentAddress),
  };
}

type SelfProfileFormProps = {
  employee: EmployeeDetail;
  /** True while a change request is already pending review — the form is shown but not editable. */
  readOnly: boolean;
};

export function SelfProfileForm({ employee, readOnly }: SelfProfileFormProps) {
  const queryClient = useQueryClient();
  const [sameAsCurrent, setSameAsCurrent] = React.useState(false);

  const genderOptions = useQuery({
    queryKey: ["employee-lookup-options", "gender"],
    queryFn: () => fetchLookupOptions("gender"),
  });

  const form = useForm<SelfServiceFormInput>({
    resolver: zodResolver(selfServiceFormSchema),
    defaultValues: toFormValues(employee),
  });

  const isSubmitting = form.formState.isSubmitting;
  const fieldDisabled = readOnly || isSubmitting;

  async function onSubmit(values: SelfServiceFormInput) {
    const result = await submitProfileChangeRequest(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: myProfileQueryKey });
    void queryClient.invalidateQueries({ queryKey: myPendingRequestQueryKey });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Changes here go to someone with a higher rank for approval before they take effect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Identity</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="profile.firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.middleName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Middle name <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.genderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {genderOptions.data?.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Contact</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="profile.mobileNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile number</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} placeholder="09171234567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.viberNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Viber number <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} placeholder="09171234567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.personalEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Personal email <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="profile.workEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Current address</h3>
              <PhAddressPicker
                prefix="currentAddress"
                disabled={fieldDisabled}
                mirrorTo={sameAsCurrent ? "permanentAddress" : undefined}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Permanent address</h3>
                {!readOnly ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="self-same-as-current"
                      checked={sameAsCurrent}
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setSameAsCurrent(isChecked);
                        if (isChecked) {
                          const current = form.getValues("currentAddress");
                          for (const key of ADDRESS_FIELD_KEYS) {
                            form.setValue(`permanentAddress.${key}`, current[key], {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                          }
                        }
                      }}
                    />
                    <Label htmlFor="self-same-as-current" className="text-sm font-normal whitespace-nowrap">
                      Same as current address
                    </Label>
                  </div>
                ) : null}
              </div>
              <PhAddressPicker prefix="permanentAddress" disabled={fieldDisabled || sameAsCurrent} />
            </div>

            {!readOnly ? (
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Submit for approval
                </Button>
              </div>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
