ALTER TABLE "one_lot_project_work_item" ALTER COLUMN "column_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."work_item_status";