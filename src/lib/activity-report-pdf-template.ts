import type { ActivityReportDetail } from '@/server/activity-reports/types'

export type ActivityReportPdfData = {
	employeeName: string
	clientName: string
	projectName: string
	/** 1-indexed. */
	month: number
	year: number
	reports: ActivityReportDetail[]
}

export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

const displayDateFormatter = new Intl.DateTimeFormat('en-PH', {
	month: 'short',
	day: '2-digit',
	year: 'numeric',
})

function formatDisplayDate(isoDate: string): string {
	return displayDateFormatter.format(new Date(`${isoDate}T00:00:00`))
}

type PdfRow = {
	date: string
	timeIn: string
	timeOut: string
	otHours: string
	activityCode: string
	activityName: string
	description: string
	issueBlockers: string
}

/**
 * One row per activity line; the header fields (date/time/OT) repeat on
 * every line for a day with multiple activities, and an `on_leave` day gets
 * a single placeholder row — a flat table is what was asked for, not a
 * grouped one.
 */
function buildRows(reports: ActivityReportDetail[]): PdfRow[] {
	const rows: PdfRow[] = []

	for (const report of reports) {
		const date = formatDisplayDate(report.date)

		if (report.status === 'on_leave') {
			rows.push({
				date,
				timeIn: '—',
				timeOut: '—',
				otHours: '—',
				activityCode: '—',
				activityName: 'On Leave',
				description: '—',
				issueBlockers: '—',
			})
			continue
		}

		const timeIn = report.timeIn ?? '—'
		const timeOut = report.timeOut ?? '—'
		const otHours = report.otHours ?? '—'

		if (report.items.length === 0) {
			rows.push({
				date,
				timeIn,
				timeOut,
				otHours,
				activityCode: '—',
				activityName: '—',
				description: '—',
				issueBlockers: '—',
			})
			continue
		}

		for (const item of report.items) {
			rows.push({
				date,
				timeIn,
				timeOut,
				otHours,
				activityCode: item.activityCode,
				activityName: item.activityName,
				description: item.description,
				issueBlockers: item.issueBlockers?.trim() ? item.issueBlockers : '—',
			})
		}
	}

	return rows
}

/**
 * Renders the full Monthly Activity Report as a standalone HTML+CSS
 * fragment. `generateActivityReportPdf` (`activity-report-pdf.ts`) mounts
 * this into an isolated iframe document, not the live app page — the app's
 * global stylesheet defines its tokens with `oklch()`/`color-mix()`, which
 * `html2canvas` can't parse, so this template only ever uses hex/rgb colors
 * and system font stacks (no `var(--font-sans)`, no Tailwind classes) to
 * stay renderable inside that bare document. Everything about the report's
 * look — colors, spacing, columns — lives in this one file, so it can be
 * restyled without touching the export flow around it.
 */
