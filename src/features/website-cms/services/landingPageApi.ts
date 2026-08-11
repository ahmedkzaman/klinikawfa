import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

import type { LandingPageFormValues } from "./landingPageDomain";

export type LandingPageSaveResult = { serviceId: string; seoId: string; created: boolean };

export async function saveLandingPage(values: LandingPageFormValues, id: string | null = null): Promise<LandingPageSaveResult> {
  const { data, error } = await supabase.rpc("save_clinic_landing_page" as never, {
    p_id: id,
    p_slug: values.slug,
    p_title: values.title,
    p_description: values.description,
    p_call_to_action: values.call_to_action,
    p_hero_image_url: values.hero_image_url || null,
    p_promo_video_url: values.promo_video_url || null,
    p_services_list: values.services_list.map(({ value }) => value.trim()).filter(Boolean),
  } as never);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = z.object({ service_id: z.string().uuid(), seo_id: z.string().uuid(), created: z.boolean() }).safeParse(row);
  if (!parsed.success) throw new Error("Service page save response was invalid");
  return { serviceId: parsed.data.service_id, seoId: parsed.data.seo_id, created: parsed.data.created };
}

export async function deleteLandingPage(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_clinic_landing_page" as never, { p_id: id } as never);
  if (error) throw error;
}
