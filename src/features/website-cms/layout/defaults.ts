import type { GeneralPageContent } from "@/features/website-cms/schemas/page";

import type { HomeSectionId } from "../schemas/home";
import type {
  GeneralPageLayoutKind,
  HomeLayoutKind,
  WebsiteLayout,
  WebsiteLayoutBlock,
} from "./types";
import { HOME_LAYOUT_KINDS } from "./types";

function createFullWidthBlocks<K extends string>(
  kinds: readonly K[],
): WebsiteLayoutBlock<K>[] {
  return kinds.map((kind, index) => ({
    id: kind,
    kind,
    contentRef: kind,
    order: index,
    hidden: false,
    desktop: {
      column: 1,
      width: 12,
      row: index + 1,
      height: 1,
    },
  }));
}

export function createDefaultHomeLayout(
  sectionOrder: readonly HomeSectionId[],
): WebsiteLayout<HomeLayoutKind> {
  return {
    version: 1,
    blocks: createFullWidthBlocks(sectionOrder),
  };
}

export function createEditableHomeLayout(
  sectionOrder: readonly HomeSectionId[],
): WebsiteLayout<HomeLayoutKind> {
  const visible = new Set(sectionOrder);
  const ordered = [
    ...sectionOrder,
    ...HOME_LAYOUT_KINDS.filter((kind) => !visible.has(kind)),
  ];
  const layout = createDefaultHomeLayout(ordered);
  return {
    ...layout,
    blocks: layout.blocks.map((block) => ({
      ...block,
      hidden: !visible.has(block.kind),
    })),
  };
}

export function createDefaultGeneralPageLayout(
  content: Pick<GeneralPageContent, "heroImage" | "media" | "cta">,
): WebsiteLayout<GeneralPageLayoutKind> {
  const kinds: GeneralPageLayoutKind[] = ["title"];
  if (content.heroImage) kinds.push("hero");
  kinds.push("body");
  if (content.media.length > 0) kinds.push("media");
  if (content.cta) kinds.push("cta");

  return {
    version: 1,
    blocks: createFullWidthBlocks(kinds),
  };
}
