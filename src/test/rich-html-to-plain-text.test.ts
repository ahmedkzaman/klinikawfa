import { describe, expect, it } from "vitest";
import { richHtmlToPlainText } from "@/lib/rich-html-to-plain-text";

describe("richHtmlToPlainText", () => {
  it("decodes editor entities and removes markup without joining words", () => {
    const html =
      "<h1>Telinga&nbsp;Tersumbat</h1><p>Doktor&#39;s&nbsp;assessment &amp; care.</p>";

    expect(richHtmlToPlainText(html)).toBe(
      "Telinga Tersumbat Doktor's assessment & care.",
    );
  });

  it("collapses non-breaking Unicode spaces and repeated whitespace", () => {
    expect(richHtmlToPlainText("Rawatan\u00a0\u00a0telinga\n  Kuantan")).toBe(
      "Rawatan telinga Kuantan",
    );
  });
});
