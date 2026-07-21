import DOMPurify from "dompurify";

import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

const GENERAL_PAGE_RICH_TEXT_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
] as string[];

const GENERAL_PAGE_RICH_TEXT_ATTRIBUTES = [
  "dir",
  "href",
  "lang",
  "rel",
  "target",
  "title",
] as string[];

/**
 * General-page body HTML is text-only rich content. Its output policy is a
 * positive allowlist so newly discovered resource elements and attributes do
 * not become active in either the public renderer or its live preview.
 */
export function sanitizeGeneralPageHtml(html: string): string {
  if (!html) return "";

  return DOMPurify.sanitize(sanitizeRichHtml(html), {
    ALLOWED_ATTR: GENERAL_PAGE_RICH_TEXT_ATTRIBUTES,
    ALLOWED_TAGS: GENERAL_PAGE_RICH_TEXT_TAGS,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
  }) as unknown as string;
}
