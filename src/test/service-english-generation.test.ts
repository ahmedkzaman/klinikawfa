import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/editor/ServiceEditor.tsx", "utf8");

describe("service English generation", () => {
  it("offers Malay-to-English generation and fills all English fields", () => {
    expect(source).toContain("translate-service-content");
    expect(source).toContain("Generate English from Malay");
    expect(source).toContain("titleEn: data.title_en");
    expect(source).toContain("servicesEn: data.services_en");
  });
});
