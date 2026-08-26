-- Talent Acquisition ATS redesign, step 1 of 6: requisition approval gate.
-- A request now starts `pending_approval`; a Dept Head/Unit Manager must
-- approve it (see 0050 for the new `talent_acquisition:approve` permission)
-- before it becomes sourceable. Existing rows are backfilled to `open` so
-- today's live requests aren't retroactively yanked back into review.
ALTER TYPE "ta_request_status" ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'open';--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ta_request" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "ta_request" ADD CONSTRAINT "ta_request_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ta_request" ALTER COLUMN "status" SET DEFAULT 'pending_approval';
