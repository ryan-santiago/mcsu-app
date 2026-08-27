import { z } from "zod";

/**
 * Each "Action Requested" section on the paper ERF is optional — a manager
 * only fills in the ones they checked. Presence of the key in
 * `requestedActions` (see `employeeRecommendation.requestedActions` in
 * schema.ts) *is* the checkbox state; there's no separate boolean.
 *
 * `from*` fields are captured into the payload at the point the section is
 * toggled on (from live employee data — see `getEmployeeRecommendationSnapshot`),
 * not re-derived later, so the record stays stable even if the employee's
 * live data changes before this draft is submitted.
 */

export const supervisorChangeSchema = z.object({
  fromTeamId: z.string().nullable(),
  fromTeamName: z.string(),
  toTeamId: z.string().min(1, "Select the new team"),
  toTeamName: z.string(),
});

export const departmentChangeSchema = z.object({
  from: z.string().trim().min(1, "Enter the current department"),
  to: z.string().trim().min(1, "Enter the new department"),
});

export const jobTitleChangeSchema = z.object({
  fromLevelId: z.string().nullable(),
  fromPositionId: z.string().nullable(),
  fromLabel: z.string(),
  toLevelId: z.string().min(1, "Select the new level"),
  toPositionId: z.string().min(1, "Select the new position"),
  /** "Level - Position", resolved at selection time — same "snapshot the display text" convention as `fromLabel`/`toTeamName`, so a later Maintenance rename doesn't retroactively change this record (and so the ERF PDF has something readable without a live lookup). */
  toLabel: z.string(),
});

export const divisionChangeSchema = z.object({
  from: z.string().trim().min(1, "Enter the current division"),
  to: z.string().trim().min(1, "Enter the new division"),
});

const moneyFieldSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a valid amount");

/**
 * Three separate figures, matching `employeeEmployment`'s own columns
 * (`salary`, `communicationAllowance`, `transportationAllowance`) and the
 * paper form's "Salary and Allowances" TO field — not one combined
 * "allowances" number.
 */
export const salaryChangeSchema = z.object({
  fromSalary: z.string(),
  fromCommunicationAllowance: z.string(),
  fromTransportationAllowance: z.string(),
  toSalary: moneyFieldSchema,
  toCommunicationAllowance: moneyFieldSchema,
  toTransportationAllowance: moneyFieldSchema,
});

export const categoryChangeSchema = z.object({
  fromEmploymentTypeId: z.string().nullable(),
  fromEmploymentTypeName: z.string(),
  toEmploymentTypeId: z.string().min(1, "Select the new category"),
  /** Resolved at selection time, same reasoning as `jobTitleChange.toLabel`. */
  toEmploymentTypeName: z.string(),
  /** e.g. "6 Months Extension" — free text since extension length isn't a lookup value. */
  toLabel: z.string().trim().max(120, "Keep this under 120 characters").optional().or(z.literal("")),
});

export const requestedActionsSchema = z.object({
  supervisorChange: supervisorChangeSchema.optional(),
  departmentChange: departmentChangeSchema.optional(),
  jobTitleChange: jobTitleChangeSchema.optional(),
  divisionChange: divisionChangeSchema.optional(),
  salaryChange: salaryChangeSchema.optional(),
  categoryChange: categoryChangeSchema.optional(),
});

export type RequestedActions = z.infer<typeof requestedActionsSchema>;

export const recommendationDraftSchema = z.object({
  accomplishmentsAndRecommendation: z.string().trim().max(20000, "That's too long").optional().or(z.literal("")),
  requestedActions: requestedActionsSchema,
});

export type RecommendationDraftInput = z.infer<typeof recommendationDraftSchema>;

export const createRecommendationSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  triggerType: z.enum(["ph_contract_expiring", "probationary_expiring", "manual_regular"]),
  sourceEmploymentId: z.string().optional(),
});

export type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;

/**
 * The date the new `employeeEmployment` row starts — supplied by the TAM at
 * apply time, not carried from the recommendation itself, since the
 * per-section `effectiveDate` field was removed (real effective date is
 * whatever the actual new contract/record starts, which TAM knows at this
 * point but nobody did at request time).
 */
export const applyRecommendationSchema = z.object({
  id: z.string().min(1),
  effectiveDate: z.string().min(1, "Select an effective date"),
});

export type ApplyRecommendationInput = z.infer<typeof applyRecommendationSchema>;

/** KPI Result is always a PDF, per the source process ("upload KPI Result pdf file"). */
export const KPI_RESULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const KPI_RESULT_ACCEPT = "application/pdf";
