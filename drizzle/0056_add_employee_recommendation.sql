CREATE TYPE "public"."approval_entity_type" AS ENUM('employee_recommendation');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."approval_step_status" AS ENUM('pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'erf_generated', 'applied', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recommendation_trigger_type" AS ENUM('ph_contract_expiring', 'probationary_expiring', 'manual_regular');--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "approval_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"requested_by" text,
	"requested_by_label" text NOT NULL,
	"requester_rank" integer NOT NULL,
	"status" "approval_request_status" DEFAULT 'pending' NOT NULL,
	"current_step_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_step" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_request_id" text NOT NULL,
	"step_order" integer NOT NULL,
	"required_role_id" text NOT NULL,
	"approver_employee_id" text NOT NULL,
	"status" "approval_step_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_recommendation" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"trigger_type" "recommendation_trigger_type" NOT NULL,
	"source_employment_id" text,
	"approval_request_id" text,
	"status" "recommendation_status" DEFAULT 'draft' NOT NULL,
	"submitted_by" text,
	"submitted_by_name" text NOT NULL,
	"employee_number_snapshot" text,
	"department_snapshot" text DEFAULT 'QSERV-MCSU' NOT NULL,
	"position_snapshot" text NOT NULL,
	"manager_name_snapshot" text NOT NULL,
	"requested_actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accomplishments_and_recommendation" text,
	"kpi_result_storage_key" text,
	"erf_storage_key" text,
	"erf_generated_at" timestamp with time zone,
	"erf_generated_by" text,
	"applied_to_employment_history_at" timestamp with time zone,
	"applied_by" text,
	"resulting_employment_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "unit_manager_employee_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "department_head_employee_id" text;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approval_request_id_approval_request_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_required_role_id_role_id_fk" FOREIGN KEY ("required_role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approver_employee_id_employee_id_fk" FOREIGN KEY ("approver_employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_source_employment_id_employee_employment_id_fk" FOREIGN KEY ("source_employment_id") REFERENCES "public"."employee_employment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_approval_request_id_approval_request_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_erf_generated_by_user_id_fk" FOREIGN KEY ("erf_generated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_recommendation" ADD CONSTRAINT "employee_recommendation_resulting_employment_id_employee_employment_id_fk" FOREIGN KEY ("resulting_employment_id") REFERENCES "public"."employee_employment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_request_entity_idx" ON "approval_request" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "approval_request_status_idx" ON "approval_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_step_request_idx" ON "approval_step" USING btree ("approval_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_step_request_order_idx" ON "approval_step" USING btree ("approval_request_id","step_order");--> statement-breakpoint
CREATE INDEX "employee_recommendation_employee_idx" ON "employee_recommendation" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_recommendation_status_idx" ON "employee_recommendation" USING btree ("status");--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_unit_manager_employee_id_employee_id_fk" FOREIGN KEY ("unit_manager_employee_id") REFERENCES "public"."employee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_department_head_employee_id_employee_id_fk" FOREIGN KEY ("department_head_employee_id") REFERENCES "public"."employee"("id") ON DELETE set null ON UPDATE no action;
