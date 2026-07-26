import { z } from "zod";
import { SITE_ORIGIN, normalizeCanonicalUrl } from "@/lib/website/seoRoutes";

const canonicalUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return url.origin === SITE_ORIGIN;
    } catch {
      return false;
    }
  }, "Canonical URL must use https://klinikawfa.com")
  .transform((value) => (value === "" ? "" : normalizeCanonicalUrl(value)!));

export const seoFieldsSchema = z
  .object({
    title: z.string().trim().max(120),
    description: z.string().trim().max(320),
    canonicalUrl: canonicalUrlSchema,
    socialTitle: z.string().trim().max(120),
    socialDescription: z.string().trim().max(320),
    socialImageMediaId: z.string().uuid().nullable(),
    index: z.boolean(),
    follow: z.boolean(),
  })
  .strict();

export type SeoFields = z.infer<typeof seoFieldsSchema>;

export const emptySeoFields: SeoFields = {
  title: "",
  description: "",
  canonicalUrl: "",
  socialTitle: "",
  socialDescription: "",
  socialImageMediaId: null,
  index: true,
  follow: true,
};
