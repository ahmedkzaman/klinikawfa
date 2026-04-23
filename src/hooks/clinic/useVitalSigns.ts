import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useVitalSigns(queueEntryId: string | undefined) {
  return useQuery({
    queryKey: ['vital_signs', queueEntryId],
    enabled: !!queueEntryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('queue_entry_id', queueEntryId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecordVitalSigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vitals: {
      id?: string;
      queue_entry_id: string;
      patient_id: string;
      height_cm?: number | null;
      weight_kg?: number | null;
      temperature_c?: number | null;
      bp_systolic?: number | null;
      bp_diastolic?: number | null;
      heart_rate?: number | null;
      spo2?: number | null;
      blood_glucose?: number | null;
      respiratory_rate?: number | null;
    }) => {
      if (vitals.id) {
        const { id, ...updates } = vitals;
        const { error } = await supabase.from('vital_signs').update(updates).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vital_signs').insert(vitals);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['vital_signs', vars.queue_entry_id] });
      qc.invalidateQueries({ queryKey: ['vital_history', vars.patient_id] });
    },
  });
}

export function usePatientVitalHistory(patientId: string | undefined) {
  return useQuery({
    queryKey: ['vital_history', patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
