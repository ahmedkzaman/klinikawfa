import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/DoctorOnDuty.tsx", "utf8");

describe("DoctorOnDuty shift card prominence", () => {
  it("uses larger card, photo, and doctor-name sizing for the public duty schedule", () => {
    expect(source).toContain("max-w-5xl");
    expect(source).toContain("gap-6");
    expect(source).toContain("p-5 flex items-center justify-between");
    expect(source).toContain("p-6 min-h-[260px]");
    expect(source).toContain("width={128}");
    expect(source).toContain("height={128}");
    expect(source).toContain("h-32 w-32");
    expect(source).toContain("text-xl font-bold");
    expect(source).toContain("border-white bg-white text-[#261d84] hover:bg-white/90");
  });
});
