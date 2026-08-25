CREATE TYPE "public"."announcement_type" AS ENUM('news', 'activity');--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_date" date NOT NULL,
	"type" "announcement_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_date_idx" ON "announcement" USING btree ("announcement_date");--> statement-breakpoint
CREATE INDEX "announcement_type_idx" ON "announcement" USING btree ("type");