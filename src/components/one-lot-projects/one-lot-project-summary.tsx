import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/session";
import {
  listOneLotProjectActivity,
  listOneLotProjectMembers,
  listOneLotProjectS3pLinks,
} from "@/server/one-lot-projects/queries";

import { OneLotProjectMembersTable } from "./one-lot-project-members-table";
import { OneLotProjectPriorityBreakdown } from "./one-lot-project-priority-breakdown";
import { OneLotProjectRecentActivity } from "./one-lot-project-recent-activity";
import { OneLotProjectS3pLinksTable } from "./one-lot-project-s3p-links-table";
import { OneLotProjectStatCards } from "./one-lot-project-stat-cards";
import { OneLotProjectStatusOverview } from "./one-lot-project-status-overview";
import { OneLotProjectTeamWorkload } from "./one-lot-project-team-workload";
import { OneLotProjectTypesOfWork } from "./one-lot-project-types-of-work";

type OneLotProjectSummaryProps = {
  projectId: string;
  actor: CurrentUser;
};

export async function OneLotProjectSummary({ projectId, actor }: OneLotProjectSummaryProps) {
  const [members, s3pLinks, activity] = await Promise.all([
    listOneLotProjectMembers(projectId),
    listOneLotProjectS3pLinks(projectId),
    listOneLotProjectActivity(projectId, 10),
  ]);

  const canEdit = can(actor, "one_lot_projects:edit");
  const canDelete = can(actor, "one_lot_projects:delete");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OneLotProjectMembersTable projectId={projectId} members={members} canEdit={canEdit} canDelete={canDelete} />
        <OneLotProjectS3pLinksTable oneLotProjectId={projectId} links={s3pLinks} canEdit={canEdit} canDelete={canDelete} />
      </div>

      <OneLotProjectStatCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OneLotProjectStatusOverview />
        <OneLotProjectRecentActivity activity={activity} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OneLotProjectPriorityBreakdown />
        <OneLotProjectTypesOfWork />
      </div>

      <OneLotProjectTeamWorkload members={members} />
    </div>
  );
}
