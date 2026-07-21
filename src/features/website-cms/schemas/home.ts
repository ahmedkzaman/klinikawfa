import { z } from "zod";

import {
  bilingualTextSchema,
  managedLinkHrefSchema,
  requiredBilingualTextSchema,
  safeHrefSchema,
} from "./common";

export const HOME_SECTION_IDS = [
  "hero",
  "why",
  "video",
  "services",
  "gallery",
  "testimonials",
  "map",
] as const;

export const HOME_WHY_ICON_IDS = [
  "clock",
  "sofa",
  "users",
  "user-check",
  "scissors",
  "ear",
] as const;

export const HOME_VIDEO_URL_SETTING_KEYS = ["homepage_video_url"] as const;
export const HOME_VIDEO_POSTER_SETTING_KEYS = ["homepage_video_poster"] as const;

export const homeSectionIdSchema = z.enum(HOME_SECTION_IDS);

export const homeSectionOrderSchema = z
  .array(homeSectionIdSchema)
  .min(1)
  .max(HOME_SECTION_IDS.length)
  .superRefine((sections, context) => {
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      if (seen.has(section)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Home sections may only appear once",
          path: [index],
        });
      }
      seen.add(section);
    });
  });

export const homeBackgroundOpacitySchema = z.number().min(5).max(25);
export const homeAutoplayMsSchema = z.number().int().min(3000).max(15000);
export const homeItemLimitSchema = z.number().int().min(1).max(12);

const homeLinkSchema = z
  .object({
    label: requiredBilingualTextSchema,
    // Existing public Home links include appointment and telephone routes. Those
    // stay safe, while the stricter managed-page CTA restriction lives in page.ts.
    href: managedLinkHrefSchema,
  })
  .strict();

const homeSectionCopySchema = z
  .object({
    eyebrow: requiredBilingualTextSchema,
    title: requiredBilingualTextSchema,
    description: requiredBilingualTextSchema,
  })
  .strict();

const homeCarouselLabelsSchema = z
  .object({
    previous: requiredBilingualTextSchema,
    next: requiredBilingualTextSchema,
    goTo: requiredBilingualTextSchema,
  })
  .strict();

const homeSeoSchema = z
  .object({
    title: requiredBilingualTextSchema,
    description: requiredBilingualTextSchema,
  })
  .strict();

export const homeHeroSchema = z
  .object({
    backgroundImage: safeHrefSchema,
    backgroundAlt: bilingualTextSchema,
    backgroundOpacity: homeBackgroundOpacitySchema,
    autoplayMs: homeAutoplayMsSchema,
    slides: z
      .array(
        z
          .object({
            title: requiredBilingualTextSchema,
            subtitle: requiredBilingualTextSchema,
          })
          .strict(),
      )
      .min(1)
      .max(12),
    ctas: z.array(homeLinkSchema).min(1).max(12),
    carouselLabels: homeCarouselLabelsSchema,
  })
  .strict();

export const homeWhySchema = homeSectionCopySchema
  .extend({
    items: z
      .array(
        z
          .object({
            icon: z.enum(HOME_WHY_ICON_IDS),
            title: requiredBilingualTextSchema,
            description: requiredBilingualTextSchema,
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

export const homeVideoSchema = homeSectionCopySchema
  .extend({
    placeholder: requiredBilingualTextSchema,
    unsupportedMessage: requiredBilingualTextSchema,
    videoUrlSettingKey: z.enum(HOME_VIDEO_URL_SETTING_KEYS),
    posterSettingKey: z.enum(HOME_VIDEO_POSTER_SETTING_KEYS),
  })
  .strict();

const homePreviewSchema = homeSectionCopySchema
  .extend({
    cta: homeLinkSchema,
    itemLimit: homeItemLimitSchema,
  })
  .strict();

export const homeServicesSchema = homePreviewSchema
  .extend({
    learnMoreLabel: requiredBilingualTextSchema,
  })
  .strict();

export const homeGallerySchema = homePreviewSchema
  .extend({
    emptyMessage: requiredBilingualTextSchema,
    moreLabel: requiredBilingualTextSchema,
    carouselLabels: homeCarouselLabelsSchema,
    closeLabel: requiredBilingualTextSchema,
    previousLabel: requiredBilingualTextSchema,
    nextLabel: requiredBilingualTextSchema,
    swipeHint: requiredBilingualTextSchema,
  })
  .strict();

export const homeTestimonialsSchema = homeSectionCopySchema
  .extend({
    patientLabel: requiredBilingualTextSchema,
    goToSlideLabel: requiredBilingualTextSchema,
    previousSlideLabel: requiredBilingualTextSchema,
    nextSlideLabel: requiredBilingualTextSchema,
  })
  .strict();

export const homeMapSchema = homeSectionCopySchema
  .extend({
    hoursLabel: requiredBilingualTextSchema,
    everydayLabel: requiredBilingualTextSchema,
    callLabel: requiredBilingualTextSchema,
    directionsCta: homeLinkSchema,
    embedUrl: safeHrefSchema,
    embedTitle: requiredBilingualTextSchema,
  })
  .strict();

export const homeContentSchema = z
  .object({
    hero: homeHeroSchema,
    why: homeWhySchema,
    video: homeVideoSchema,
    services: homeServicesSchema,
    gallery: homeGallerySchema,
    testimonials: homeTestimonialsSchema,
    map: homeMapSchema,
    seo: homeSeoSchema,
    sectionOrder: homeSectionOrderSchema,
  })
  .strict();

export type HomeSectionId = z.infer<typeof homeSectionIdSchema>;
export type HomeContent = z.infer<typeof homeContentSchema>;
