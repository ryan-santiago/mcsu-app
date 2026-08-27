import { buildEmployeeRecommendationErfHtml } from "./employee-recommendation-pdf-template";
import { createIsolatedDocument, waitForImages } from "./pdf-render";

import type { RecommendationDetail } from "@/server/employee-recommendations/types";

/** `Employee Name - Recommendation.pdf`, safe as a filename. */
export function erfFileName(employeeName: string): string {
  return `${employeeName.trim().replace(/\s+/g, "-")}-Recommendation.pdf`;
}

/**
 * Renders `buildEmployeeRecommendationErfHtml` off-screen and rasterizes it
 * to a single-page (or, if the recommendation text runs long, multi-page)
 * portrait A4 PDF — same isolated-iframe technique as
 * `activity-report-pdf.ts`, via the shared `pdf-render.ts` helpers.
 * Returns the PDF as a `Blob` rather than triggering a download directly,
 * since the caller needs the same bytes both for the user's download and
 * for the server-side copy saved alongside the recommendation (see
 * docs/EMPLOYEE_RECOMMENDATION.md §7).
 */
export async function generateEmployeeRecommendationErfPdf(recommendation: RecommendationDetail): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  const { iframe, body } = createIsolatedDocument(buildEmployeeRecommendationErfHtml(recommendation));

  try {
    await waitForImages(body);

    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      width: body.scrollWidth,
      height: body.scrollHeight,
      windowWidth: body.scrollWidth,
      windowHeight: body.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    const imageData = canvas.toDataURL("image/jpeg", 0.92);

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

    return pdf.output("blob");
  } finally {
    document.body.removeChild(iframe);
  }
}
