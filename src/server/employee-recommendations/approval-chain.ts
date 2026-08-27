/**
 * Which roles must approve an Employee Recommendation, in order. Always
 * Unit Manager then Department Head today — the paper form's "Recommending
 * Approval" and "Final Approval" boxes. See docs/EMPLOYEE_RECOMMENDATION.md
 * §2 open question 1 and §5.2: the source process hinted some recommendations
 * might only need one approver, but the exact rule was never confirmed, so
 * this stays a single pluggable function rather than a guess baked into the
 * submit action — change it here, not at every call site.
 */
export type ApprovalChainStep = {
  roleId: "unit_manager" | "department_head";
  roleLabel: string;
};

export function resolveApprovalChain(): ApprovalChainStep[] {
  return [
    { roleId: "unit_manager", roleLabel: "Unit Manager" },
    { roleId: "department_head", roleLabel: "Department Head" },
  ];
}
