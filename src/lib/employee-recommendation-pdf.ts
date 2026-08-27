import { buildEmployeeRecommendationErfHtml } from "./employee-recommendation-pdf-template";
import { createIsolatedDocument, waitForImages } from "./pdf-render";

import type { RecommendationDetail } from "@/server/employee-recommendations/types";

/** `Employee Name - Recommendation.pdf`, safe as a filename. */
export function erfFileName(employeeName: string): string {
  return `${employeeName.trim().replace(/\s+/g, "-")}-Recommendation.pdf`;
}

/**
 * Renders `buildEmployeeRecommendationErfHtml` off-screen, rasterizes it to
 * a single-page (or, if the recommendation text runs long, multi-page)
 * portrait Letter PDF, and downloads it directly — same isolated-iframe
 * technique and same `pdf.save()` pattern as `activity-report-pdf.ts`, via
 * the shared `pdf-render.ts` helpers. Nothing is kept server-side (see
 * docs/EMPLOYEE_RECOMMENDATION.md §7) — this download is the only copy.
 */
export async function generateEmployeeRecommendationErfPdf(recommendation: RecommendationDetail): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  const { iframe, body } = createIsolatedDocument(buildEmployeeRecommendationErfHtml(recommendation));

  try {
    await waitForImages(body);

    // Capture the page div itself, not `body` — the iframe (and so `body`)
    // is a fixed 1200px wide, while `.qnx-erf-page` is only 900px; capturing
    // `body` pulled in ~300px of blank margin to the right of the real
    // content, which then got stretched into the PDF along with everything
    // else, leaving a wide dead strip down the right edge of the page.
    const pageEl = body.querySelector<HTMLElement>(".qnx-erf-page") ?? body;

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      width: pageEl.scrollWidth,
      height: pageEl.scrollHeight,
      windowWidth: pageEl.scrollWidth,
      windowHeight: pageEl.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth;
    let imageHeight = (canvas.height * imageWidth) / canvas.width;
    const imageData = canvas.toDataURL("image/jpeg", 0.92);

    // A one-page recommendation (the common case — most sections are
    // toggled off and Accomplishments is short) naturally renders shorter
    // than the page, leaving dead space below the signature block. Stretch
    // it to fill the page in that case only — once it's already
    // multi-page, stretching would throw off where each page's slice
    // falls, so leave that case at its natural, unstretched size.
    if (imageHeight < pageHeight) {
      imageHeight = pageHeight;
    }

    let heightRemaining = imageHeight;
    let position = 0;

    pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight);
    heightRemaining -= pageHeight;

    while (heightRemaining > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight);
      heightRemaining -= pageHeight;
    }

    pdf.save(erfFileName(recommendation.employeeName));
  } finally {
    document.body.removeChild(iframe);
  }
}
