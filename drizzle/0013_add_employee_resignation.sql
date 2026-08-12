ALTER TABLE "employee" ADD COLUMN "resignation_date" date;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "is_resigned" boolean DEFAULT false NOT NULL;