"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PhAddressPicker } from "@/components/employees/ph-address-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaApplicationRow } from "@/server/talent-acquisition/application-types";
import { fetchGenderOptions } from "@/server/talent-acquisition/candidate-actions";
import {
  fetchEmploymentTypeOptions,
  fetchProjectOptionsForClient,
  fetchTeamOptions,
  migrateCandidateToEmployee,
} from "@/server/talent-acquisition/migrate-actions";
import { emailSchema } from "@/lib/validation/auth";
import { addressSchema } from "@/lib/validation/ph";
import { ADDRESS_FIELD_KEYS } from "@/lib/validation/ph";

const nameFieldSchema = z.string().trim().min(1, "Required").max(80, "That's too long");
const optionalNameFieldSchema = z.string().trim().max(80, "That's too long").optional().or(z.literal(""));
const optionalEmailSchema = emailSchema.optional().or(z.literal(""));
const phMobileSchema = z.string().trim().regex(/^(?:\+63|0)9\d{9}$/, "Enter a valid PH mobile number (e.g. 09171234567)");
const phMobileOptionalSchema = phMobileSchema.optional().or(z.literal(""));
const employeeCodeSchema = z
  .string()
  .trim()
  .regex(/^(?:PH)?\d{6,10}$/i, "Use a code like PH00123456 or 123456")
  .transform((value) => value.toUpperCase())
  .optional()
  .or(z.literal(""));

const salarySchema = z
  .string()
  .trim()
  .min(1, "Enter a salary")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Enter a salary greater than zero");
const allowanceSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount (0 if none)")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid amount");

/** Matches `CONTRACT_END_DATE_REQUIRED_TYPES` in `migrate-actions.ts` — see that file's comment. */
const CONTRACT_END_DATE_REQUIRED_TYPES = new Set(["project_based", "probationary"]);

