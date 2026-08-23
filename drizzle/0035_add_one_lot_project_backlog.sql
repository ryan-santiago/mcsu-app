CREATE TYPE "public"."sprint_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."work_item_priority" AS ENUM('highest', 'high', 'medium', 'low', 'lowest');--> statement-breakpoint
CREATE TYPE "public"."work_item_status" AS ENUM('todo', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."work_item_type" AS ENUM('task', 'bug');--> statement-breakpoint
CREATE TABLE "one_lot_project_sprint" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"item_code" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"goal" text,
	"status" "sprint_status" DEFAULT 'planned' NOT NULL,
	"next_item_number" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_lot_project_work_item" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sprint_id" text,
	"parent_id" text,
	"code" text NOT NULL,
	"type" "work_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "work_item_status" DEFAULT 'todo' NOT NULL,
	"priority" "work_item_priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" text,
	"due_date" date,
	"story_points" numeric(5, 1),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_lot_project_work_item_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"work_item_id" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_lot_project" ADD COLUMN "next_backlog_item_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_lot_project_sprint" ADD CONSTRAINT "one_lot_project_sprint_project_id_one_lot_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_sprint" ADD CONSTRAINT "one_lot_project_sprint_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_project_id_one_lot_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."one_lot_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_sprint_id_one_lot_project_sprint_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."one_lot_project_sprint"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_parent_id_one_lot_project_work_item_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."one_lot_project_work_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item" ADD CONSTRAINT "one_lot_project_work_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item_comment" ADD CONSTRAINT "one_lot_project_work_item_comment_work_item_id_one_lot_project_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."one_lot_project_work_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_lot_project_work_item_comment" ADD CONSTRAINT "one_lot_project_work_item_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_lot_project_sprint_project_idx" ON "one_lot_project_sprint" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_sprint_one_active_idx" ON "one_lot_project_sprint" USING btree ("project_id") WHERE "one_lot_project_sprint"."status" = 'active';--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_project_idx" ON "one_lot_project_work_item" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_sprint_idx" ON "one_lot_project_work_item" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_parent_idx" ON "one_lot_project_work_item" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_assignee_idx" ON "one_lot_project_work_item" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_board_idx" ON "one_lot_project_work_item" USING btree ("project_id","sprint_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_work_item_project_code_idx" ON "one_lot_project_work_item" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "one_lot_project_work_item_comment_work_item_idx" ON "one_lot_project_work_item_comment" USING btree ("work_item_id");