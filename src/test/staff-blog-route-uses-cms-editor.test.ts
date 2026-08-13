import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("staff blog routing", () => {
  it("routes staff blog pages through the CMS-backed post editor", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

    expect(app).toContain('<Route path="website/blog" element={<BlogEditorList />} />');
    expect(app).toContain('<Route path="website/blog/:id" element={<BlogWebsiteEditor />} />');
    expect(app).not.toContain('<Route path="website/blog" element={<BlogManagement />} />');
    expect(app).not.toContain('<Route path="website/blog/:id" element={<BlogEditor />} />');
  });
});
