ALTER TABLE "one_lot_project_document" DROP COLUMN "blob_url";--> statement-breakpoint
ALTER TABLE "one_lot_project_document" RENAME COLUMN "blob_pathname" TO "storage_key";
