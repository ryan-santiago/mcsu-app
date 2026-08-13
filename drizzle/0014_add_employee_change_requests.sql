CREATE TYPE "public"."change_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "employee_change_request" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"requested_by" text,
	"status" "change_request_status" DEFAULT 'pending' NOT NULL,
	"proposed_profile" jsonb NOT NULL,
	"proposed_current_address" jsonb NOT NULL,
	"proposed_permanent_address" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_change_request" ADD CONSTRAINT "employee_change_request_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_change_request" ADD CONSTRAINT "employee_change_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_change_request" ADD CONSTRAINT "employee_change_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_change_request_employee_idx" ON "employee_change_request" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_change_request_status_idx" ON "employee_change_request" USING btree ("status");