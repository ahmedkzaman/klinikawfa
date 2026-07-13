import { describe, it, expect } from "vitest";
import { resolveServiceCategorySlug, SERVICE_CATEGORY_SLUG_MAP } from "@/lib/serviceSlugMap";
import { SERVICES } from "@/lib/constants";

const DB_SLUGS = ["rawatan-am", "prosedur-minor", "pemeriksaan-kesihatan"] as const;

const EXPECTED: Record<string, (typeof DB_SLUGS)[number]> = {
  // rawatan-am
  "rawatan-umum": "rawatan-am",
  "sakit-tekak-selsema-demam": "rawatan-am",
  "ujian-pantas": "rawatan-am",
  "nebulizer": "rawatan-am",
  "sedutan-kahak": "rawatan-am",
  "pencucian-hidung": "rawatan-am",
  "ujian-darah-penuh": "rawatan-am",
  "ujian-denggi": "rawatan-am",
  // prosedur-minor
  "penjagaan-telinga": "prosedur-minor",
  "khatan": "prosedur-minor",
  "ketumbuhan-ketuat": "prosedur-minor",
  // pemeriksaan-kesihatan
  "pemeriksaan-darah": "pemeriksaan-kesihatan",
  "pemeriksaan-pelajar": "pemeriksaan-kesihatan",
  "pemeriksaan-pra-pekerjaan": "pemeriksaan-kesihatan",
  "pemeriksaan-kembali-bekerja": "pemeriksaan-kesihatan",
  "pemeriksaan-haji-2026": "pemeriksaan-kesihatan",
};

describe("resolveServiceCategorySlug", () => {
  it("maps every individual SERVICES slug to an approved DB category", () => {
    for (const s of SERVICES) {
      const resolved = resolveServiceCategorySlug(s.slug);
      expect(EXPECTED[s.slug], `missing expected mapping for ${s.slug}`).toBeDefined();
      expect(resolved).toBe(EXPECTED[s.slug]);
    }
  });

  it("resolves the three canonical public category routes", () => {
    expect(resolveServiceCategorySlug("pemeriksaan-kesihatan")).toBe("pemeriksaan-kesihatan");
    expect(resolveServiceCategorySlug("prosedur-kecil")).toBe("prosedur-minor");
    expect(resolveServiceCategorySlug("rawatan-umum")).toBe("rawatan-am");
  });

  it("resolves DB slugs to themselves (identity passthrough)", () => {
    for (const s of DB_SLUGS) {
      expect(resolveServiceCategorySlug(s)).toBe(s);
    }
  });

  it("returns unknown slugs unchanged so ServiceDetail can 404", () => {
    expect(resolveServiceCategorySlug("does-not-exist")).toBe("does-not-exist");
    expect(resolveServiceCategorySlug("random-xyz")).toBe("random-xyz");
  });

  it("returns undefined for undefined input", () => {
    expect(resolveServiceCategorySlug(undefined)).toBeUndefined();
  });

  it("only maps to the three approved DB categories", () => {
    const allowed = new Set<string>(DB_SLUGS);
    for (const v of Object.values(SERVICE_CATEGORY_SLUG_MAP)) {
      expect(allowed.has(v)).toBe(true);
    }
  });
});
