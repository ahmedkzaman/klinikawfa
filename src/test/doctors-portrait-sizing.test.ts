import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Doctors portrait sizing", () => {
  it("uses large responsive sizes for doctor photos and fallbacks without changing staff thumbnails", () => {
    const source = readFileSync("src/pages/Doctors.tsx", "utf8");
    expect(source.match(/h-\[170px\] w-\[170px\]/g)).toHaveLength(2);
    expect(source.match(/md:h-\[220px\] md:w-\[220px\]/g)).toHaveLength(2);
    expect(source).toContain('className="h-14 w-14 rounded-2xl object-cover"');
  });
});
