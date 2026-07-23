import { describe, expect, it } from "vitest";

import { websiteLayoutSchema } from "@/features/website-cms/layout/schema";

const kinds = ["hero", "body"] as const;

const validLayout = {
  version: 1 as const,
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
      desktop: { column: 1, width: 8, row: 2, height: 2 },
    },
  ],
};

describe("website layout schema", () => {
  it("accepts a strict non-overlapping layout", () => {
    expect(websiteLayoutSchema(kinds).parse(validLayout)).toEqual(validLayout);
  });

  it.each([
    ["unknown root property", { ...validLayout, css: "display:none" }],
    [
      "unknown block property",
      {
        ...validLayout,
        blocks: [{ ...validLayout.blocks[0], className: "hidden" }],
      },
    ],
    [
      "unknown layout kind",
      {
        ...validLayout,
        blocks: [{ ...validLayout.blocks[0], kind: "script" }],
      },
    ],
    [
      "column overflow",
      {
        ...validLayout,
        blocks: [
          {
            ...validLayout.blocks[0],
            desktop: { column: 8, width: 6, row: 1, height: 1 },
          },
        ],
      },
    ],
    [
      "overlap",
      {
        ...validLayout,
        blocks: [
          validLayout.blocks[0],
          {
            ...validLayout.blocks[1],
            desktop: { column: 1, width: 6, row: 1, height: 1 },
          },
        ],
      },
    ],
    [
      "duplicate id",
      {
        ...validLayout,
        blocks: [
          validLayout.blocks[0],
          { ...validLayout.blocks[1], id: "hero" },
        ],
      },
    ],
    [
      "duplicate content reference",
      {
        ...validLayout,
        blocks: [
          validLayout.blocks[0],
          { ...validLayout.blocks[1], contentRef: "hero" },
        ],
      },
    ],
    [
      "non-contiguous order",
      {
        ...validLayout,
        blocks: [
          validLayout.blocks[0],
          { ...validLayout.blocks[1], order: 2 },
        ],
      },
    ],
    [
      "zero row",
      {
        ...validLayout,
        blocks: [
          {
            ...validLayout.blocks[0],
            desktop: { column: 1, width: 12, row: 0, height: 1 },
          },
        ],
      },
    ],
    [
      "oversized height",
      {
        ...validLayout,
        blocks: [
          {
            ...validLayout.blocks[0],
            desktop: { column: 1, width: 12, row: 1, height: 25 },
          },
        ],
      },
    ],
  ])("rejects %s", (_label, candidate) => {
    expect(websiteLayoutSchema(kinds).safeParse(candidate).success).toBe(false);
  });
});
