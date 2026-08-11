import { supabase } from "@/integrations/supabase/client";

import type { LandingPageFormValues } from "./landingPageDomain";

export async function saveLandingPage(values: LandingPageFormValues, id: string | null = null): Promise<void> {
  const { error } = await supabase.rpc("save_clinic_landing_page" as never, {
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
}

export async function deleteLandingPage(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_clinic_landing_page" as never, { p_id: id } as never);
  if (error) throw error;
}
