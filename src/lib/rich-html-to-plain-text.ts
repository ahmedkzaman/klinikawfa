import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

/**
 * Converts editor HTML to safe, readable text for SEO and visible AEO copy.
 * DOM text extraction decodes named and numeric HTML entities, unlike a
 * regular-expression tag stripper.
 */
export function richHtmlToPlainText(html: string): string {
  if (!html) return "";

  const container = document.createElement("div");
  const sanitized = sanitizeRichHtml(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:address|article|aside|blockquote|div|h[1-6]|li|p|section)>/gi, "$& ");
  container.innerHTML = sanitized;

  return (container.textContent || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
