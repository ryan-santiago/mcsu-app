CREATE TABLE "engagement_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"s3p_number" text NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"sales_representative_id" text,
	"solutions_manager_id" text,
	"engagement_type_id" text,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_s3p_number_unique" UNIQUE("s3p_number")
);
--> statement-breakpoint
CREATE TABLE "project_client_name" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"description" text NOT NULL,
	"contract_price" numeric(12, 2) NOT NULL,
	"estimated_cost" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_detail_team" (
	"id" text PRIMARY KEY NOT NULL,
	"project_detail_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_representative" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solutions_manager" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_deployment" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_sales_representative_id_sales_representative_id_fk" FOREIGN KEY ("sales_representative_id") REFERENCES "public"."sales_representative"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_solutions_manager_id_solutions_manager_id_fk" FOREIGN KEY ("solutions_manager_id") REFERENCES "public"."solutions_manager"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_engagement_type_id_engagement_type_id_fk" FOREIGN KEY ("engagement_type_id") REFERENCES "public"."engagement_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_client_name" ADD CONSTRAINT "project_client_name_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_detail" ADD CONSTRAINT "project_detail_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_detail_team" ADD CONSTRAINT "project_detail_team_project_detail_id_project_detail_id_fk" FOREIGN KEY ("project_detail_id") REFERENCES "public"."project_detail"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_detail_team" ADD CONSTRAINT "project_detail_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_type_name_idx" ON "engagement_type" USING btree ("name");--> statement-breakpoint
CREATE INDEX "project_client_idx" ON "project" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "project_client_name_project_idx" ON "project_client_name" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_detail_project_idx" ON "project_detail" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_detail_team_detail_team_idx" ON "project_detail_team" USING btree ("project_detail_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_representative_name_idx" ON "sales_representative" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "solutions_manager_name_idx" ON "solutions_manager" USING btree ("name");--> statement-breakpoint
ALTER TABLE "employee_deployment" ADD CONSTRAINT "employee_deployment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;