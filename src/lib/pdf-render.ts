/**
 * Shared rendering plumbing for every client-side PDF export in this app
 * (Activity Reports, Employee Recommendation's ERF) — extracted out of
 * `activity-report-pdf.ts` once a second consumer needed the identical
 * isolation trick, rather than duplicating ~30 lines of non-trivial logic.
 */

export function waitForImages(root: HTMLElement): Promise<void> {
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
export function createIsolatedDocument(html: string): { iframe: HTMLIFrameElement; body: HTMLElement } {
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
    throw new Error("Could not prepare the export canvas.");
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0">${html}</body></html>`);
  doc.close();

  return { iframe, body: doc.body };
}
