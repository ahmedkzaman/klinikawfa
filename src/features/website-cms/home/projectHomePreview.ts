import { DEFAULT_HOME_CONTENT } from "./homeDefaults";
import { parseWebsiteLayout } from "@/features/website-cms/layout/schema";
import { HOME_LAYOUT_KINDS } from "@/features/website-cms/layout/types";
import {
  HOME_SECTION_IDS,
  HOME_VIDEO_POSTER_SETTING_KEYS,
  HOME_VIDEO_URL_SETTING_KEYS,
  HOME_WHY_ICON_IDS,
  type HomeContent,
  type HomeSectionId,
} from "../schemas/home";

const MAX_STRUCTURAL_ITEMS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeKnownShape(defaultValue: unknown, rawValue: unknown): unknown {
  if (Array.isArray(defaultValue)) {
    const source =
      Array.isArray(rawValue) && rawValue.length > 0 ? rawValue : defaultValue;
    const template = defaultValue[0];
    if (template === undefined) return [];

    return source
      .slice(0, MAX_STRUCTURAL_ITEMS)
      .map((value, index) =>
        mergeKnownShape(defaultValue[index] ?? template, value),
      );
  }

  if (isRecord(defaultValue)) {
    const source = isRecord(rawValue) ? rawValue : {};
    return Object.fromEntries(
      Object.entries(defaultValue).map(([key, fallback]) => [
        key,
        mergeKnownShape(fallback, source[key]),
      ]),
    );
  }

  return typeof rawValue === typeof defaultValue
    ? rawValue
    : structuredClone(defaultValue);
}

function getRecord(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function finiteClamped(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return integer ? Math.round(bounded) : bounded;
}

function safeSectionOrder(value: unknown): HomeSectionId[] {
  if (!Array.isArray(value)) return [...DEFAULT_HOME_CONTENT.sectionOrder];

  const allowed = new Set<string>(HOME_SECTION_IDS);
  const seen = new Set<HomeSectionId>();
  const sections = value.filter((section): section is HomeSectionId => {
    if (typeof section !== "string" || !allowed.has(section) || seen.has(section as HomeSectionId)) {
      return false;
    }
    seen.add(section as HomeSectionId);
    return true;
  });

  return sections.length > 0 ? sections : [...DEFAULT_HOME_CONTENT.sectionOrder];
}

export function projectHomePreview(rawValue: unknown): HomeContent {
  const preview = mergeKnownShape(
    DEFAULT_HOME_CONTENT,
    rawValue,
  ) as HomeContent;
  const rawHero = getRecord(rawValue, "hero");
  const rawServices = getRecord(rawValue, "services");
  const rawGallery = getRecord(rawValue, "gallery");

  preview.hero.backgroundOpacity = finiteClamped(
    getRecord(rawHero, "backgroundOpacity"),
    DEFAULT_HOME_CONTENT.hero.backgroundOpacity,
    5,
    25,
  );
  preview.hero.autoplayMs = finiteClamped(
    getRecord(rawHero, "autoplayMs"),
    DEFAULT_HOME_CONTENT.hero.autoplayMs,
    3000,
    15000,
    true,
  );
  preview.services.itemLimit = finiteClamped(
    getRecord(rawServices, "itemLimit"),
    DEFAULT_HOME_CONTENT.services.itemLimit,
    1,
    12,
    true,
  );
  preview.gallery.itemLimit = finiteClamped(
    getRecord(rawGallery, "itemLimit"),
    DEFAULT_HOME_CONTENT.gallery.itemLimit,
    1,
    12,
    true,
  );

  preview.why.items = preview.why.items.map((item, index) => ({
    ...item,
    icon: HOME_WHY_ICON_IDS.includes(item.icon)
      ? item.icon
      : DEFAULT_HOME_CONTENT.why.items[
          index % DEFAULT_HOME_CONTENT.why.items.length
        ].icon,
  }));
  preview.video.videoUrlSettingKey = HOME_VIDEO_URL_SETTING_KEYS.includes(
    preview.video.videoUrlSettingKey,
  )
    ? preview.video.videoUrlSettingKey
    : DEFAULT_HOME_CONTENT.video.videoUrlSettingKey;
  preview.video.posterSettingKey = HOME_VIDEO_POSTER_SETTING_KEYS.includes(
    preview.video.posterSettingKey,
  )
    ? preview.video.posterSettingKey
    : DEFAULT_HOME_CONTENT.video.posterSettingKey;
  preview.sectionOrder = safeSectionOrder(getRecord(rawValue, "sectionOrder"));
  const layout = parseWebsiteLayout(getRecord(rawValue, "layout"), HOME_LAYOUT_KINDS);
  if (layout) preview.layout = layout;

  return preview;
}
