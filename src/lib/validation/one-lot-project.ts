import { z } from "zod";

const requiredFieldSchema = z.string().trim().min(1, "Required").max(120, "That's too long");

export const oneLotProjectFormSchema = z.object({
  name: requiredFieldSchema,
});

export type OneLotProjectFormInput = z.infer<typeof oneLotProjectFormSchema>;

export const oneLotProjectMemberSchema = z.object({
  userId: z.string().min(1, "Select a user"),
});

export type OneLotProjectMemberInput = z.infer<typeof oneLotProjectMemberSchema>;

export const oneLotProjectS3pLinkSchema = z.object({
  projectId: z.string().min(1, "Select a project"),
});

export type OneLotProjectS3pLinkInput = z.infer<typeof oneLotProjectS3pLinkSchema>;
