import { z } from "zod";

import { emailSchema } from "@/lib/validation/auth";
import { addressSchema, employeeCodeSchema, phMobileOptionalSchema, phMobileSchema } from "@/lib/validation/ph";

const nameFieldSchema = z.string().trim().min(1, "Required").max(80, "That's too long");
const optionalNameFieldSchema = z.string().trim().max(80, "That's too long").optional().or(z.literal(""));
const optionalEmailSchema = emailSchema.optional().or(z.literal(""));

export const employeeProfileSchema = z.object({
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
  /** `isResigned` is never a form field — it's always derived from this. */
  resignationDate: z.string().optional().or(z.literal("")),
});

export const employeeFormSchema = z.object({
  profile: employeeProfileSchema,
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
});

export type EmployeeProfileInput = z.infer<typeof employeeProfileSchema>;
export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;

/**
 * The subset of `employeeProfileSchema` an employee may request a change to
 * about themselves — excludes `code`, `teamId` and `resignationDate`, which
 * stay HR-administrative fields edited only through the Employee module.
 */
export const selfServiceProfileSchema = employeeProfileSchema.omit({
  code: true,
  teamId: true,
  resignationDate: true,
});

export const selfServiceFormSchema = z.object({
  profile: selfServiceProfileSchema,
  currentAddress: addressSchema,
  permanentAddress: addressSchema,
});

export type SelfServiceProfileInput = z.infer<typeof selfServiceProfileSchema>;
export type SelfServiceFormInput = z.infer<typeof selfServiceFormSchema>;

const salarySchema = z
  .string()
  .trim()
  .min(1, "Enter a salary")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Enter a salary greater than zero");

export const employmentRecordSchema = z
  .object({
    salary: salarySchema,
    levelId: z.string().min(1, "Select a level"),
    positionId: z.string().min(1, "Select a position"),
    employmentType: z.enum([
      "regular",
      "probationary",
      "contractual",
      "project_based",
      "consultant",
      "intern",
    ]),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

export type EmploymentRecordInput = z.infer<typeof employmentRecordSchema>;

export const deploymentRecordSchema = z
  .object({
    clientId: z.string().min(1, "Select a client"),
    projectId: z.string().min(1, "Select a project"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

export type DeploymentRecordInput = z.infer<typeof deploymentRecordSchema>;
