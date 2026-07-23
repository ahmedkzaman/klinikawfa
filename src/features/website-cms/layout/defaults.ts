import type { GeneralPageContent } from "@/features/website-cms/schemas/page";

import type { HomeSectionId } from "../schemas/home";
import type {
  GeneralPageLayoutKind,
  HomeLayoutKind,
  WebsiteLayout,
  WebsiteLayoutBlock,
} from "./types";

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
