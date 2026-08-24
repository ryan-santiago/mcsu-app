CREATE TABLE "one_lot_project_board_column" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD COLUMN "column_id" text;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD COLUMN "board_sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_lot_project_board_column" ADD CONSTRAINT "one_lot_project_board_column_project_id_one_lot_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_lot_project_board_column_project_idx" ON "one_lot_project_board_column" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_board_column_one_default_idx" ON "one_lot_project_board_column" USING btree ("project_id") WHERE "one_lot_project_board_column"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_board_column_one_done_idx" ON "one_lot_project_board_column" USING btree ("project_id") WHERE "one_lot_project_board_column"."is_done" = true;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_column_id_one_lot_project_board_column_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."one_lot_project_board_column"("id") ON DELETE restrict ON UPDATE no action;