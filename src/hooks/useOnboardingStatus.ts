import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useOnboardingStatus(userId: string | undefined) {
  const query = useQuery({
    queryKey: ['onboarding-status', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('staff_onboarding' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        user_id: string;
        onboarding_data: Record<string, any>;
        job_description_acknowledged: boolean;
        job_scope_acknowledged: boolean;
        company_policy_acknowledged: boolean;
        is_completed: boolean;
        created_at: string;
        updated_at: string;
      } | null;
    },
    enabled: !!userId,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isCompleted: query.data?.is_completed ?? false,
    refetch: query.refetch,
  };
}
