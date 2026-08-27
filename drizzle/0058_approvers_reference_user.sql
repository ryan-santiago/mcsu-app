-- Employee Recommendation's approver columns moved from `employee` to
-- `user` (see docs/EMPLOYEE_RECOMMENDATION.md §9, dated 2026-08-27): a
-- Department Head/Unit Manager is identified by the account that logs in
-- and clicks Approve, and doesn't have to be tracked as an "employee" in
-- the HR sense. Requiring an Employee record just to be assignable here
-- proved wrong in practice — two real accounts holding these roles
-- (Unit Manager, Department Head) turned out to have no matching Employee
-- record at all, and could never have actually approved anything under the
-- old employee-email-matching design.
--
-- `approval_step` is empty in every environment this has shipped to
-- (Employee Recommendation hasn't gone live yet), so there's no step data
-- to carry over — the column is simply renamed and re-pointed.
--
-- `team.unit_manager_employee_id`/`department_head_employee_id` may carry a
-- real assignment (an Employee id), but that id can never be reinterpreted
-- as a `user.id` — different tables, no coincidental overlap possible. Any
-- existing assignment is nulled out below; re-assign it from Maintenance →
-- Teams once the right person's *user account* holds the Unit Manager /
-- Department Head role.
ALTER TABLE "team" DROP CONSTRAINT "team_unit_manager_employee_id_employee_id_fk";--> statement-breakpoint
ALTER TABLE "team" DROP CONSTRAINT "team_department_head_employee_id_employee_id_fk";--> statement-breakpoint
ALTER TABLE "approval_step" DROP CONSTRAINT "approval_step_approver_employee_id_employee_id_fk";--> statement-breakpoint
ALTER TABLE "team" RENAME COLUMN "unit_manager_employee_id" TO "unit_manager_user_id";--> statement-breakpoint
ALTER TABLE "team" RENAME COLUMN "department_head_employee_id" TO "department_head_user_id";--> statement-breakpoint
ALTER TABLE "approval_step" RENAME COLUMN "approver_employee_id" TO "approver_user_id";--> statement-breakpoint
UPDATE "team" SET "unit_manager_user_id" = NULL, "department_head_user_id" = NULL WHERE "unit_manager_user_id" IS NOT NULL OR "department_head_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_unit_manager_user_id_user_id_fk" FOREIGN KEY ("unit_manager_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_department_head_user_id_user_id_fk" FOREIGN KEY ("department_head_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
