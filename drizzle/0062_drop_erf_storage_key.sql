-- The generated ERF is no longer stored server-side — it's rendered
-- client-side and downloaded directly (see docs/EMPLOYEE_RECOMMENDATION.md
-- §7, decision 2026-08-27). `erf_generated_at`/`erf_generated_by` stay;
-- they record that generation happened and by whom, independent of whether
-- the file itself is kept anywhere.
ALTER TABLE "employee_recommendation" DROP COLUMN "erf_storage_key";
