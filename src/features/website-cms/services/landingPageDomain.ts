import { z } from "zod";

export const PROTECTED_SERVICE_SLUGS = [
  "rawatan-am",
  "prosedur-minor",
  "pemeriksaan-kesihatan",
] as const;

const protectedSlugs = new Set<string>(PROTECTED_SERVICE_SLUGS);

export function isProtectedServiceSlug(slug: string): boolean {
  return protectedSlugs.has(slug);
}

export const landingPageFormSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "No spaces, lowercase & hyphens only").max(80),
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().min(1, "Description is required").max(20_000),
  call_to_action: z.string().min(1, "CTA is required").max(60),
  hero_image_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  promo_video_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  services_list: z.array(z.object({ value: z.string() })).min(1, "At least one service is required"),
});

export type LandingPageFormValues = z.infer<typeof landingPageFormSchema>;

export const DEFAULT_LANDING_PAGE_VALUES: LandingPageFormValues = {
  slug: "",
  title: "",
  description: "",
  call_to_action: "Book Appointment",
  hero_image_url: "",
  promo_video_url: "",
  services_list: [{ value: "" }],
};
