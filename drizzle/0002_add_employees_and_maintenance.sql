CREATE TYPE "public"."employee_address_type" AS ENUM('current', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('regular', 'probationary', 'contractual', 'project_based', 'consultant', 'intern');--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"gender_id" text NOT NULL,
	"mobile_number" text NOT NULL,
	"viber_number" text,
	"personal_email" text,
	"work_email" text,
	"team_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "employee_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employee_address" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"type" "employee_address_type" NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"province_code" text,
	"province_name" text,
	"city_code" text NOT NULL,
	"city_name" text NOT NULL,
	"barangay_code" text NOT NULL,
	"barangay_name" text NOT NULL,
	"address_line" text NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"client_id" text NOT NULL,
	"project" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_employment" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"salary" numeric(12, 2) NOT NULL,
	"level_id" text NOT NULL,
	"position_id" text NOT NULL,
	"employment_type" "employment_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gender" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_gender_id_gender_id_fk" FOREIGN KEY ("gender_id") REFERENCES "public"."gender"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_address" ADD CONSTRAINT "employee_address_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deployment" ADD CONSTRAINT "employee_deployment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_deployment" ADD CONSTRAINT "employee_deployment_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment" ADD CONSTRAINT "employee_employment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment" ADD CONSTRAINT "employee_employment_level_id_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."level"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment" ADD CONSTRAINT "employee_employment_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_name_idx" ON "client" USING btree ("name");--> statement-breakpoint
CREATE INDEX "employee_last_name_idx" ON "employee" USING btree ("last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_work_email_idx" ON "employee" USING btree ("work_email");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_address_employee_type_idx" ON "employee_address" USING btree ("employee_id","type");--> statement-breakpoint
CREATE INDEX "employee_deployment_employee_idx" ON "employee_deployment" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_deployment_employee_end_idx" ON "employee_deployment" USING btree ("employee_id","end_date");--> statement-breakpoint
CREATE INDEX "employee_employment_employee_idx" ON "employee_employment" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_employment_employee_end_idx" ON "employee_employment" USING btree ("employee_id","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "gender_name_idx" ON "gender" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "level_name_idx" ON "level" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "position_name_idx" ON "position" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "team_name_idx" ON "team" USING btree ("name");