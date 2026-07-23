import { describe, expect, it } from "vitest";

import {
  applyDesktopRows,
  deriveDesktopRows,
  reorderDesktopRow,
  setDesktopRowPreset,
  validateDesktopRows,
  type DesktopLayoutRow,
} from "@/features/website-cms/layout/rows";
import type { WebsiteLayout, WebsiteLayoutBlock } from "@/features/website-cms/layout/types";

type Kind = "hero" | "body" | "cta" | "gallery" | "faq" | "quote";

function block(
  id: string,
  order: number,
  desktop: WebsiteLayoutBlock<Kind>["desktop"],
  hidden = false,
): WebsiteLayoutBlock<Kind> {
  return {
    id,
    kind: id as Kind,
    contentRef: id,
    order,
    hidden,
    desktop,
  };
}

function slot(column: number, width: number, blockId: string | null) {
  return { column, width, blockId };
}

describe("website desktop layout rows", () => {
  it("derives preset and custom rows from visible desktop placements", () => {
    const layout: WebsiteLayout<Kind> = {
      version: 1,
      blocks: [
        block("hero", 0, { column: 1, width: 12, row: 1, height: 1 }),
        block("body", 1, { column: 1, width: 4, row: 3, height: 2 }),
        block("cta", 2, { column: 5, width: 4, row: 3, height: 1 }),
        block("gallery", 3, { column: 9, width: 4, row: 3, height: 1 }),
        block("faq", 4, { column: 1, width: 5, row: 8, height: 1 }),
        block("quote", 5, { column: 6, width: 7, row: 8, height: 1 }),
        block("hero-hidden", 6, { column: 1, width: 12, row: 10, height: 1 }, true),
      ],
    };

    expect(deriveDesktopRows(layout)).toEqual([
      {
        id: "row-1",
        sourceRow: 1,
        preset: "full",
        slots: [slot(1, 12, "hero")],
      },
      {
        id: "row-3",
        sourceRow: 3,
        preset: "three-equal",
        slots: [slot(1, 4, "body"), slot(5, 4, "cta"), slot(9, 4, "gallery")],
      },
      {
        id: "row-8",
        sourceRow: 8,
        preset: "custom",
        slots: [slot(1, 5, "faq"), slot(6, 7, "quote")],
      },
    ]);
  });

  it("uses exact preset widths, preserves left-to-right assignments, and drops displaced blocks", () => {
    const rows: DesktopLayoutRow[] = [
      {
        id: "row-1",
        sourceRow: 1,
        preset: "four-equal",
        slots: [
          slot(1, 3, "hero"),
          slot(4, 3, "body"),
          slot(7, 3, "cta"),
          slot(10, 3, "gallery"),
        ],
      },
    ];

    expect(setDesktopRowPreset(rows, "row-1", "full")[0].slots).toEqual([
      slot(1, 12, "hero"),
    ]);
    expect(setDesktopRowPreset(rows, "row-1", "two-equal")[0].slots).toEqual([
      slot(1, 6, "hero"),
      slot(7, 6, "body"),
    ]);
    expect(setDesktopRowPreset(rows, "row-1", "three-equal")[0].slots).toEqual([
      slot(1, 4, "hero"),
      slot(5, 4, "body"),
      slot(9, 4, "cta"),
    ]);
    expect(setDesktopRowPreset(rows, "row-1", "four-equal")[0].slots).toEqual([
      slot(1, 3, "hero"),
      slot(4, 3, "body"),
      slot(7, 3, "cta"),
      slot(10, 3, "gallery"),
    ]);
    expect(setDesktopRowPreset(rows, "row-1", "narrow-wide")[0].slots).toEqual([
      slot(1, 4, "hero"),
      slot(5, 8, "body"),
    ]);
    expect(setDesktopRowPreset(rows, "row-1", "wide-narrow")[0].slots).toEqual([
      slot(1, 8, "hero"),
      slot(9, 4, "body"),
    ]);

    const expanded = setDesktopRowPreset(
      setDesktopRowPreset(rows, "row-1", "narrow-wide"),
      "row-1",
      "four-equal",
    );

    expect(expanded[0].slots).toEqual([
      slot(1, 3, "hero"),
      slot(4, 3, "body"),
      slot(7, 3, null),
      slot(10, 3, null),
    ]);
  });

  it("reports incomplete rows and ignores hidden blocks during validation", () => {
    const layout: WebsiteLayout<Kind> = {
      version: 1,
      blocks: [
        block("hero", 0, { column: 1, width: 6, row: 1, height: 1 }),
        block("body", 1, { column: 7, width: 6, row: 1, height: 2 }),
        block("cta", 2, { column: 1, width: 12, row: 4, height: 1 }),
        block("gallery", 3, { column: 1, width: 12, row: 6, height: 1 }, true),
      ],
    };
    const rows: DesktopLayoutRow[] = [
      {
        id: "row-1",
        sourceRow: 1,
        preset: "two-equal",
        slots: [slot(1, 6, "hero"), slot(7, 6, null)],
      },
      {
        id: "row-4",
        sourceRow: 4,
        preset: "full",
        slots: [slot(1, 12, "body")],
      },
    ];

    expect(validateDesktopRows(layout, rows)).toEqual({
      ok: false,
      duplicateBlockIds: [],
      emptySlots: [{ rowId: "row-1", slotIndex: 1 }],
      hiddenAssignedBlockIds: [],
      unassignedBlockIds: ["cta"],
      unknownBlockIds: [],
    });
  });

  it("reports duplicate visible block assignments", () => {
    const layout: WebsiteLayout<Kind> = {
      version: 1,
      blocks: [
        block("hero", 0, { column: 1, width: 6, row: 1, height: 1 }),
        block("body", 1, { column: 7, width: 6, row: 1, height: 1 }),
        block("cta", 2, { column: 1, width: 12, row: 3, height: 1 }),
      ],
    };
    const rows: DesktopLayoutRow[] = [
      {
        id: "row-1",
        sourceRow: 1,
        preset: "two-equal",
        slots: [slot(1, 6, "hero"), slot(7, 6, "body")],
      },
      {
        id: "row-3",
        sourceRow: 3,
        preset: "full",
        slots: [slot(1, 12, "body")],
      },
    ];

    expect(validateDesktopRows(layout, rows)).toEqual({
      ok: false,
      duplicateBlockIds: ["body"],
      emptySlots: [],
      hiddenAssignedBlockIds: [],
      unassignedBlockIds: ["cta"],
      unknownBlockIds: [],
    });
  });

  it("reorders rows and normalizes reading order when applying desktop rows", () => {
    const layout: WebsiteLayout<Kind> = {
      version: 1,
      blocks: [
        block("hero", 0, { column: 1, width: 6, row: 5, height: 2 }),
        block("body", 1, { column: 7, width: 6, row: 5, height: 1 }),
        block("cta", 2, { column: 1, width: 12, row: 10, height: 1 }),
        block("gallery", 3, { column: 1, width: 12, row: 20, height: 1 }, true),
      ],
    };

    const reordered = reorderDesktopRow(deriveDesktopRows(layout), "row-10", 0);
    const result = applyDesktopRows(layout, reordered);

    expect(result).toEqual({
      ok: true,
      layout: {
        version: 1,
        blocks: [
          block("cta", 0, { column: 1, width: 12, row: 1, height: 1 }),
          block("hero", 1, { column: 1, width: 6, row: 2, height: 2 }),
          block("body", 2, { column: 7, width: 6, row: 2, height: 1 }),
          block("gallery", 3, { column: 1, width: 12, row: 20, height: 1 }, true),
        ],
      },
      validation: {
        ok: true,
        duplicateBlockIds: [],
        emptySlots: [],
        hiddenAssignedBlockIds: [],
        unassignedBlockIds: [],
        unknownBlockIds: [],
      },
    });
  });
});
