import DOMPurify from "dompurify";

/**
 * Shared sanitizer for Quill-produced rich HTML.
 *
 * Quill 2.0.3 (used by `react-quill-new`) is affected by
 * GHSA-v3m3-f69x-jf25: Quill's HTML export can emit attacker-controlled
 * markup that becomes active when written to the DOM. No patched Quill
 * release exists yet. Until then, every location that inserts
 * Quill-exported HTML via `dangerouslySetInnerHTML` MUST route the string
 * through `sanitizeRichHtml` so the output DOMPurify config is applied
 * consistently at the rendering boundary.
 *
 * We deliberately do NOT sanitize on editor input or on save; that would
 * silently mutate stored content and require a separate rendering and
 * persistence regression pass. Sanitization here happens at the output
 * boundary only.
 */
const RICH_HTML_CONFIG = {
  ADD_TAGS: ["iframe", "video", "source"] as string[],
  ADD_ATTR: [
    "allow",
    "allowfullscreen",
    "frameborder",
    "scrolling",
    "controls",
    "target",
  ] as string[],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  FORBID_ATTR: ["style", "onerror", "onload", "onclick"] as string[],
};

export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, RICH_HTML_CONFIG) as unknown as string;
}
