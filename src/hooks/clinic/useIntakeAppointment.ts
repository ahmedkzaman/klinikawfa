import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntakeArgs {
  appointmentId: string;
  patientId: string;
  visitPurpose?: string;
  notes?: string | null;
}

/**
 * Wraps the `intake_appointment_to_queue` RPC. Returns the new queue entry id.
 */
export function useIntakeAppointment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ appointmentId, patientId, visitPurpose, notes }: IntakeArgs) => {
      const { data, error } = await supabase.rpc('intake_appointment_to_queue', {
        p_appointment_id: appointmentId,
        p_patient_id: patientId,
        p_visit_purpose: visitPurpose ?? 'consultation',
        p_notes: notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'queue-entries'] });
      qc.invalidateQueries({ queryKey: ['clinic', 'today-appointments'] });
    },
  });
}

interface WalkInArgs {
  patientId: string;
  visitPurpose: string;
  notes?: string | null;
}

/** Inserts a walk-in queue entry (no source appointment). */
export function useCheckInWalkIn() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ patientId, visitPurpose, notes }: WalkInArgs) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('queue_entries')
        .insert({
          patient_id: patientId,
          visit_purpose: visitPurpose,
          visit_notes: notes ?? null,
          created_by: userData.user?.id ?? null,
          clinic_status: 'registered',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic', 'queue-entries'] });
    },
  });
}
