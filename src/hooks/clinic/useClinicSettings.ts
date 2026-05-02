import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicSettings {
  id: string;
  clinic_name: string;
  address_line_1: string;
  address_line_2: string;
  phone: string;
  email: string;
  logo_url: string;
  content_margin_top: number;
  updated_at: string;
}

const DEFAULTS: ClinicSettings = {
  id: '',
  clinic_name: 'Klinik Awfa',
  address_line_1: '',
  address_line_2: '',
  phone: '',
  email: '',
  logo_url: '',
  content_margin_top: 120,
  updated_at: new Date().toISOString(),
};

export function useClinicSettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['clinic_settings'],
    queryFn: async (): Promise<ClinicSettings> => {
      const { data, error } = await supabase
        .from('clinic_settings' as never)
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ClinicSettings) ?? DEFAULTS;
    },
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Omit<ClinicSettings, 'id' | 'updated_at'>>) => {
      const id = query.data?.id;
      if (!id) throw new Error('Settings row not loaded yet');
      const { error } = await supabase
        .from('clinic_settings' as never)
        .update(patch as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic_settings'] }),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const id = query.data?.id;
      if (!id) throw new Error('Settings row not loaded yet');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `clinic-logo/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('clinic-assets')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('clinic-assets').getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from('clinic_settings' as never)
        .update({ logo_url: url } as never)
        .eq('id', id);
      if (updErr) throw updErr;
      return url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic_settings'] }),
  });

  return {
    settings: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    update,
    uploadLogo,
  };
}
