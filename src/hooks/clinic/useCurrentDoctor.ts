import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Resolves the `doctors` row owned by the currently signed-in user.
 *
 * Auto-provisions a `doctors` row for clinical users (resident_doctor,
 * doctor_admin, locum) who don't yet have one, so newly-promoted
 * resident doctors can immediately use the Consultation page without
 * an admin manually seeding their doctor profile.
 *
 * Returns `null` only if the user is non-clinical (e.g. ops staff).
 */
export function useCurrentDoctor() {
  const { user, isClinical } = useAuth();
  return useQuery({
    queryKey: ['current_doctor', user?.id, isClinical],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!isClinical) return null;

      const { data, error } = await supabase
        .from('doctors')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Auto-provision a minimal doctors row using the user's profile name.
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user!.id)
        .maybeSingle();

      const displayName =
        profile?.full_name?.trim() ||
        profile?.email ||
        user!.email ||
        'Doctor';

      const { data: created, error: insertError } = await supabase
        .from('doctors')
        .insert({
          user_id: user!.id,
          name: displayName,
          status: 'active',
          on_duty: false,
        })
        .select('*')
        .single();
      if (insertError) {
        // Insert may race with another tab; re-query as a fallback.
        const { data: retry } = await supabase
          .from('doctors')
          .select('*')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (retry) return retry;
        throw insertError;
      }
      return created;
    },
  });
}
