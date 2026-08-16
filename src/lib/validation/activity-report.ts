import { z } from "zod";

const timeFieldSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const otHoursSchema = z
  .string()
  .trim()
  .min(1, "Enter OT hours (0 if none)")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid number of hours");

const requiredFieldSchema = z.string().trim().min(1, "Required").max(160, "That's too long");

export const activityLineItemSchema = z.object({
  activityCode: z.string().trim().min(1, "Required").max(40, "That's too long"),
  activityName: requiredFieldSchema,
  description: z.string().trim().min(1, "Enter a description").max(1000, "That's too long"),
  issueBlockers: z.string().trim().max(1000, "That's too long").optional().or(z.literal("")),
});

export type ActivityLineItemInput = z.infer<typeof activityLineItemSchema>;

export const activityReportFormSchema = z.object({
  date: z.string().min(1, "Select a date"),
  timeIn: timeFieldSchema,
  timeOut: timeFieldSchema,
  otHours: otHoursSchema,
  items: z.array(activityLineItemSchema).min(1, "Add at least one activity"),
});

export type ActivityReportFormInput = z.infer<typeof activityReportFormSchema>;
