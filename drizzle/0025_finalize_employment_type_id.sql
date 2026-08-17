ALTER TABLE "employee_employment" ALTER COLUMN "employment_type_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_employment" DROP COLUMN "employment_type";--> statement-breakpoint
DROP TYPE "public"."employment_type";