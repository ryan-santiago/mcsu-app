export type TrendPoint = { date: string; count: number };
export type BreakdownRow = { label: string; count: number };

export type EmployeesDashboardData = {
  headcountNow: number;
  newHires: number;
  resignations: number;
  needsRecommendation: number;
  /** How many active employees have at least one employment record on file — the breakdowns below (and "new hires") are only as complete as this. */
  employmentRecordCoverage: { withRecord: number; total: number };
  headcountTrend: TrendPoint[];
  employmentTypeBreakdown: BreakdownRow[];
  teamBreakdown: BreakdownRow[];
  genderBreakdown: BreakdownRow[];
};

export type ProjectsDashboardData = {
  activeProjects: number;
  newProjects: number;
  deployedHeadcount: number;
  clientBreakdown: BreakdownRow[];
};

export type EmployeeRecommendationDashboardData = {
  submitted: number;
  pendingApproval: number;
  appliedToEmploymentHistory: number;
  statusBreakdown: BreakdownRow[];
};

export type WorkforceDashboardData = {
  employees: EmployeesDashboardData | null;
  projects: ProjectsDashboardData | null;
  employeeRecommendation: EmployeeRecommendationDashboardData | null;
};
