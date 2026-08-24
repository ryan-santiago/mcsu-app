CREATE TYPE "public"."one_lot_project_document_type" AS ENUM('folder', 'file');--> statement-breakpoint
CREATE TABLE "one_lot_project_document" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_id" text,
	"type" "one_lot_project_document_type" NOT NULL,
	"name" text NOT NULL,
	"blob_url" text,
	"blob_pathname" text,
	"mime_type" text,
	"size" integer,
	"uploaded_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_lot_project_document" ADD CONSTRAINT "one_lot_project_document_project_id_one_lot_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_document" ADD CONSTRAINT "one_lot_project_document_parent_id_one_lot_project_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."one_lot_project_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_document" ADD CONSTRAINT "one_lot_project_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_lot_project_document_project_idx" ON "one_lot_project_document" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "one_lot_project_document_parent_idx" ON "one_lot_project_document" USING btree ("parent_id");