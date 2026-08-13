import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const blogPost = readFileSync("src/pages/BlogPost.tsx", "utf8");

describe("public blog rich text formatting", () => {
  it("applies Quill formatting classes on published blog posts", () => {
    expect(blogPost).toContain("blog-rich-content");
    expect(css).toContain(".blog-rich-content .ql-size-large");
    expect(css).toContain(".blog-rich-content .ql-size-huge");
    expect(css).toContain(".blog-rich-content .ql-align-center");
    expect(css).toContain(".blog-rich-content .ql-align-justify");
    expect(css).toContain(".blog-rich-content .ql-indent-1");
  });
});
