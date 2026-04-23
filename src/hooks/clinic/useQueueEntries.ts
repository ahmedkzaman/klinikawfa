import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { QueueEntryWithJoins } from '@/types/clinic';

const QUEUE_QUERY_KEY = ['clinic', 'queue-entries'] as const;

/**
 * Today's active queue entries with patient + doctor joins.
 * Subscribes to realtime postgres_changes on `queue_entries`.
 * Sort: urgent first, then queue_number ascending.
 */
export function useQueueEntries() {
  const qc = useQueryClient();

  const query = useQuery<QueueEntryWithJoins[]>({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('queue_entries')
        .select(
          `
          *,
          patients ( name, phone ),
          doctors!queue_entries_assigned_doctor_id_fkey ( name )
        `,
        )
        .is('deleted_at', null)
        .not('clinic_status', 'in', '(completed,cancelled)')
        .gte('created_at', startOfDay.toISOString())
        .order('is_urgent', { ascending: false })
        .order('queue_number', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as QueueEntryWithJoins[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('clinic-queue-entries')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        () => {
          qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export { QUEUE_QUERY_KEY };
