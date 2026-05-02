import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { QueueEntryWithJoins, QueueEntryRow } from '@/types/clinic';

const QUEUE_QUERY_KEY = ['clinic', 'queue-entries'] as const;
const CONSULT_QUEUE_QUERY_KEY = ['clinic', 'consultation-queue-entries'] as const;

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
          doctors!queue_entries_assigned_doctor_id_fkey ( name ),
          insurance_providers ( id, name )
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
          qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

/**
 * Consultation workspace feed. Returns today's entries OR any active
 * carry-over entries from prior days (so a patient who registered yesterday
 * but is still `with_doctor` remains visible). Includes patient, doctor,
 * and room joins required by the ConsultationDetail header.
 */
export function useConsultationQueueEntries() {
  const qc = useQueryClient();

  const query = useQuery<QueueEntryWithJoins[]>({
    queryKey: CONSULT_QUEUE_QUERY_KEY,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('queue_entries')
        .select(
          `
          *,
          patients ( * ),
          doctors:assigned_doctor_id ( id, name, avatar_url ),
          rooms:assigned_room_id ( id, label ),
          insurance_providers ( id, name )
        `,
        )
        .is('deleted_at', null)
        .or(
          `created_at.gte.${startOfDay.toISOString()},clinic_status.in.(registered,ready_for_doctor,with_doctor,sent_to_dispensary,dispensing_payment,on_hold)`,
        )
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as QueueEntryWithJoins[];
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('clinic-consultation-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries' },
        () => {
          qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
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

export function useUpdateQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & Partial<QueueEntryRow>) => {
      const { data, error } = await supabase
        .from('queue_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
    },
  });
}

export function useCallPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      called_by_doctor_id,
      room_id,
    }: {
      id: string;
      called_by_doctor_id: string;
      room_id?: string | null;
    }) => {
      const patch: Record<string, unknown> = {
        clinic_status: 'with_doctor',
        called_at: new Date().toISOString(),
        called_by_doctor_id,
      };
      if (room_id) patch.assigned_room_id = room_id;
      const { error } = await supabase
        .from('queue_entries')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
    },
  });
}

export { QUEUE_QUERY_KEY, CONSULT_QUEUE_QUERY_KEY };
