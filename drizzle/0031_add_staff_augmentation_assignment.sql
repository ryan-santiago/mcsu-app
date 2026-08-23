CREATE TABLE "staff_augmentation_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"engagement_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_augmentation_assignment" ADD CONSTRAINT "staff_augmentation_assignment_engagement_id_staff_augmentation_engagement_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."staff_augmentation_engagement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_augmentation_assignment" ADD CONSTRAINT "staff_augmentation_assignment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_augmentation_assignment" ADD CONSTRAINT "staff_augmentation_assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_augmentation_assignment_engagement_employee_idx" ON "staff_augmentation_assignment" USING btree ("engagement_id","employee_id");