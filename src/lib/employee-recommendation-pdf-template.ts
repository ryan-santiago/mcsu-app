import type { RecommendationDetail } from "@/server/employee-recommendations/types";

import { formatDate, formatDateTime } from "./format";
import { formatSalary } from "./employee-format";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ActionRow = { label: string; checked: boolean; from: string; to: string };

/**
 * Effectivity Date is no longer captured on any Action Requested section —
 * the real effective date is whatever date Department Head approval lands
 * on (or, for Project-Hired/Probationary/contractual staff, whatever date
 * the new contract/record starts), not something the requester can predict
 * up front. The column stays on the printed ERF only because the paper
 * form has it; it's always left blank rather than removed, so this PDF
 * keeps matching the paper form's layout. See docs/EMPLOYEE_RECOMMENDATION.md.
 */
function buildActionRows(actions: RecommendationDetail["requestedActions"]): ActionRow[] {
  const empty = "—";

  return [
    {
      label: "Supervisor Change",
      checked: Boolean(actions.supervisorChange),
      from: actions.supervisorChange?.fromTeamName ?? empty,
      to: actions.supervisorChange?.toTeamName ?? empty,
    },
    {
      label: "Department Change",
      checked: Boolean(actions.departmentChange),
      from: actions.departmentChange?.from ?? empty,
      to: actions.departmentChange?.to ?? empty,
    },
    {
      label: "Job Title Change",
      checked: Boolean(actions.jobTitleChange),
      from: actions.jobTitleChange?.fromLabel ?? empty,
      to: actions.jobTitleChange?.toLabel ?? empty,
    },
    {
      label: "Division Change",
      checked: Boolean(actions.divisionChange),
      from: actions.divisionChange?.from ?? empty,
      to: actions.divisionChange?.to ?? empty,
    },
    {
      label: "Salary Change",
      checked: Boolean(actions.salaryChange),
      from: actions.salaryChange
        ? `Salary: ${formatSalary(actions.salaryChange.fromSalary)}\nComm. Allow.: ${formatSalary(actions.salaryChange.fromCommunicationAllowance)}\nTranspo. Allow.: ${formatSalary(actions.salaryChange.fromTransportationAllowance)}`
        : empty,
      to: actions.salaryChange
        ? `Salary: ${formatSalary(actions.salaryChange.toSalary)}\nComm. Allow.: ${formatSalary(actions.salaryChange.toCommunicationAllowance)}\nTranspo. Allow.: ${formatSalary(actions.salaryChange.toTransportationAllowance)}`
        : empty,
    },
    {
      label: "Category Change",
      checked: Boolean(actions.categoryChange),
      from: actions.categoryChange?.fromEmploymentTypeName ?? empty,
      to: actions.categoryChange
        ? [actions.categoryChange.toEmploymentTypeName, actions.categoryChange.toLabel].filter(Boolean).join(" — ")
        : empty,
    },
  ];
}

/** Multi-line cell values (e.g. Salary Change's three figures) use `\n` — rendered as `<br>` since this HTML fragment has no `white-space: pre-line` applied uniformly. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

/**
 * Renders the "QSERV – MCSU Employee Recommendation Form" as a standalone
 * HTML+CSS fragment, laid out to match the existing paper form exactly (see
 * docs/EMPLOYEE_RECOMMENDATION.md) — same isolated-iframe rendering
 * constraint as `activity-report-pdf-template.ts`: hex/rgb colors only, no
 * `oklch()`/Tailwind classes, since `html2canvas` renders this off the live
 * app's global stylesheet.
 */
