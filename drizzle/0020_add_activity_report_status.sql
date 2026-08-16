CREATE TYPE "public"."activity_report_status" AS ENUM('present', 'on_leave');--> statement-breakpoint
ALTER TABLE "activity_report" ALTER COLUMN "time_in" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_report" ALTER COLUMN "time_out" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_report" ALTER COLUMN "ot_hours" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_report" ADD COLUMN "status" "activity_report_status" DEFAULT 'present' NOT NULL;