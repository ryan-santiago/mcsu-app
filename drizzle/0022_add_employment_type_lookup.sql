CREATE TABLE "employment_type_lookup" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_employment" ADD COLUMN "employment_type_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "employment_type_lookup_name_idx" ON "employment_type_lookup" USING btree ("name");--> statement-breakpoint
ALTER TABLE "employee_employment" ADD CONSTRAINT "employee_employment_employment_type_id_employment_type_lookup_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "public"."employment_type_lookup"("id") ON DELETE restrict ON UPDATE no action;