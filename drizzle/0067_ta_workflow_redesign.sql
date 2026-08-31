ALTER TYPE "public"."ta_stage" ADD VALUE 'l3_assessment' BEFORE 'final_interview';--> statement-breakpoint
ALTER TABLE "ta_request" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "ta_application_stage" ADD COLUMN "client_feedback" text;--> statement-breakpoint
ALTER TABLE "ta_application_stage" ADD COLUMN "proposed_salary" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ta_application_stage" ADD COLUMN "proposed_communication_allowance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ta_application_stage" ADD COLUMN "proposed_transportation_allowance" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "employment_type_id" text;--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "work_arrangement" text;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_employment_type_id_employment_type_lookup_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "public"."employment_type_lookup"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Backfill work_arrangement from the old work_setup/work_setup_detail pair
-- before dropping them, so existing requests don't silently lose this info.
UPDATE "ta_request" SET "work_arrangement" =
  CASE "work_setup"
    WHEN 'onsite' THEN 'Full Onsite' || COALESCE(' — ' || "work_setup_detail", '')
    WHEN 'hybrid' THEN 'Hybrid' || COALESCE(' — ' || "work_setup_detail", '')
    WHEN 'remote' THEN 'Fully Remote'
    ELSE NULL
  END
WHERE "work_arrangement" IS NULL;--> statement-breakpoint
ALTER TABLE "ta_request" DROP COLUMN "work_setup";--> statement-breakpoint
ALTER TABLE "ta_request" DROP COLUMN "work_setup_detail";--> statement-breakpoint
DROP TYPE "public"."work_setup";