import { z } from "zod";

const requiredFieldSchema = z.string().trim().min(1, "Required").max(80, "That's too long");

export const deviceFormSchema = z.object({
  deviceType: z.enum(["laptop", "phone"]),
  brand: requiredFieldSchema,
  model: requiredFieldSchema,
  os: requiredFieldSchema,
  serialNumber: requiredFieldSchema,
  purchaseDate: z.string().min(1, "Select a purchase date"),
  status: z.enum(["available", "deployed", "under_repair", "retired"]),
  remarks: z.string().trim().max(500, "Keep remarks under 500 characters").optional().or(z.literal("")),
});

export type DeviceFormInput = z.infer<typeof deviceFormSchema>;

export const deviceDeploymentRecordSchema = z
  .object({
    employeeId: z.string().min(1, "Select an employee"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });

export type DeviceDeploymentRecordInput = z.infer<typeof deviceDeploymentRecordSchema>;
