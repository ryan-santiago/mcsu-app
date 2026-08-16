CREATE TYPE "public"."device_status" AS ENUM('available', 'deployed', 'under_repair', 'retired');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('laptop', 'phone');--> statement-breakpoint
CREATE TABLE "device" (
	"id" text PRIMARY KEY NOT NULL,
	"device_type" "device_type" NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"os" text NOT NULL,
	"serial_number" text NOT NULL,
	"purchase_date" date NOT NULL,
	"status" "device_status" DEFAULT 'available' NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "device_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "device_deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_deployment" ADD CONSTRAINT "device_deployment_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_deployment" ADD CONSTRAINT "device_deployment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_serial_number_idx" ON "device" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "device_deployment_device_idx" ON "device_deployment" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_deployment_device_end_idx" ON "device_deployment" USING btree ("device_id","end_date");--> statement-breakpoint
CREATE INDEX "device_deployment_employee_idx" ON "device_deployment" USING btree ("employee_id");