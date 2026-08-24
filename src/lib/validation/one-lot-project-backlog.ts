import { z } from "zod";

/** The two types choosable when creating a top-level work item — "subtask" is never picked directly, only assigned by `createOneLotProjectWorkItem` when adding a subtask under a Task. */
export const topLevelWorkItemTypeValues = ["task", "bug"] as const;
export const workItemTypeValues = ["task", "bug", "subtask"] as const;
export type WorkItemTypeValue = (typeof workItemTypeValues)[number];

export const workItemCoverColorValues = [
  "gray",
  "blue",
  "teal",
  "green",
  "olive",
  "brown",
  "orange",
  "red",
  "magenta",
  "purple",
] as const;
export type WorkItemCoverColorValue = (typeof workItemCoverColorValues)[number];

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
    // Optional at create/edit time — a sprint can exist before its dates are
    // pinned down. `startOneLotProjectSprint` requires both before the
    // "planned → active" transition.
    startDate: z.string().optional().or(z.literal("")),
    endDate: z.string().optional().or(z.literal("")),
    goal: z.string().trim().max(2000, "That's too long").optional().or(z.literal("")),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
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
  type: z.enum(topLevelWorkItemTypeValues),
  title: z.string().trim().min(1, "Required").max(200, "That's too long"),
  // Stores the rich text editor's HTML output — the cap is higher than a
  // plain-text field's would be to leave room for markup overhead, not
  // because more visible text is allowed.
  description: z.string().max(20000, "That's too long").optional().or(z.literal("")),
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
    description: z.string().max(20000, "That's too long").or(z.literal("")),
    columnId: z.string().min(1, "Required"),
    priority: z.enum(workItemPriorityValues),
    assigneeId: z.string().or(z.literal("")),
    dueDate: z.string().or(z.literal("")),
    storyPoints: storyPointsFieldSchema,
    /** `null` clears the cover — Task/Bug only, enforced by `updateOneLotProjectWorkItem`. */
    coverColor: z.enum(workItemCoverColorValues).nullable(),
  })
  .partial();

export type WorkItemPatchInput = z.infer<typeof workItemPatchSchema>;

export const commentFormSchema = z.object({
  body: z.string().trim().min(1, "Write a comment").max(4000, "That's too long"),
});

export type CommentFormInput = z.infer<typeof commentFormSchema>;

export const boardColumnFormSchema = z.object({
  name: z.string().trim().min(1, "Required").max(60, "That's too long"),
});

export type BoardColumnFormInput = z.infer<typeof boardColumnFormSchema>;
