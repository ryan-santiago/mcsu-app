-- Second half of migrating employeeChangeRequest onto the generic
-- approvalRequest/approvalStep engine — see 0059's comment for why this is
-- split into two files. By the time this runs, 'employee_change_request'
-- and 'cancelled' already exist as committed enum values.
--
-- employee_change_request has exactly 2 rows today, both already in a
-- terminal 'approved' state — no in-flight requests to worry about. They're
-- backfilled below so a future unified inbox sees consistent history for
-- both entity types from day one.
ALTER TABLE "approval_step" ALTER COLUMN "required_role_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_step" ALTER COLUMN "approver_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_change_request" ADD COLUMN "approval_request_id" text;--> statement-breakpoint
ALTER TABLE "employee_change_request" ADD CONSTRAINT "employee_change_request_approval_request_id_approval_request_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "approval_request" ("id", "entity_type", "entity_id", "requested_by", "requested_by_label", "requester_rank", "status", "current_step_order", "created_at", "updated_at")
SELECT
	gen_random_uuid()::text,
	'employee_change_request',
	cr."id",
	cr."requested_by",
	COALESCE(u."name", 'Unknown'),
	COALESCE(r."rank", 0),
	cr."status"::text::"approval_request_status",
	1,
	cr."created_at",
	cr."updated_at"
FROM "employee_change_request" cr
LEFT JOIN "user" u ON u."id" = cr."requested_by"
LEFT JOIN "role" r ON r."id" = u."role_id"
WHERE cr."status" = 'approved';--> statement-breakpoint
INSERT INTO "approval_step" ("id", "approval_request_id", "step_order", "required_role_id", "approver_user_id", "status", "decided_by", "decided_at", "note", "created_at")
SELECT
	gen_random_uuid()::text,
	ar."id",
	1,
	NULL,
	NULL,
	cr."status"::text::"approval_step_status",
	cr."reviewed_by",
	cr."reviewed_at",
	cr."review_note",
	cr."created_at"
FROM "employee_change_request" cr
JOIN "approval_request" ar ON ar."entity_type" = 'employee_change_request' AND ar."entity_id" = cr."id"
WHERE cr."status" = 'approved';--> statement-breakpoint
UPDATE "employee_change_request" cr
SET "approval_request_id" = ar."id"
FROM "approval_request" ar
WHERE ar."entity_type" = 'employee_change_request' AND ar."entity_id" = cr."id" AND cr."status" = 'approved';