export function buildEmployeeRecommendationErfHtml(recommendation: RecommendationDetail): string {
  const rows = buildActionRows(recommendation.requestedActions);
  const unitManagerStep = recommendation.approval?.steps.find((step) => step.roleLabel === "Unit Manager") ?? null;
  const departmentHeadStep = recommendation.approval?.steps.find((step) => step.roleLabel === "Department Head") ?? null;
  const generatedOn = formatDateTime(new Date());

  const rowsHtml = rows
    .map(
      (row) => `
      <tr>
        <td class="qnx-erf-check">
          <span class="qnx-erf-checkbox ${row.checked ? "qnx-erf-checkbox--on" : ""}"></span>
          ${escapeHtml(row.label)}
        </td>
        <td>${multiline(row.from)}</td>
        <td>${multiline(row.to)}</td>
        <td class="qnx-erf-nowrap"></td>
      </tr>`,
    )
    .join("");

  return `
<div class="qnx-erf-page">
  <style>
    .qnx-erf-page {
      width: 900px;
      box-sizing: border-box;
      padding: 40px 48px;
      background: #ffffff;
      color: #1a1a1a;
      font-family: "Segoe UI", Arial, "Helvetica Neue", sans-serif;
      font-size: 12px;
      line-height: 1.4;
    }
    .qnx-erf-page * { box-sizing: border-box; }

    .qnx-erf-brand { text-align: center; margin-bottom: 18px; }
    .qnx-erf-brand img { height: 44px; width: auto; object-fit: contain; }

    .qnx-erf-titlebar {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 3px solid #000FBE;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .qnx-erf-title { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.02em; color: #05061F; }
    .qnx-erf-confidential { margin: 0; font-size: 11px; font-weight: 700; font-style: italic; color: #dc2626; }

    .qnx-erf-section-header {
      background: #1e3a8a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 6px 12px;
    }

    .qnx-erf-info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .qnx-erf-info-table td {
      border: 1px solid #c7cbe0;
      padding: 6px 10px;
      font-size: 11.5px;
      vertical-align: top;
      width: 33.33%;
    }
    .qnx-erf-info-label { font-weight: 700; color: #1e3a8a; display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
    .qnx-erf-info-value { margin-top: 2px; }

    .qnx-erf-actions-table { width: 100%; border-collapse: collapse; margin-top: 0; margin-bottom: 16px; }
    .qnx-erf-actions-table th {
      background: #eef1fb;
      border: 1px solid #c7cbe0;
      color: #1e3a8a;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 6px 10px;
      text-align: left;
    }
    .qnx-erf-actions-table td {
      border: 1px solid #c7cbe0;
      padding: 7px 10px;
      font-size: 11px;
      vertical-align: top;
    }
    .qnx-erf-check { width: 22%; font-weight: 600; white-space: nowrap; }
    .qnx-erf-nowrap { white-space: nowrap; width: 14%; }
    .qnx-erf-checkbox {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 1.5px solid #1e3a8a;
      margin-right: 6px;
      vertical-align: middle;
      border-radius: 2px;
    }
    .qnx-erf-checkbox--on { background: #1e3a8a; }

    .qnx-erf-recommendation {
      border: 1px solid #c7cbe0;
      border-top: none;
      min-height: 140px;
      padding: 12px;
      font-size: 11.5px;
      margin-bottom: 16px;
    }
    .qnx-erf-recommendation p { margin: 0 0 8px; }
    .qnx-erf-recommendation p:last-child { margin-bottom: 0; }
    .qnx-erf-recommendation ul, .qnx-erf-recommendation ol { margin: 0 0 8px; padding-left: 20px; }
    .qnx-erf-recommendation-empty { color: #9ca3af; font-style: italic; }

    .qnx-erf-sign-table { width: 100%; border-collapse: collapse; }
    .qnx-erf-sign-table td {
      border: 1px solid #c7cbe0;
      padding: 8px 10px;
      font-size: 11px;
      vertical-align: top;
      width: 33.33%;
    }
    .qnx-erf-sign-label { font-weight: 700; color: #1e3a8a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; display: block; margin-bottom: 6px; }
    .qnx-erf-sign-name { font-weight: 600; }
    .qnx-erf-sign-date { color: #6b7280; font-size: 10px; margin-top: 2px; }
    .qnx-erf-sign-status {
      display: inline-block;
      margin-top: 8px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: #dcfce7;
      color: #15803d;
    }

    .qnx-erf-footer { margin-top: 20px; font-size: 9.5px; color: #9ca3af; text-align: center; }
  </style>

  <div class="qnx-erf-brand">
    <img src="/brand/qnx%20logo.png" alt="QNX Questronix" />
  </div>

  <div class="qnx-erf-titlebar">
    <h1 class="qnx-erf-title">QSERV &ndash; MCSU EMPLOYEE RECOMMENDATION FORM</h1>
    <p class="qnx-erf-confidential">HIGHLY CONFIDENTIAL</p>
  </div>

  <div class="qnx-erf-section-header">General Information</div>
  <table class="qnx-erf-info-table">
    <tr>
      <td><span class="qnx-erf-info-label">Submitted by</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.submittedByName)}</span></td>
      <td colspan="2"><span class="qnx-erf-info-label">Date Filed</span><span class="qnx-erf-info-value">${escapeHtml(formatDate(recommendation.createdAt))}</span></td>
    </tr>
    <tr>
      <td><span class="qnx-erf-info-label">Employee Name</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.employeeName)}</span></td>
      <td colspan="2"><span class="qnx-erf-info-label">Employee Number</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.employeeNumberSnapshot ?? "—")}</span></td>
    </tr>
    <tr>
      <td><span class="qnx-erf-info-label">Department</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.departmentSnapshot)}</span></td>
      <td><span class="qnx-erf-info-label">Position</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.positionSnapshot)}</span></td>
      <td><span class="qnx-erf-info-label">Manager</span><span class="qnx-erf-info-value">${escapeHtml(recommendation.managerNameSnapshot)}</span></td>
    </tr>
  </table>

  <div class="qnx-erf-section-header">Actions Requested</div>
  <table class="qnx-erf-actions-table">
    <thead>
      <tr>
        <th>Action</th>
        <th>From</th>
        <th>To</th>
        <th>Effective Date</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="qnx-erf-section-header">Accomplishments, Contributions &amp; Final Recommendation</div>
  <div class="qnx-erf-recommendation">
    ${recommendation.accomplishmentsAndRecommendation?.trim() ? recommendation.accomplishmentsAndRecommendation : '<p class="qnx-erf-recommendation-empty">None provided.</p>'}
  </div>

  <table class="qnx-erf-sign-table">
    <tr>
      <td>
        <span class="qnx-erf-sign-label">Endorsed by</span>
        <div class="qnx-erf-sign-name">${escapeHtml(recommendation.submittedByName)}</div>
        <div class="qnx-erf-sign-date">${escapeHtml(formatDate(recommendation.createdAt))}</div>
      </td>
      <td>
        <span class="qnx-erf-sign-label">Recommending Approval</span>
        <div class="qnx-erf-sign-name">${escapeHtml(unitManagerStep?.approverName ?? "—")}</div>
        <div class="qnx-erf-sign-date">${escapeHtml(unitManagerStep?.decidedAt ? formatDate(unitManagerStep.decidedAt) : "—")}</div>
        ${unitManagerStep?.status === "approved" ? '<span class="qnx-erf-sign-status">Approved</span>' : ""}
      </td>
      <td>
        <span class="qnx-erf-sign-label">Final Approval</span>
        <div class="qnx-erf-sign-name">${escapeHtml(departmentHeadStep?.approverName ?? "—")}</div>
        <div class="qnx-erf-sign-date">${escapeHtml(departmentHeadStep?.decidedAt ? formatDate(departmentHeadStep.decidedAt) : "—")}</div>
        ${departmentHeadStep?.status === "approved" ? '<span class="qnx-erf-sign-status">Approved</span>' : ""}
      </td>
    </tr>
  </table>

  <div class="qnx-erf-footer">Generated via MCSU Console on ${escapeHtml(generatedOn)} &nbsp;&bull;&nbsp; www.questronix.com.ph</div>
</div>`;
}
