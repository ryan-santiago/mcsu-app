import "server-only";

import { asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  client,
  engagementType,
  project,
  projectClientName,
  projectDetail,
  projectDetailTeam,
  salesRepresentative,
  solutionsManager,
  team,
} from "@/db/schema";
import { authorize } from "@/lib/session";

import type { ProjectDetail, ProjectFilters, ProjectListResult, ProjectOption, ProjectSearchOption } from "./types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function buildWhere(filters: ProjectFilters): SQL | undefined {
  const search = filters.search?.trim();
  if (!search) return undefined;

  const pattern = `%${search}%`;
  return or(ilike(project.s3pNumber, pattern), ilike(project.name, pattern), ilike(client.name, pattern));
}

/** Per-project sums across its S3P detail lines — gross profit is the difference, computed where displayed. */
function projectTotalsSubquery() {
  return db
    .select({
      projectId: projectDetail.projectId,
      totalContractPrice: sql<string>`coalesce(sum(${projectDetail.contractPrice}), 0)`.as("total_contract_price"),
      totalEstimatedCost: sql<string>`coalesce(sum(${projectDetail.estimatedCost}), 0)`.as("total_estimated_cost"),
    })
    .from(projectDetail)
    .groupBy(projectDetail.projectId)
    .as("project_totals");
}

/**
 * Lists projects for the directory table, each row carrying its S3P detail
 * totals via a `GROUP BY` subquery — the aggregate-sum counterpart to
 * `listEmployees()`'s `DISTINCT ON` "latest row" subqueries.
 */
export async function listProjects(filters: ProjectFilters = {}): Promise<ProjectListResult> {
  await authorize("projects:read");

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

  const where = buildWhere(filters);
  const totals = projectTotalsSubquery();

  const rows = await db
    .select({
      id: project.id,
      s3pNumber: project.s3pNumber,
      name: project.name,
      clientId: project.clientId,
      clientName: client.name,
      engagementTypeId: project.engagementTypeId,
      engagementTypeName: engagementType.name,
      startDate: project.startDate,
      endDate: project.endDate,
      totalContractPrice: totals.totalContractPrice,
      totalEstimatedCost: totals.totalEstimatedCost,
    })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .leftJoin(engagementType, eq(engagementType.id, project.engagementTypeId))
    .leftJoin(totals, eq(totals.projectId, project.id))
    .where(where)
    .orderBy(desc(project.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .where(where);

  return {
    projects: rows.map((row) => ({
      ...row,
      totalContractPrice: row.totalContractPrice ?? "0",
      totalEstimatedCost: row.totalEstimatedCost ?? "0",
    })),
    total,
    page,
    pageSize,
  };
}

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  await authorize("projects:read");

  const [row] = await db
    .select({
      id: project.id,
      s3pNumber: project.s3pNumber,
      name: project.name,
      clientId: project.clientId,
      clientName: client.name,
      salesRepresentativeId: project.salesRepresentativeId,
      salesRepresentativeName: salesRepresentative.name,
      solutionsManagerId: project.solutionsManagerId,
      solutionsManagerName: solutionsManager.name,
      engagementTypeId: project.engagementTypeId,
      engagementTypeName: engagementType.name,
      startDate: project.startDate,
      endDate: project.endDate,
    })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .leftJoin(salesRepresentative, eq(salesRepresentative.id, project.salesRepresentativeId))
    .leftJoin(solutionsManager, eq(solutionsManager.id, project.solutionsManagerId))
    .leftJoin(engagementType, eq(engagementType.id, project.engagementTypeId))
    .where(eq(project.id, id))
    .limit(1);

  if (!row) return null;

  const clientNames = await db
    .select({ id: projectClientName.id, name: projectClientName.name })
    .from(projectClientName)
    .where(eq(projectClientName.projectId, id))
    .orderBy(asc(projectClientName.createdAt));

  const lineRows = await db
    .select({
      id: projectDetail.id,
      description: projectDetail.description,
      contractPrice: projectDetail.contractPrice,
      estimatedCost: projectDetail.estimatedCost,
    })
    .from(projectDetail)
    .where(eq(projectDetail.projectId, id))
    .orderBy(asc(projectDetail.createdAt));

  const teamRows = lineRows.length
    ? await db
        .select({
          projectDetailId: projectDetailTeam.projectDetailId,
          teamId: team.id,
          teamName: team.name,
        })
        .from(projectDetailTeam)
        .innerJoin(team, eq(team.id, projectDetailTeam.teamId))
        .where(
          inArray(
            projectDetailTeam.projectDetailId,
            lineRows.map((line) => line.id),
          ),
        )
    : [];

  const teamsByLine = new Map<string, { id: string; name: string }[]>();
  for (const teamRow of teamRows) {
    const list = teamsByLine.get(teamRow.projectDetailId) ?? [];
    list.push({ id: teamRow.teamId, name: teamRow.teamName });
    teamsByLine.set(teamRow.projectDetailId, list);
  }

  return {
    ...row,
    clientNames,
    lineItems: lineRows.map((line) => ({ ...line, teams: teamsByLine.get(line.id) ?? [] })),
  };
}

/**
 * Options for the Employee deployment form's Project picker, optionally
 * scoped to a single client (a deployment's project must belong to its
 * client). Deliberately **not** authorization-gated here — callers authorize
 * for their own permission (`employees:edit`, not `projects:read`) before
 * calling this, the same convention as `listLookupOptions()` in
 * `src/server/maintenance/queries.ts`.
 */
export async function listProjectOptions(clientId?: string): Promise<ProjectOption[]> {
  return db
    .select({
      id: project.id,
      name: project.name,
      clientId: project.clientId,
      startDate: project.startDate,
      endDate: project.endDate,
    })
    .from(project)
    .where(clientId ? eq(project.clientId, clientId) : undefined)
    .orderBy(asc(project.name));
}

/**
 * Search-only picker for flows outside the Projects module that need to
 * attach a specific project by name or S3P number (e.g. Staff Augmentation's
 * "add this to deployment history" shortcut). Deliberately not
 * authorization-gated — same convention as `listProjectOptions` above:
 * callers authorize on their own module's edit permission first. Capped
 * rather than paginated since it's feeding a dropdown, not a directory.
 */
export async function searchProjectOptions(search: string): Promise<ProjectSearchOption[]> {
  const term = search.trim();
  const where = term ? or(ilike(project.s3pNumber, `%${term}%`), ilike(project.name, `%${term}%`)) : undefined;

  return db
    .select({
      id: project.id,
      s3pNumber: project.s3pNumber,
      name: project.name,
      clientId: project.clientId,
      startDate: project.startDate,
      endDate: project.endDate,
    })
    .from(project)
    .where(where)
    .orderBy(asc(project.name))
    .limit(20);
}
