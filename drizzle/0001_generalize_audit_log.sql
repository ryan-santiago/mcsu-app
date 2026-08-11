ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_target_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "audit_log_target_user_id_idx";--> statement-breakpoint
TRUNCATE TABLE "audit_log";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "target_user_id";--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "action" SET DATA TYPE text USING "action"::text;--> statement-breakpoint
DROP TYPE "public"."audit_action";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "module" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "entity_label" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "changes" jsonb;--> statement-breakpoint
CREATE INDEX "audit_log_module_idx" ON "audit_log" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_id");
