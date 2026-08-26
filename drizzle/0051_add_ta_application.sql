-- Talent Acquisition ATS redesign, step 3 of 6: introduce `ta_application`,
-- the join between the talent pool (`ta_candidate`) and a requisition
-- (`ta_request`). Backfills one application row per existing candidate,
-- since today every candidate belongs to exactly one request. Columns this
-- backfill reads off `ta_candidate` (request_id/source_id/status/
-- client_interview_required/target_onboard_date) are dropped from
-- `ta_candidate` in 0053, once this table is verified.
CREATE TYPE "public"."ta_application_status" AS ENUM ('active', 'hired', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "ta_application" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"request_id" text NOT NULL,
	"source_id" text,
	"status" "ta_application_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"status_changed_at" timestamp with time zone,
	"status_changed_by" text,
	"current_stage" "ta_stage" DEFAULT 'l1_assessment' NOT NULL,
	"client_interview_required" boolean DEFAULT false NOT NULL,
	"target_onboard_date" date,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
ALTER TABLE "ta_application" ADD CONSTRAINT "ta_application_candidate_id_ta_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."ta_candidate"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_application" ADD CONSTRAINT "ta_application_request_id_ta_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ta_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_application" ADD CONSTRAINT "ta_application_source_id_job_posting_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."job_posting_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_application" ADD CONSTRAINT "ta_application_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_application" ADD CONSTRAINT "ta_application_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ta_application_candidate_idx" ON "ta_application" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "ta_application_request_idx" ON "ta_application" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ta_application_one_active_idx" ON "ta_application" USING btree ("candidate_id","request_id") WHERE "ta_application"."status" = 'active';--> statement-breakpoint
INSERT INTO "ta_application" (
	"id", "candidate_id", "request_id", "source_id", "status",
	"current_stage", "client_interview_required", "target_onboard_date",
	"created_by", "created_at", "updated_at"
)
SELECT
	gen_random_uuid()::text,
	tc."id",
	tc."request_id",
	tc."source_id",
	tc."status"::text::"ta_application_status",
	COALESCE(
		(
			SELECT tcs."stage"
			FROM "ta_candidate_stage" tcs
			WHERE tcs."candidate_id" = tc."id"
			ORDER BY CASE tcs."stage"
				WHEN 'job_offer' THEN 5
				WHEN 'final_interview' THEN 4
				WHEN 'client_interview' THEN 3
				WHEN 'l2_assessment' THEN 2
				ELSE 1
			END DESC
			LIMIT 1
		),
		'l1_assessment'
	),
	tc."client_interview_required",
	tc."target_onboard_date",
	tc."created_by",
	tc."created_at",
	tc."updated_at"
FROM "ta_candidate" tc;
