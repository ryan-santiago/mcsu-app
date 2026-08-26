CREATE TYPE "public"."ta_candidate_status" AS ENUM('active', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."ta_request_status" AS ENUM('open', 'partially_filled', 'filled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ta_stage" AS ENUM('l1_assessment', 'l2_assessment', 'client_interview', 'final_interview', 'job_offer');--> statement-breakpoint
CREATE TYPE "public"."ta_stage_status" AS ENUM('pending', 'in_progress', 'passed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."work_setup" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "job_posting_source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ta_candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"gender_id" text,
	"mobile_number" text,
	"personal_email" text,
	"source_id" text,
	"cv_storage_key" text,
	"cv_file_name" text,
	"cv_mime_type" text,
	"cv_size" integer,
	"client_interview_required" boolean DEFAULT false NOT NULL,
	"target_onboard_date" date,
	"status" "ta_candidate_status" DEFAULT 'active' NOT NULL,
	"employee_id" text,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ta_candidate_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ta_candidate_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"stage" "ta_stage" NOT NULL,
	"status" "ta_stage_status" DEFAULT 'pending' NOT NULL,
	"assignee_id" text,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ta_request" (
	"id" text PRIMARY KEY NOT NULL,
	"job_profile_id" text NOT NULL,
	"client_id" text NOT NULL,
	"headcount_needed" integer NOT NULL,
	"work_setup" "work_setup" NOT NULL,
	"work_setup_detail" text,
	"status" "ta_request_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"requested_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ta_candidate" ADD CONSTRAINT "ta_candidate_request_id_ta_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ta_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate" ADD CONSTRAINT "ta_candidate_gender_id_gender_id_fk" FOREIGN KEY ("gender_id") REFERENCES "public"."gender"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate" ADD CONSTRAINT "ta_candidate_source_id_job_posting_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."job_posting_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate" ADD CONSTRAINT "ta_candidate_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate" ADD CONSTRAINT "ta_candidate_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate_comment" ADD CONSTRAINT "ta_candidate_comment_candidate_id_ta_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."ta_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate_comment" ADD CONSTRAINT "ta_candidate_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate_stage" ADD CONSTRAINT "ta_candidate_stage_candidate_id_ta_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."ta_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate_stage" ADD CONSTRAINT "ta_candidate_stage_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_job_profile_id_job_profile_id_fk" FOREIGN KEY ("job_profile_id") REFERENCES "public"."job_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_posting_source_name_idx" ON "job_posting_source" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ta_candidate_request_idx" ON "ta_candidate" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ta_candidate_employee_idx" ON "ta_candidate" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ta_candidate_comment_candidate_idx" ON "ta_candidate_comment" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "ta_candidate_stage_candidate_idx" ON "ta_candidate_stage" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ta_candidate_stage_candidate_stage_idx" ON "ta_candidate_stage" USING btree ("candidate_id","stage");--> statement-breakpoint
CREATE INDEX "ta_request_job_profile_idx" ON "ta_request" USING btree ("job_profile_id");--> statement-breakpoint
CREATE INDEX "ta_request_client_idx" ON "ta_request" USING btree ("client_id");