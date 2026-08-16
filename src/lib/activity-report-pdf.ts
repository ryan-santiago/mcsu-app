import { buildActivityReportHtml, type ActivityReportPdfData } from "./activity-report-pdf-template";

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  ).then(() => undefined);
}

/**
 * A same-origin blank iframe's initial document inherits its creator's base
 * URL, so a relative `/brand/...` image `src` still resolves — but its
 * `document.write()`'d content otherwise has none of the app's stylesheet.
 * That isolation is the point: `html2canvas` walks up to `<html>`/`<body>`
 * for computed styles, and this app's global CSS uses `oklch()`/
 * `color-mix()`, which `html2canvas` throws on. A real DOM node in the live
 * page — however far off-screen — still has those ancestors; a fresh iframe
 * document doesn't.
 */
function createIsolatedDocument(html: string): { iframe: HTMLIFrameElement; body: HTMLElement } {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "0";
  iframe.style.left = "-10000px";
  iframe.style.width = "1200px";
  iframe.style.height = "3000px";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Could not prepare the report canvas.");
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0">${html}</body></html>`);
  doc.close();

  return { iframe, body: doc.body };
}

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
