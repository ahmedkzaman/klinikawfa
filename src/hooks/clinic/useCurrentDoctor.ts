import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Resolves the `doctors` row owned by the currently signed-in user.
 * Returns `null` if the user has no doctor profile.
 */
export function useCurrentDoctor() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['current_doctor', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('doctors')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
