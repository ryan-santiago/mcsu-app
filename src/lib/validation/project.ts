import { z } from "zod";

const nameFieldSchema = z.string().trim().min(1, "Required").max(160, "That's too long");

export const projectProfileSchema = z
  .object({
    s3pNumber: z.string().trim().min(1, "Enter the S3P number").max(40, "That's too long"),
    name: nameFieldSchema,
    clientId: z.string().min(1, "Select a client"),
    salesRepresentativeId: z.string().min(1, "Select a sales representative"),
    solutionsManagerId: z.string().min(1, "Select a solutions manager"),
    engagementTypeId: z.string().min(1, "Select an engagement type"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
    clientNames: z.array(z.string().trim().min(1).max(160)),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

export type ProjectProfileInput = z.infer<typeof projectProfileSchema>;

const moneySchema = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  // Comma-formatted as typed (see formatMoneyInput in src/lib/employee-format.ts) —
  // stripped back to a plain numeric string before it ever reaches the DB.
  .transform((value) => value.replace(/,/g, ""))
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid amount");

export const projectDetailSchema = z.object({
  description: z.string().trim().min(1, "Enter a description").max(200, "That's too long"),
  contractPrice: moneySchema,
  estimatedCost: moneySchema,
  teamIds: z.array(z.string()).min(1, "Select at least one team"),
});

export type ProjectDetailInput = z.infer<typeof projectDetailSchema>;
