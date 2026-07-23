export const WEBSITE_GRID_COLUMNS = 12;
export const WEBSITE_GRID_MAX_ROW = 100;
export const WEBSITE_GRID_MAX_HEIGHT = 24;
export const WEBSITE_LAYOUT_MAX_BLOCKS = 50;

export const HOME_LAYOUT_KINDS = [
  "hero",
  "why",
  "video",
  "services",
  "gallery",
  "testimonials",
  "map",
] as const;

export const GENERAL_PAGE_LAYOUT_KINDS = [
  "title",
  "hero",
  "body",
  "media",
  "cta",
] as const;

export type HomeLayoutKind = (typeof HOME_LAYOUT_KINDS)[number];
export type GeneralPageLayoutKind = (typeof GENERAL_PAGE_LAYOUT_KINDS)[number];
export type WebsiteLayoutKind = HomeLayoutKind | GeneralPageLayoutKind;

export interface WebsiteGridPlacement {
  column: number;
  width: number;
  row: number;
  height: number;
}

export interface WebsiteLayoutBlock<K extends string = string> {
  id: string;
  kind: K;
  contentRef: string;
  order: number;
  hidden: boolean;
  desktop: WebsiteGridPlacement;
}

export interface WebsiteLayout<K extends string = string> {
  version: 1;
  blocks: WebsiteLayoutBlock<K>[];
}