export function buildActivityReportHtml(data: ActivityReportPdfData): string {
	const rows = buildRows(data.reports)
	const period = `${MONTH_NAMES[data.month - 1]} ${data.year}`
	const generatedOn = new Intl.DateTimeFormat('en-PH', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date())

	const rowsHtml =
		rows.length > 0
			? rows
					.map(
						(row) => `
        <tr>
          <td class="qnx-ar-nowrap">${escapeHtml(row.date)}</td>
          <td class="qnx-ar-nowrap">${escapeHtml(row.timeIn)}</td>
          <td class="qnx-ar-nowrap">${escapeHtml(row.timeOut)}</td>
          <td class="qnx-ar-nowrap qnx-ar-num">${escapeHtml(row.otHours)}</td>
          <td class="qnx-ar-nowrap">${escapeHtml(row.activityCode)}</td>
          <td>${escapeHtml(row.activityName)}</td>
          <td>${escapeHtml(row.description)}</td>
          <td>${escapeHtml(row.issueBlockers)}</td>
        </tr>`,
					)
					.join('')
			: `<tr><td colspan="8" class="qnx-ar-empty">No activity reports for this period.</td></tr>`

	return `
<div class="qnx-ar-page">
  <style>
    .qnx-ar-page {
      width: 1200px;
      box-sizing: border-box;
      padding: 44px 52px 36px;
      background: #ffffff;
      color: #1a1a1a;
      font-family: "Segoe UI", Arial, "Helvetica Neue", sans-serif;
      font-size: 13px;
      line-height: 1.4;
    }
    .qnx-ar-page * { box-sizing: border-box; }

    .qnx-ar-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 3px solid #000FBE;
    }
    .qnx-ar-title-eyebrow {
      margin: 0;
      color: #000FBE;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .qnx-ar-title {
      margin: 2px 0 0;
      color: #05061F;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.01em;
      text-transform: uppercase;
    }
    .qnx-ar-brand {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      text-align: right;
    }
    .qnx-ar-brand img {
      height: 46px;
      width: auto;
      object-fit: contain;
    }
    .qnx-ar-brand-info {
      font-size: 11px;
      color: #4b5563;
      line-height: 1.6;
    }
    .qnx-ar-brand-name {
      font-weight: 700;
      color: #05061F;
      font-size: 12.5px;
    }

    .qnx-ar-period {
      margin-top: 20px;
      background: #000FBE;
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.03em;
      padding: 9px 18px;
      border-radius: 6px;
      display: inline-block;
    }

    .qnx-ar-meta {
      margin-top: 18px;
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .qnx-ar-meta-item {
      flex: 1 1 220px;
      border: 1px solid #d8dbe6;
      border-radius: 8px;
      padding: 10px 16px;
      background: #f7f8fc;
    }
    .qnx-ar-meta-label {
      font-size: 10px;
      font-weight: 700;
      color: #000FBE;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .qnx-ar-meta-value {
      margin-top: 3px;
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }

    .qnx-ar-section {
      margin-top: 26px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .qnx-ar-section-badge {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: #16a34a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .qnx-ar-section-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #05061F;
    }

    .qnx-ar-table {
      margin-top: 10px;
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .qnx-ar-table th {
      background: #05061F;
      color: #ffffff;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-align: left;
      padding: 9px 10px;
      border: 1px solid #05061F;
    }
    .qnx-ar-table td {
      font-size: 11.5px;
      padding: 8px 10px;
      border: 1px solid #e2e4ee;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .qnx-ar-table tbody tr:nth-child(even) { background: #f7f8fc; }
    .qnx-ar-nowrap { white-space: nowrap; }
    .qnx-ar-num { font-variant-numeric: tabular-nums; }
    .qnx-ar-empty {
      text-align: center;
      color: #6b7280;
      padding: 28px 10px;
      font-style: italic;
    }

    .qnx-ar-footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #e2e4ee;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9ca3af;
    }
  </style>

  <div class="qnx-ar-header">
    <div>
      <p class="qnx-ar-title-eyebrow">Monthly</p>
      <h1 class="qnx-ar-title">Activity Report</h1>
    </div>
    <div class="qnx-ar-brand">
      <div class="qnx-ar-brand-info">
        178 Yakal Street, Makati City, Philippines<br />
        info@qnx.com.ph &nbsp;•&nbsp; (02) 8123 4567
      </div>
      <img src="/brand/qnx%20logo.png" alt="QNX Questronix" />
    </div>
  </div>

  <div class="qnx-ar-period">${escapeHtml(period)}</div>

  <div class="qnx-ar-meta">
    <div class="qnx-ar-meta-item">
      <div class="qnx-ar-meta-label">Employee</div>
      <div class="qnx-ar-meta-value">${escapeHtml(data.employeeName)}</div>
    </div>
    <div class="qnx-ar-meta-item">
      <div class="qnx-ar-meta-label">Client</div>
      <div class="qnx-ar-meta-value">${escapeHtml(data.clientName || '—')}</div>
    </div>
    <div class="qnx-ar-meta-item">
      <div class="qnx-ar-meta-label">Project</div>
      <div class="qnx-ar-meta-value">${escapeHtml(data.projectName || '—')}</div>
    </div>
  </div>

  <div class="qnx-ar-section">
    <span class="qnx-ar-section-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span class="qnx-ar-section-title">Activity Log</span>
  </div>

  <table class="qnx-ar-table">
    <colgroup>
      <col style="width: 9%" />
      <col style="width: 7%" />
      <col style="width: 7%" />
      <col style="width: 7%" />
      <col style="width: 9%" />
      <col style="width: 15%" />
      <col style="width: 24%" />
      <col style="width: 22%" />
    </colgroup>
    <thead>
      <tr>
        <th>Date</th>
        <th>Time In</th>
        <th>Time Out</th>
        <th>OT Hours</th>
        <th>ID</th>
        <th>Activity</th>
        <th>Description</th>
        <th>Issue / Blockers</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="qnx-ar-footer">
    <span>Generated via MCSU Console on ${escapeHtml(generatedOn)}</span>
    <span>www.questronix.com.ph</span>
  </div>
</div>`
}
