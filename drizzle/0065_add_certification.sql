-- Note: `drizzle-kit generate` also picked up a large batch of unrelated
-- ALTER statements here on first run — the live dev DB was already brought
-- up to date with several earlier schema.ts changes (team's/approval_step's
-- user-based FKs, work_item.done_at, employee_change_request's approval
-- columns, the two new enum values, erf_storage_key's removal) via
-- `drizzle-kit push` at some point, without ever generating a migration
-- file for it — so the migration history/snapshots were stale relative to
-- both schema.ts and the live DB. Verified directly against the live DB
-- (information_schema + pg_enum) that all of that was already applied;
-- this file was hand-trimmed to only the genuinely new part: the
-- `certification` table. The regenerated 0065_snapshot.json is kept as-is —
-- it correctly reflects the full current schema.ts and resolves that drift
-- in the snapshot history going forward.
CREATE TABLE "certification" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"title" text NOT NULL,
	"date_acquired" date NOT NULL,
	"credential_url" text,
	"storage_key" text,
	"file_name" text,
	"mime_type" text,
	"file_size" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certification" ADD CONSTRAINT "certification_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certification_employee_idx" ON "certification" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "certification_date_acquired_idx" ON "certification" USING btree ("date_acquired");
