import { buildActivityReportHtml, type ActivityReportPdfData } from "./activity-report-pdf-template";
import { createIsolatedDocument, waitForImages } from "./pdf-render";

/**
 * Renders `buildActivityReportHtml` off-screen, rasterizes it with
 * `html2canvas`, and slices the result across A4 landscape pages in a
 * downloaded PDF. `html2canvas`/`jspdf` are dynamically imported so the
 * ~500KB of PDF-rendering code only loads when someone actually clicks
 * "Export report", not on every Activity Report page view.
 */
export async function generateActivityReportPdf(data: ActivityReportPdfData): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

  const { iframe, body } = createIsolatedDocument(buildActivityReportHtml(data));

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

    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    // JPEG, not PNG — a lossless raster of a mostly-white document (fine
    // hairline borders, antialiased text) compresses poorly under PNG;
    // JPEG at high quality keeps the file in the low single-digit MB range
    // instead of tens of MB, with no visible loss at this content type.
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

    const monthLabel = String(data.month).padStart(2, "0");
    const fileSafeName = data.employeeName.trim().replace(/\s+/g, "-");
    pdf.save(`Activity-Report-${fileSafeName}-${data.year}-${monthLabel}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
