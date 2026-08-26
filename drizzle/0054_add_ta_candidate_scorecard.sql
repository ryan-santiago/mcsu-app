-- Talent Acquisition ATS redesign, step 6 of 6: structured per-evaluator
-- scorecards on a pipeline stage, independent of the stage's own official
-- status/notes.
CREATE TYPE "public"."ta_scorecard_rating" AS ENUM ('strong_yes', 'yes', 'no', 'strong_no');--> statement-breakpoint
CREATE TABLE "ta_candidate_scorecard" (
	"id" text PRIMARY KEY NOT NULL,
	"application_stage_id" text NOT NULL,
	"evaluator_id" text,
	"rating" "ta_scorecard_rating" NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "ta_candidate_scorecard" ADD CONSTRAINT "ta_candidate_scorecard_app_stage_id_fk" FOREIGN KEY ("application_stage_id") REFERENCES "public"."ta_application_stage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_candidate_scorecard" ADD CONSTRAINT "ta_candidate_scorecard_evaluator_id_user_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ta_candidate_scorecard_application_stage_idx" ON "ta_candidate_scorecard" USING btree ("application_stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ta_candidate_scorecard_stage_evaluator_idx" ON "ta_candidate_scorecard" USING btree ("application_stage_id","evaluator_id");
