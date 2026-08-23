ALTER TABLE "one_lot_project_member" DROP CONSTRAINT "one_lot_project_member_employee_id_employee_id_fk";
--> statement-breakpoint
DROP INDEX "one_lot_project_member_project_employee_idx";--> statement-breakpoint
ALTER TABLE "one_lot_project_member" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "one_lot_project_member_project_user_idx" ON "one_lot_project_member" USING btree ("project_id","user_id");--> statement-breakpoint
ALTER TABLE "one_lot_project_member" DROP COLUMN "employee_id";