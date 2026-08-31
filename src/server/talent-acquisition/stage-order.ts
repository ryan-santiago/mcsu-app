import type { TaStage } from "@/db/schema";

/**
 * The pipeline's stage order — the single source of truth for both the
 * per-request Kanban board (`ta-application-board.tsx`) and the checklist
 * (`stage-checklist.tsx`), which used to each hardcode their own copy of
 * this list. Deliberately omits `job_offer` (retired — see `taStage`'s
 * comment in `src/db/schema.ts`): Final Interview is the pipeline's last
 * stage now.
 */
export const TA_STAGE_ORDER: TaStage[] = [
  "l1_assessment",
  "l2_assessment",
  "client_interview",
  "l3_assessment",
  "final_interview",
];
