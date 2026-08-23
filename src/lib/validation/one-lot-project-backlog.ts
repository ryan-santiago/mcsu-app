import { z } from "zod";

export const workItemTypeValues = ["task", "bug"] as const;
export type WorkItemTypeValue = (typeof workItemTypeValues)[number];

export const workItemStatusValues = ["todo", "in_progress", "done"] as const;
export type WorkItemStatusValue = (typeof workItemStatusValues)[number];

export const workItemPriorityValues = ["highest", "high", "medium", "low", "lowest"] as const;
export type WorkItemPriorityValue = (typeof workItemPriorityValues)[number];

export const sprintStatusValues = ["planned", "active", "completed"] as const;
export type SprintStatusValue = (typeof sprintStatusValues)[number];

export const sprintFormSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(120, "That's too long"),
    itemCode: z
      .string()
      .trim()
      .min(1, "Required")
      .max(20, "That's too long")
      .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
    startDate: z.string().min(1, "Select a start date"),
    endDate: z.string().min(1, "Select an end date"),
    goal: z.string().trim().max(2000, "That's too long").optional().or(z.literal("")),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type SprintFormInput = z.infer<typeof sprintFormSchema>;

const storyPointsFieldSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0), "Enter a valid number")
  .optional()
  .or(z.literal(""));

const subtaskDraftSchema = z.object({
  title: z.string().trim().min(1, "Required").max(200, "That's too long"),
  assigneeId: z.string().optional().or(z.literal("")),
});

export type SubtaskDraftInput = z.infer<typeof subtaskDraftSchema>;

export const workItemFormSchema = z.object({
  type: z.enum(workItemTypeValues),
  title: z.string().trim().min(1, "Required").max(200, "That's too long"),
  description: z.string().trim().max(5000, "That's too long").optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
  priority: z.enum(workItemPriorityValues),
  dueDate: z.string().optional().or(z.literal("")),
  storyPoints: storyPointsFieldSchema,
  subtasks: z.array(subtaskDraftSchema).optional(),
});

export type WorkItemFormInput = z.infer<typeof workItemFormSchema>;

export const workItemPatchSchema = z
  .object({
    title: z.string().trim().min(1, "Required").max(200, "That's too long"),
    description: z.string().trim().max(5000, "That's too long").or(z.literal("")),
    status: z.enum(workItemStatusValues),
    priority: z.enum(workItemPriorityValues),
    assigneeId: z.string().or(z.literal("")),
    dueDate: z.string().or(z.literal("")),
    storyPoints: storyPointsFieldSchema,
  })
  .partial();

export type WorkItemPatchInput = z.infer<typeof workItemPatchSchema>;

export const commentFormSchema = z.object({
  body: z.string().trim().min(1, "Write a comment").max(4000, "That's too long"),
});

export type CommentFormInput = z.infer<typeof commentFormSchema>;
