import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntakeArgs {
  appointmentId: string;
  patientId: string;
  visitPurpose?: string;
  notes?: string | null;
  panelId?: string | null;
}

/**
 * Wraps the `intake_appointment_to_queue` RPC. Returns the new queue entry id.
 * If `panelId` is supplied, performs a follow-up UPDATE to set the payer
 * profile + payment_method on the freshly created queue row. This keeps the
 * existing RPC signature stable.
 */
export function useIntakeAppointment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      appointmentId,
      patientId,
      visitPurpose,
      notes,
      panelId,
    }: IntakeArgs) => {
      const { data, error } = await supabase.rpc('intake_appointment_to_queue', {
        p_appointment_id: appointmentId,
        p_patient_id: patientId,
        p_visit_purpose: visitPurpose ?? 'consultation',
        p_notes: notes ?? null,
      });
      if (error) throw error;

      const queueEntryId = data as string;

      if (panelId && queueEntryId) {
        const { error: updateError } = await supabase
          .from('queue_entries')
          .update({ panel_id: panelId, payment_method: 'panel' })
          .eq('id', queueEntryId);
        if (updateError) throw updateError;
      }

      return queueEntryId;
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
  panelId?: string | null;
}

/** Inserts a walk-in queue entry (no source appointment). */
export function useCheckInWalkIn() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ patientId, visitPurpose, notes, panelId }: WalkInArgs) => {
      const { data: userData } = await supabase.auth.getUser();

      // Atomic daily sequence (race-safe via advisory lock in the SQL fn)
      const { data: seq, error: seqError } = await supabase.rpc('get_next_queue_number');
      if (seqError) throw seqError;

      const { data, error } = await supabase
        .from('queue_entries')
        .insert({
          patient_id: patientId,
          visit_purpose: visitPurpose,
          visit_notes: notes ?? null,
          created_by: userData.user?.id ?? null,
          clinic_status: 'registered',
          panel_id: panelId ?? null,
          payment_method: panelId ? 'panel' : null,
          queue_sequence: seq as number,
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
