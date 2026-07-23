import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const tailwind = readFileSync("tailwind.config.ts", "utf8");

describe("Trusted Family Clinic design system", () => {
  it("defines the approved public palette", () => {
    expect(css).toContain("#241C6B");
    expect(css).toContain("#172033");
    expect(css).toContain("#F8FAFC");
    expect(css).toContain("#E9EEF8");
    expect(css).toContain("#C83B4A");
    expect(css).toContain("#16A765");
  });

  it("maps public semantic variables to the exact approved palette values", () => {
    expect(css).toContain("--primary: 246.07594936708858 58.51851851851851% 26.47058823529412%;");
    expect(css).toContain("--foreground: 220.71428571428572 37.83783783783783% 14.50980392156863%;");
    expect(css).toContain("--background: 210 40% 98.03921568627452%;");
    expect(css).toContain("--muted: 220 51.72413793103448% 94.31372549019608%;");
    expect(css).toContain("--accent: 353.6170212765957 56.17529880478088% 50.78431372549019%;");
    expect(css).toContain("--whatsapp: 152.68965517241378 76.71957671957671% 37.05882352941177%;");
    expect(css.match(/--whatsapp-foreground: 220\.71428571428572 37\.83783783783783% 14\.50980392156863%;/g)).toHaveLength(2);
  });

  it("uses the approved display and body typefaces", () => {
    expect(css).toContain("Manrope");
    expect(css).toContain("Atkinson Hyperlegible");
    expect(tailwind).toContain('display: ["Manrope"');
    expect(tailwind).toContain('sans: ["Atkinson Hyperlegible"');
  });

  it("retains focus and reduced-motion safeguards without persistent decorative animation", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation-duration: 0.01ms !important;");
    expect(css).toContain("animation-iteration-count: 1 !important;");
    expect(css).not.toMatch(/animation:\s*[^;]*\binfinite\b/);
    expect(tailwind).not.toMatch(/:\s*"[^"]*\binfinite\b/);
  });

  it("describes semantic palette tokens with their approved values", () => {
    expect(css).toContain("/* Primary - Awfa indigo #241C6B */");
    expect(css).toContain("/* Accent - restrained coral #C83B4A */");
    expect(css).not.toContain("#261d84 toned");
    expect(css).not.toContain("#c2272c toned");
  });
});
