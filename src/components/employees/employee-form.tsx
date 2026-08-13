"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, CircleCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";

import { PhAddressPicker } from "@/components/employees/ph-address-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADDRESS_FIELD_KEYS, type AddressInput } from "@/lib/validation/ph";
import { employeeFormSchema, type EmployeeFormInput } from "@/lib/validation/employee";
import { createEmployee, fetchLookupOptions, updateEmployee } from "@/server/employees/actions";
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

function toFormValues(detail: EmployeeDetail | undefined): EmployeeFormInput {
  if (!detail) {
    return {
      profile: {
        code: "",
        firstName: "",
        middleName: "",
        lastName: "",
        genderId: "",
        mobileNumber: "",
        viberNumber: "",
        personalEmail: "",
        workEmail: "",
        teamId: "",
        resignationDate: "",
      },
      currentAddress: EMPTY_ADDRESS,
      permanentAddress: EMPTY_ADDRESS,
    };
  }

  const toAddress = (address: EmployeeDetail["currentAddress"]): AddressInput =>
    address
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

  return {
    profile: {
      code: detail.code,
      firstName: detail.firstName,
      middleName: detail.middleName ?? "",
      lastName: detail.lastName,
      genderId: detail.genderId,
      mobileNumber: detail.mobileNumber,
      viberNumber: detail.viberNumber ?? "",
      personalEmail: detail.personalEmail ?? "",
      workEmail: detail.workEmail ?? "",
      teamId: detail.teamId ?? "",
      resignationDate: detail.resignationDate ?? "",
    },
    currentAddress: toAddress(detail.currentAddress),
    permanentAddress: toAddress(detail.permanentAddress),
  };
}

type TabKey = "identity" | "contact" | "currentAddress" | "permanentAddress";

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: "identity", label: "Identity", description: "The employee's code, legal name and team." },
  { key: "contact", label: "Contact", description: "How to reach this employee." },
  { key: "currentAddress", label: "Current Address", description: "Where the employee lives today." },
  { key: "permanentAddress", label: "Permanent Address", description: "Used for records that require a fixed home address." },
];

/** Which profile sub-fields belong to which tab, for jumping to the right one on a failed submit. */
const IDENTITY_FIELDS = ["code", "firstName", "middleName", "lastName", "genderId", "teamId"] as const;

type EmployeeFormProps =
  | { mode: "create"; readOnly?: false }
  | { mode: "edit"; employeeId: string; initialData: EmployeeDetail; readOnly: boolean };

export function EmployeeForm(props: EmployeeFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sameAsCurrent, setSameAsCurrent] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabKey>("identity");

  const genderOptions = useQuery({
    queryKey: ["employee-lookup-options", "gender"],
    queryFn: () => fetchLookupOptions("gender"),
  });
  const teamOptions = useQuery({
    queryKey: ["employee-lookup-options", "team"],
    queryFn: () => fetchLookupOptions("team"),
  });

  const form = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: toFormValues(props.mode === "edit" ? props.initialData : undefined),
  });

  const readOnly = props.mode === "edit" && props.readOnly;
  const isSubmitting = form.formState.isSubmitting;

  // Existing records are already complete by definition — only a brand-new,
  // in-progress "Add employee" form shows partial completion per tab.
  const forceAllComplete = props.mode === "edit";
  const watched = useWatch({ control: form.control });
  const completion: Record<TabKey, boolean> = {
    identity: Boolean(
      watched.profile?.code &&
        watched.profile?.firstName &&
        watched.profile?.lastName &&
        watched.profile?.genderId &&
        watched.profile?.teamId,
    ),
    contact: Boolean(watched.profile?.mobileNumber),
    currentAddress: Boolean(
      watched.currentAddress?.regionCode &&
        watched.currentAddress?.cityCode &&
        watched.currentAddress?.barangayCode &&
        watched.currentAddress?.addressLine,
    ),
    permanentAddress: Boolean(
      watched.permanentAddress?.regionCode &&
        watched.permanentAddress?.cityCode &&
        watched.permanentAddress?.barangayCode &&
        watched.permanentAddress?.addressLine,
    ),
  };

  async function onSubmit(values: EmployeeFormInput) {
    if (props.mode === "create") {
      const result = await createEmployee(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      router.push(`/employees/${result.data.id}`);
      return;
    }

    const result = await updateEmployee({ id: props.employeeId, ...values });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    void queryClient.invalidateQueries({ queryKey: ["employees"] });
  }

  // Fields on a tab that isn't active stay registered (and validated) — RHF
  // doesn't unregister on unmount by default — but their errors are invisible
  // until we jump there. Otherwise a failed submit could look like it did
  // nothing at all.
  function onInvalid(errors: FieldErrors<EmployeeFormInput>) {
    if (errors.profile) {
      const hasIdentityError = IDENTITY_FIELDS.some((field) => errors.profile?.[field]);
      setActiveTab(hasIdentityError ? "identity" : "contact");
      return;
    }
    if (errors.currentAddress) {
      setActiveTab("currentAddress");
      return;
    }
    if (errors.permanentAddress) setActiveTab("permanentAddress");
  }

  const fieldDisabled = readOnly || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
        <div className="bg-card overflow-hidden rounded-xl border">
          <div role="tablist" aria-label="Employee form sections" className="grid grid-cols-2 border-b sm:grid-cols-4">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const complete = forceAllComplete || completion[tab.key];

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center justify-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {complete ? (
                    <CircleCheck className="text-success size-4 shrink-0" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-6">
            <div className="mb-5 space-y-1">
              <h3 className="text-sm font-semibold">{TABS.find((tab) => tab.key === activeTab)?.label}</h3>
              <p className="text-muted-foreground text-sm">
                {TABS.find((tab) => tab.key === activeTab)?.description}
              </p>
            </div>

            {activeTab === "identity" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="profile.code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee code</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={fieldDisabled} placeholder="PH00123456" />
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
                  name="profile.teamId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={fieldDisabled}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamOptions.data?.map((option) => (
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

                <FormField
                  control={form.control}
                  name="profile.resignationDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Resignation date <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <DatePicker value={field.value} onChange={field.onChange} disabled={fieldDisabled} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {activeTab === "contact" ? (
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
                      <FormLabel>
                        Work email <span className="text-muted-foreground font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={fieldDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {activeTab === "currentAddress" ? (
              <PhAddressPicker
                prefix="currentAddress"
                disabled={fieldDisabled}
                mirrorTo={sameAsCurrent ? "permanentAddress" : undefined}
              />
            ) : null}

            {activeTab === "permanentAddress" ? (
              <div className="space-y-4">
                {!readOnly ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="same-as-current"
                      checked={sameAsCurrent}
                      onCheckedChange={(checked) => {
                        const isChecked = checked === true;
                        setSameAsCurrent(isChecked);
                        if (isChecked) {
                          // Field-by-field, not setValue("permanentAddress", wholeObject) —
                          // see the comment on PhAddressPicker's mirror().
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
                    <Label htmlFor="same-as-current" className="text-sm font-normal">
                      Same as current address
                    </Label>
                  </div>
                ) : null}
                <PhAddressPicker prefix="permanentAddress" disabled={fieldDisabled || sameAsCurrent} />
              </div>
            ) : null}
          </div>
        </div>

        {!readOnly ? (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {props.mode === "create" ? "Add employee" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </Form>
  );
}
