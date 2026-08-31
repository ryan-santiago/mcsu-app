-- Talent Acquisition workflow redesign: new `talent_acquisition:l3_assess`
-- permission (L3 Interview/Assessment, incl. background check) — grant it to
-- the same roles that already hold `l1_assess` (TA Staff/Manager run L3 too,
-- same as they run L1) plus Admin/Dept Head/Unit Manager, who already hold
-- every stage permission.
UPDATE "role"
SET "permissions" = (
	SELECT jsonb_agg(DISTINCT val)
	FROM jsonb_array_elements_text(
		"permissions" || '["talent_acquisition:l3_assess"]'::jsonb
	) AS val
)
WHERE "id" IN ('admin', 'department_head', 'unit_manager', 'talent_acquisition_staff', 'talent_acquisition_manager');
