import { z } from "zod";

export const activityReportStatusValues = ["present", "on_leave"] as const;
export type ActivityReportStatus = (typeof activityReportStatusValues)[number];

const timeFieldSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const requiredFieldSchema = z.string().trim().min(1, "Required").max(160, "That's too long");

export const activityLineItemSchema = z.object({
  activityCode: z.string().trim().min(1, "Required").max(40, "That's too long"),
  activityName: requiredFieldSchema,
  description: z.string().trim().min(1, "Enter a description").max(1000, "That's too long"),
  issueBlockers: z.string().trim().max(1000, "That's too long").optional().or(z.literal("")),
});

export type ActivityLineItemInput = z.infer<typeof activityLineItemSchema>;

/**
 * `timeIn`/`timeOut`/`otHours`/`items` are only required when `status` is
 * `"present"` — an `on_leave` day only needs a date, so those fields are
 * plain (unvalidated-at-the-field-level) strings/arrays here and checked
 * conditionally in `superRefine` instead.
 */
export const activityReportFormSchema = z
  .object({
    date: z.string().min(1, "Select a date"),
    status: z.enum(activityReportStatusValues),
    timeIn: z.string(),
    timeOut: z.string(),
    otHours: z.string(),
    items: z.array(activityLineItemSchema),
  })
  .superRefine((data, ctx) => {
    if (data.status === "on_leave") return;

    if (!timeFieldSchema.safeParse(data.timeIn).success) {
      ctx.addIssue({ code: "custom", path: ["timeIn"], message: "Use HH:MM (24-hour)" });
    }
    if (!timeFieldSchema.safeParse(data.timeOut).success) {
      ctx.addIssue({ code: "custom", path: ["timeOut"], message: "Use HH:MM (24-hour)" });
    }

    const otHours = data.otHours.trim();
    if (otHours.length === 0) {
      ctx.addIssue({ code: "custom", path: ["otHours"], message: "Enter OT hours (0 if none)" });
    } else if (!Number.isFinite(Number(otHours)) || Number(otHours) < 0) {
      ctx.addIssue({ code: "custom", path: ["otHours"], message: "Enter a valid number of hours" });
    }

    if (data.items.length === 0) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Add at least one activity" });
    }
  });

export type ActivityReportFormInput = z.infer<typeof activityReportFormSchema>;
