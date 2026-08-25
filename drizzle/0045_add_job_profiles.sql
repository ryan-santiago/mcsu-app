CREATE TABLE "job_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"level_id" text NOT NULL,
	"job_description" text,
	"job_qualification" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_profile" ADD CONSTRAINT "job_profile_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_profile" ADD CONSTRAINT "job_profile_level_id_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."level"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_profile" ADD CONSTRAINT "job_profile_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_profile_position_level_idx" ON "job_profile" USING btree ("position_id","level_id");