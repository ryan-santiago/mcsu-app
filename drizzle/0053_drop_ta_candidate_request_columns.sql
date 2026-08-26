-- Talent Acquisition ATS redesign, step 5 of 6: now that `ta_application`
-- (0051) carries request_id/source_id/client_interview_required/
-- target_onboard_date/status, `ta_candidate` sheds them and goes back to
-- being a person-only record. Dropping a column also drops any FK
-- constraint/index defined on it, so no separate DROP CONSTRAINT/INDEX
-- statements are needed here.
ALTER TABLE "ta_candidate" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "ta_candidate" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "ta_candidate" DROP COLUMN "client_interview_required";--> statement-breakpoint
ALTER TABLE "ta_candidate" DROP COLUMN "target_onboard_date";--> statement-breakpoint
ALTER TABLE "ta_candidate" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."ta_candidate_status";
