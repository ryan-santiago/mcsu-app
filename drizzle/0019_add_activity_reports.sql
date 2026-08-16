CREATE TABLE "activity_report" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"date" date NOT NULL,
	"time_in" time NOT NULL,
	"time_out" time NOT NULL,
	"ot_hours" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_report_item" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_report_id" text NOT NULL,
	"activity_code" text NOT NULL,
	"activity_name" text NOT NULL,
	"description" text NOT NULL,
	"issue_blockers" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_report" ADD CONSTRAINT "activity_report_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_report_item" ADD CONSTRAINT "activity_report_item_activity_report_id_activity_report_id_fk" FOREIGN KEY ("activity_report_id") REFERENCES "public"."activity_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_report_employee_date_idx" ON "activity_report" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "activity_report_date_idx" ON "activity_report" USING btree ("date");--> statement-breakpoint
CREATE INDEX "activity_report_item_report_idx" ON "activity_report_item" USING btree ("activity_report_id");