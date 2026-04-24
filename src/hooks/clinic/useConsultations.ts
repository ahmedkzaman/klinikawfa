import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export function useConsultation(queueEntryId: string | undefined) {
  return useQuery({
    queryKey: ['consultation', queueEntryId],
    enabled: !!queueEntryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultations')
        .select('*, diagnoses(id, name), doctors(id, name, avatar_url)')
        .eq('queue_entry_id', queueEntryId!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      queue_entry_id: string;
      patient_id: string;
      doctor_id: string;
    }) => {
      const { data, error } = await supabase
        .from('consultations')
        .insert(entry)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['consultation', vars.queue_entry_id] }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      case_note?: string;
      diagnosis_id?: string | null;
      diagnosis_text?: string;
      dispense_note?: string;
      status?: string;
    }) => {
      const { error } = await supabase
        .from('consultations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consultation'] }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function usePatientConsultationHistory(patientId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['consultation_history', patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultations')
        .select(
          '*, diagnoses(id, name), doctors(id, name, avatar_url), consultation_items(*)',
        )
        .eq('patient_id', patientId!)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!patientId) return;
    const channel = supabase
      .channel(`history-${patientId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consultations',
          filter: `patient_id=eq.${patientId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['consultation_history', patientId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientId, qc]);

  return query;
}