const employmentSchema = z
  .object({
    salary: salarySchema,
    communicationAllowance: allowanceSchema,
    transportationAllowance: allowanceSchema,
    employmentTypeId: z.string().min(1, "Select an employment type"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !CONTRACT_END_DATE_REQUIRED_TYPES.has(data.employmentTypeId) || Boolean(data.endDate), {
    message: "Select a contract/probation end date for this employment type",
    path: ["endDate"],
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

const migrateFormSchema = z.object({
  profile: z.object({
    code: employeeCodeSchema,
    firstName: nameFieldSchema,
    middleName: optionalNameFieldSchema,
    lastName: nameFieldSchema,
    genderId: z.string().min(1, "Select a gender"),
    mobileNumber: phMobileSchema,
    viberNumber: phMobileOptionalSchema,
    personalEmail: optionalEmailSchema,
    workEmail: emailSchema,
    teamId: z.string().min(1, "Select a team"),
  }),
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
  employment: employmentSchema,
  deployment: z.object({
    projectId: z.string().min(1, "Select a project"),
    startDate: z.string().min(1, "Select a start date"),
  }),
});
type MigrateFormInput = z.infer<typeof migrateFormSchema>;

const MAX_DATE_PICKER_YEAR = new Date().getFullYear() + 10;

const BLANK_ADDRESS = {
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

type MigrateToEmployeeFormProps = {
  requestId: string;
  application: TaApplicationRow;
  clientId: string;
  clientName: string;
  positionName: string;
  levelName: string;
};

export function MigrateToEmployeeForm({
  requestId,
  application,
  clientId,
  clientName,
  positionName,
  levelName,
}: MigrateToEmployeeFormProps) {
  const router = useRouter();
  const [sameAsCurrent, setSameAsCurrent] = React.useState(false);

  const genderOptions = useQuery({ queryKey: ["ta-migrate", "gender-options"], queryFn: fetchGenderOptions });
  const teamOptions = useQuery({ queryKey: ["ta-migrate", "team-options"], queryFn: fetchTeamOptions });
  const employmentTypeOptions = useQuery({
    queryKey: ["ta-migrate", "employment-type-options"],
    queryFn: fetchEmploymentTypeOptions,
  });
  const projectOptions = useQuery({
    queryKey: ["ta-migrate", "project-options", clientId],
    queryFn: () => fetchProjectOptionsForClient(clientId),
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const form = useForm<MigrateFormInput>({
    resolver: zodResolver(migrateFormSchema),
    defaultValues: {
      profile: {
        code: "",
        firstName: application.firstName,
        middleName: application.middleName ?? "",
        lastName: application.lastName,
        genderId: application.genderId ?? "",
        mobileNumber: application.mobileNumber ?? "",
        viberNumber: "",
        personalEmail: application.personalEmail ?? "",
        workEmail: "",
        teamId: "",
      },
      currentAddress: { ...BLANK_ADDRESS },
      permanentAddress: { ...BLANK_ADDRESS },
      employment: {
        salary: "",
        communicationAllowance: "0",
        transportationAllowance: "0",
        employmentTypeId: "",
        startDate: today,
        endDate: "",
      },
      deployment: { projectId: "", startDate: today },
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const watchedEmploymentTypeId = useWatch({ control: form.control, name: "employment.employmentTypeId" });
  const endDateRequired = CONTRACT_END_DATE_REQUIRED_TYPES.has(watchedEmploymentTypeId);

  async function onSubmit(values: MigrateFormInput) {
    const result = await migrateCandidateToEmployee({ applicationId: application.id, requestId, ...values });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    router.push(`/talent-acquisition/${requestId}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Profile</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="profile.firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} />
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
                    <Input {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="profile.middleName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Middle name <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="profile.code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Employee code <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} placeholder="PH00123456" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="profile.genderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
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
              name="profile.teamId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Team</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="profile.mobileNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mobile number</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} placeholder="09XX XXX XXXX" />
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
                    <Input {...field} disabled={isSubmitting} placeholder="09XX XXX XXXX" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="profile.personalEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Personal email <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="email" disabled={isSubmitting} />
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
                    <Input {...field} type="email" disabled={isSubmitting} placeholder="name@questronix.com.ph" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Employment</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Position</p>
              <p className="mt-0.5">{positionName}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Level</p>
              <p className="mt-0.5">{levelName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="employment.employmentTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employmentTypeOptions.data?.map((option) => (
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
              name="employment.startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {endDateRequired ? (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employment.endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchedEmploymentTypeId === "project_based" ? "Contract end date" : "Probation end date"}</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value ?? ""} onChange={field.onChange} disabled={isSubmitting} toYear={MAX_DATE_PICKER_YEAR} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="employment.salary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Salary</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="employment.communicationAllowance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comm. allowance</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="employment.transportationAllowance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transport allowance</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Deployment</h3>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Client</p>
            <p className="mt-0.5">{clientName}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="deployment.projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projectOptions.data?.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projectOptions.data?.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No projects exist yet for {clientName} — add one under Projects first.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deployment.startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value} onChange={field.onChange} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Current address</h3>
          <PhAddressPicker prefix="currentAddress" disabled={isSubmitting} mirrorTo={sameAsCurrent ? "permanentAddress" : undefined} />
        </div>

        <div className="bg-card space-y-4 rounded-xl border p-6">
          <h3 className="text-sm font-semibold">Permanent address</h3>
          <div className="flex items-center gap-2">
            <Checkbox
              id="migrate-same-as-current"
              checked={sameAsCurrent}
              onCheckedChange={(checked) => {
                const isChecked = checked === true;
                setSameAsCurrent(isChecked);
                if (isChecked) {
                  const current = form.getValues("currentAddress");
                  for (const key of ADDRESS_FIELD_KEYS) {
                    form.setValue(`permanentAddress.${key}`, current[key], { shouldValidate: true, shouldDirty: true });
                  }
                }
              }}
              disabled={isSubmitting}
            />
            <Label htmlFor="migrate-same-as-current" className="text-sm font-normal">
              Same as current address
            </Label>
          </div>
          <PhAddressPicker prefix="permanentAddress" disabled={isSubmitting || sameAsCurrent} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Migrate to Employee
          </Button>
        </div>
      </form>
    </Form>
  );
}
