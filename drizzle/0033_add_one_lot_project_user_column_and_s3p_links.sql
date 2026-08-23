CREATE TABLE "one_lot_project_s3p_project" (
	"id" text PRIMARY KEY NOT NULL,
	"one_lot_project_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ALTER COLUMN "employee_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "one_lot_project_s3p_project" ADD CONSTRAINT "one_lot_project_s3p_project_one_lot_project_id_one_lot_project_id_fk" FOREIGN KEY ("one_lot_project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_s3p_project" ADD CONSTRAINT "one_lot_project_s3p_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_s3p_project" ADD CONSTRAINT "one_lot_project_s3p_project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_s3p_project_one_lot_project_id_project_id_idx" ON "one_lot_project_s3p_project" USING btree ("one_lot_project_id","project_id");--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ADD CONSTRAINT "one_lot_project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;