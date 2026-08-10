import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

describe("public service rich text font sizes", () => {
  it("maps Quill size classes to visible public font sizes", () => {
    expect(css).toContain(".service-rich-content .ql-size-large");
    expect(css).toContain(".service-rich-content .ql-size-huge");
    expect(css).toContain("overflow-wrap: break-word");
    expect(css).toContain("word-break: normal");
    expect(css).toContain("hyphens: manual");
    expect(css).toContain(".service-rich-content .ql-align-center");
    expect(css).toContain(".service-rich-content .ql-align-justify");
    expect(css).not.toContain("overflow-wrap: anywhere");
  });
});
