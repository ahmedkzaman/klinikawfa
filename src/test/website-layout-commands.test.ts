import { describe, expect, it } from "vitest";

import {
  applyLayoutChange,
  createLayoutHistory,
  deleteBlock,
  duplicateBlock,
  moveBlock,
  redoLayout,
  reorderBlock,
  resizeBlock,
  setBlockHidden,
  undoLayout,
} from "@/features/website-cms/layout/commands";
import type { WebsiteLayout } from "@/features/website-cms/layout/types";

const kinds = ["hero", "body"] as const;

const layout: WebsiteLayout<(typeof kinds)[number]> = {
  version: 1,
  blocks: [
    {
      id: "hero",
      kind: "hero",
      contentRef: "hero",
      order: 0,
      hidden: false,
      desktop: { column: 1, width: 12, row: 1, height: 1 },
    },
    {
      id: "body",
      kind: "body",
      contentRef: "body",
      order: 1,
      hidden: false,
      desktop: { column: 1, width: 6, row: 2, height: 2 },
    },
  ],
};

describe("website layout commands", () => {
  it("moves a block without mutating the current layout", () => {
    const result = moveBlock(layout, "body", { column: 7, row: 2 }, kinds);

    expect(result.ok).toBe(true);
    expect(result.layout.blocks[1].desktop.column).toBe(7);
    expect(layout.blocks[1].desktop.column).toBe(1);
  });

  it("rejects a colliding move and preserves the current object", () => {
    const result = moveBlock(layout, "body", { column: 1, row: 1 }, kinds);

    expect(result).toMatchObject({ ok: false, layout, reason: "Blocks cannot overlap" });
  });

  it("resizes within the grid and rejects overflow", () => {
    expect(resizeBlock(layout, "body", { width: 8, height: 2 }, kinds).ok).toBe(true);
    expect(resizeBlock(layout, "body", { width: 13, height: 2 }, kinds)).toMatchObject({
      ok: false,
      layout,
    });
  });

  it("normalizes semantic order when reordering", () => {
    const result = reorderBlock(layout, "body", 0, kinds);

    expect(result.ok).toBe(true);
    expect(result.layout.blocks.map(({ id, order }) => [id, order])).toEqual([
      ["body", 0],
      ["hero", 1],
    ]);
  });

  it("toggles block visibility", () => {
    const result = setBlockHidden(layout, "body", true, kinds);

    expect(result.ok).toBe(true);
    expect(result.layout.blocks[1].hidden).toBe(true);
  });

  it("duplicates with deterministic injected identities", () => {
    const result = duplicateBlock(
      layout,
      "body",
      { id: "body-copy", contentRef: "body-copy" },
      kinds,
    );

    expect(result.ok).toBe(true);
    expect(result.layout.blocks.at(-1)).toMatchObject({
      id: "body-copy",
      contentRef: "body-copy",
      order: 2,
    });
  });

  it("protects required blocks and normalizes order after deletion", () => {
    expect(deleteBlock(layout, "hero", new Set(["hero"]), kinds)).toMatchObject({
      ok: false,
      reason: "This block is required",
    });

    const result = deleteBlock(layout, "hero", new Set(), kinds);
    expect(result.ok).toBe(true);
    expect(result.layout.blocks).toMatchObject([{ id: "body", order: 0 }]);
  });

  it("round-trips exact layouts through undo and redo", () => {
    const moved = moveBlock(layout, "body", { column: 7, row: 2 }, kinds);
    if (!moved.ok) throw new Error("Expected valid move");

    const changed = applyLayoutChange(createLayoutHistory(layout), moved.layout);
    const undone = undoLayout(changed);
    const redone = redoLayout(undone);

    expect(undone.present).toEqual(layout);
    expect(redone.present).toEqual(moved.layout);
  });
});
