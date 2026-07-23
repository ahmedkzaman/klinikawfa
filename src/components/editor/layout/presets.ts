import type { WebsiteLayout } from "@/features/website-cms/layout/types";

export type LayoutPreset =
  | "full-width"
  | "two-columns"
  | "three-columns"
  | "sidebar-content"
  | "content-sidebar";

export function createPresetLayout<K extends string>(
  layout: WebsiteLayout<K>,
  preset: LayoutPreset,
): WebsiteLayout<K> {
  const ordered = [...layout.blocks].sort((left, right) => left.order - right.order);

  return {
    version: 1,
    blocks: ordered.map((block, index) => {
      let column = 1;
      let width = 12;
      let row = index + 1;

      if (preset === "two-columns") {
        column = index % 2 === 0 ? 1 : 7;
        width = 6;
        row = Math.floor(index / 2) + 1;
      } else if (preset === "three-columns") {
        column = (index % 3) * 4 + 1;
        width = 4;
        row = Math.floor(index / 3) + 1;
      } else if (preset === "sidebar-content") {
        column = index % 2 === 0 ? 1 : 5;
        width = index % 2 === 0 ? 4 : 8;
        row = Math.floor(index / 2) + 1;
      } else if (preset === "content-sidebar") {
        column = index % 2 === 0 ? 1 : 9;
        width = index % 2 === 0 ? 8 : 4;
        row = Math.floor(index / 2) + 1;
      }

      return {
        ...block,
        desktop: { column, width, row, height: 1 },
      };
    }),
  };
}
