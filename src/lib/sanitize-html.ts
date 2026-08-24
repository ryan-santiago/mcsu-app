import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * The exact tag/attribute set the One-Lot Projects rich text editor
 * (`RichTextEditor`, built on Tiptap's `StarterKit` + `Link`) can produce.
 * Keep this in sync with that editor's extensions — anything the editor
 * can't create should be stripped here, not silently allowed through.
 */
const ALLOWED_TAGS = ["p", "br", "strong", "em", "s", "code", "pre", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "a", "hr"];

/**
 * Strips anything outside the rich text editor's own feature set before a
 * description/comment reaches the database — the editor's output is trusted
 * client-side, but nothing server-side should assume a request body actually
 * came from that editor rather than a direct API call.
 */
export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  }).trim();
}
