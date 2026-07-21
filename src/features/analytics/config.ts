import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export const GOOGLE_TRACKING_SELECT =
  "provider,enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version";

export const GOOGLE_CONVERSION_KEYS = [
  "contact_click",
  "phone_click",
  "whatsapp_click",
] as const;

export type GoogleConversionKey = (typeof GOOGLE_CONVERSION_KEYS)[number];

export interface GoogleTrackingConfig {
  provider: "google_tag";
  enabled: boolean;
  measurementId: string | null;
  adsConversionId: string | null;
  adsConversionLabels: Record<string, string>;
  consentVersion: number;
}

export interface GoogleTrackingUpdateInput {
  enabled: boolean;
  measurementId: string | null;
  adsConversionId: string | null;
  adsConversionLabels: Record<string, string>;
  consentVersion: number;
}

type GoogleTrackingRow = {
  provider: "google_tag";
  enabled: boolean;
  measurement_id: string | null;
  ads_conversion_id: string | null;
  ads_conversion_labels: Json;
  consent_version: number;
};

type AnalyticsDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      website_tracking_settings: {
        Row: GoogleTrackingRow;
        Insert: never;
        Update: {
          enabled?: boolean;
          measurement_id?: string | null;
          ads_conversion_id?: string | null;
          ads_conversion_labels?: Json;
          consent_version?: number;
        };
        Relationships: [];
      };
    };
  };
};

const analyticsSupabase = supabase as unknown as SupabaseClient<AnalyticsDatabase>;

const measurementIdSchema = z
  .string()
  .regex(
    /^G-[A-Z0-9]{10}$/,
    "GA4 measurement ID must start with G- followed by 10 letters or digits",
  );

const adsConversionIdSchema = z
  .string()
  .regex(
    /^AW-[0-9]{9,12}$/,
    "Google Ads conversion ID must start with AW- followed by 9 to 12 digits",
  );

const conversionLabelSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{1,100}$/,
    "Conversion labels may contain only letters, numbers, underscores, and hyphens",
  );

const conversionLabelsSchema = z
  .object({
    contact_click: conversionLabelSchema.optional(),
    phone_click: conversionLabelSchema.optional(),
    whatsapp_click: conversionLabelSchema.optional(),
  })
  .strict();

const updateSchema = z
  .object({
    adsConversionId: adsConversionIdSchema.nullable(),
    adsConversionLabels: conversionLabelsSchema,
    consentVersion: z.number().int().positive(),
    enabled: z.boolean(),
    measurementId: measurementIdSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled) return;

    if (value.measurementId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid GA4 measurement ID is required before enabling",
        path: ["measurementId"],
      });
    }
    if (value.adsConversionId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A valid Google Ads conversion ID is required before enabling",
        path: ["adsConversionId"],
      });
    }
    for (const key of GOOGLE_CONVERSION_KEYS) {
      if (!value.adsConversionLabels[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${key} conversion label is required before enabling`,
          path: ["adsConversionLabels", key],
        });
      }
    }
  });

const rowSchema = z
  .object({
    ads_conversion_id: adsConversionIdSchema.nullable(),
    ads_conversion_labels: conversionLabelsSchema,
    consent_version: z.number().int().positive(),
    enabled: z.boolean(),
    measurement_id: measurementIdSchema.nullable(),
    provider: z.literal("google_tag"),
  })
  .strict()
  .superRefine((row, context) => {
    const result = updateSchema.safeParse({
      adsConversionId: row.ads_conversion_id,
      adsConversionLabels: row.ads_conversion_labels,
      consentVersion: row.consent_version,
      enabled: row.enabled,
      measurementId: row.measurement_id,
    });
    if (!result.success) {
      for (const issue of result.error.issues) context.addIssue(issue);
    }
  });

function mapGoogleTrackingRow(value: unknown): GoogleTrackingConfig | null {
  const result = rowSchema.safeParse(value);
  if (!result.success) return null;

  return {
    adsConversionId: result.data.ads_conversion_id,
    adsConversionLabels: result.data.ads_conversion_labels,
    consentVersion: result.data.consent_version,
    enabled: result.data.enabled,
    measurementId: result.data.measurement_id,
    provider: "google_tag",
  };
}

export function canEnableGoogleTracking(
  input: Omit<GoogleTrackingUpdateInput, "enabled">,
): boolean {
  return updateSchema.safeParse({ ...input, enabled: true }).success;
}

export async function fetchGoogleTrackingConfig(): Promise<GoogleTrackingConfig | null> {
  const { data, error } = await analyticsSupabase
    .from("website_tracking_settings")
    .select(GOOGLE_TRACKING_SELECT)
    .eq("provider", "google_tag")
    .maybeSingle();

  if (error || !data) return null;
  return mapGoogleTrackingRow(data);
}

export async function updateGoogleTrackingConfig(
  input: GoogleTrackingUpdateInput,
): Promise<GoogleTrackingConfig> {
  const parsed = updateSchema.parse(input);
  const { data, error } = await analyticsSupabase
    .from("website_tracking_settings")
    .update({
      ads_conversion_id: parsed.adsConversionId,
      ads_conversion_labels: parsed.adsConversionLabels,
      consent_version: parsed.consentVersion,
      enabled: parsed.enabled,
      measurement_id: parsed.measurementId,
    })
    .eq("provider", "google_tag")
    .select(GOOGLE_TRACKING_SELECT)
    .single();

  if (error) throw new Error(error.message);
  const config = mapGoogleTrackingRow(data);
  if (!config) throw new Error("The tracking settings response was invalid");
  return config;
}
