/** A project row as rendered by the Projects directory table. */
export type ProjectListRow = {
  id: string;
  s3pNumber: string;
  name: string;
  clientId: string;
  clientName: string;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Summed across this project's S3P details. */
  totalContractPrice: string;
  totalEstimatedCost: string;
};

export type ProjectFilters = {
  search?: string;
  /** 1-indexed. */
  page?: number;
  pageSize?: number;
};

export type ProjectListResult = {
  projects: ProjectListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProjectClientNameRow = { id: string; name: string };

export type ProjectTeamRow = { id: string; name: string };

/** One S3P financial line. `estimatedGrossProfit` isn't stored — it's `contractPrice - estimatedCost`. */
export type ProjectLineItemRow = {
  id: string;
  description: string;
  contractPrice: string;
  estimatedCost: string;
  teams: ProjectTeamRow[];
};

export type ProjectDetail = {
  id: string;
  s3pNumber: string;
  name: string;
  clientId: string;
  clientName: string;
  salesRepresentativeId: string | null;
  salesRepresentativeName: string | null;
  solutionsManagerId: string | null;
  solutionsManagerName: string | null;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
  startDate: string | null;
  endDate: string | null;
  clientNames: ProjectClientNameRow[];
  lineItems: ProjectLineItemRow[];
};

/**
 * For the Employee deployment form's Project picker — filterable by
 * `clientId`, and carrying the project's own date range so a deployment
 * record can optionally adopt it instead of a manual entry.
 */
export type ProjectOption = {
  id: string;
  name: string;
  clientId: string;
  startDate: string | null;
  endDate: string | null;
  engagementTypeId: string | null;
  engagementTypeName: string | null;
};

/**
 * Search-only picker result for flows outside the Projects module that need
 * to attach a specific project (e.g. Staff Augmentation's "add this to
 * deployment history" shortcut) — carries `s3pNumber` so the picker can
 * disambiguate same-named projects, unlike the plain `ProjectOption` above.
 */
export type ProjectSearchOption = {
  id: string;
  s3pNumber: string;
  name: string;
  clientId: string;
  startDate: string | null;
  endDate: string | null;
};
