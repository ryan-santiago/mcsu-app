import { z } from "zod";

const requiredFieldSchema = z.string().trim().min(1, "Required").max(120, "That's too long");

export const oneLotProjectFormSchema = z.object({
  name: requiredFieldSchema,
});

export type OneLotProjectFormInput = z.infer<typeof oneLotProjectFormSchema>;
