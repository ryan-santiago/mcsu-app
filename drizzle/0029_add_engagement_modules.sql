CREATE TABLE "one_lot_project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_lot_project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_augmentation_engagement" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_lot_project" ADD CONSTRAINT "one_lot_project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ADD CONSTRAINT "one_lot_project_member_project_id_one_lot_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ADD CONSTRAINT "one_lot_project_member_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_augmentation_engagement" ADD CONSTRAINT "staff_augmentation_engagement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_lot_project_name_idx" ON "one_lot_project" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_member_project_employee_idx" ON "one_lot_project_member" USING btree ("project_id","employee_id");--> statement-breakpoint
CREATE INDEX "staff_augmentation_engagement_name_idx" ON "staff_augmentation_engagement" USING btree ("name");