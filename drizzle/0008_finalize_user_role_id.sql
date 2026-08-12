DROP INDEX "user_role_idx";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "user_role_id_idx" ON "user" USING btree ("role_id");--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE "public"."user_role";