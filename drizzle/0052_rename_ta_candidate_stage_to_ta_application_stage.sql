-- Talent Acquisition ATS redesign, step 4 of 6: repoint the pipeline-stage
-- table from candidates to applications. Hand-authored (not drizzle-kit
-- auto-diff, which would drop/recreate and lose every stage row) — rename
-- first, then swap each row's FK value from its old candidate id to the
-- corresponding (1:1, per the 0051 backfill) application id before
-- repointing the constraint itself.
ALTER TABLE "ta_candidate_stage" RENAME TO "ta_application_stage";--> statement-breakpoint
ALTER TABLE "ta_application_stage" RENAME COLUMN "candidate_id" TO "application_id";--> statement-breakpoint
ALTER TABLE "ta_application_stage" DROP CONSTRAINT "ta_candidate_stage_candidate_id_ta_candidate_id_fk";--> statement-breakpoint
DROP INDEX "ta_candidate_stage_candidate_idx";--> statement-breakpoint
DROP INDEX "ta_candidate_stage_candidate_stage_idx";--> statement-breakpoint
UPDATE "ta_application_stage" AS tas
SET "application_id" = ta."id"
FROM "ta_application" ta
WHERE ta."candidate_id" = tas."application_id";--> statement-breakpoint
ALTER TABLE "ta_application_stage" ADD CONSTRAINT "ta_application_stage_application_id_ta_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."ta_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ta_application_stage_application_idx" ON "ta_application_stage" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ta_application_stage_application_stage_idx" ON "ta_application_stage" USING btree ("application_id","stage");--> statement-breakpoint
ALTER TABLE "ta_application_stage" RENAME CONSTRAINT "ta_candidate_stage_pkey" TO "ta_application_stage_pkey";--> statement-breakpoint
ALTER TABLE "ta_application_stage" RENAME CONSTRAINT "ta_candidate_stage_assignee_id_user_id_fk" TO "ta_application_stage_assignee_id_user_id_fk";
