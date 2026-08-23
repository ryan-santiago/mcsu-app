import { z } from "zod";

const requiredFieldSchema = z.string().trim().min(1, "Required").max(120, "That's too long");

export const staffAugmentationFormSchema = z.object({
  name: requiredFieldSchema,
});

export type StaffAugmentationFormInput = z.infer<typeof staffAugmentationFormSchema>;

export const staffAugmentationAssignmentSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
});

export type StaffAugmentationAssignmentInput = z.infer<typeof staffAugmentationAssignmentSchema>;
