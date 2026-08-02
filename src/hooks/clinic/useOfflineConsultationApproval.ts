import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

export type SaveOfflineConsultationInput = {
  queueEntryId: string;
  doctorId: string;
  originalConsultedAt: string;
  caseNote: string;
  diagnosisId: string | null;
  diagnosisText: string;
  dispenseNote: string;
  expectedRevision: number;
};

export type ReviewOfflineConsultationInput = {
  consultationId: string;
  action: 'approve' | 'return';
  reason?: string | null;
  expectedRevision: number;
};

export type OfflineConsultationAuditEntry =
  Database['public']['Functions']['get_offline_consultation_audit']['Returns'][number];

type OfflineConsultation = Database['public']['Tables']['consultations']['Row'];

function invalidateOfflineConsultationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  consultation: Pick<OfflineConsultation, 'id' | 'queue_entry_id'>,
) {
  queryClient.invalidateQueries({ queryKey: ['consultation', consultation.queue_entry_id] });
  queryClient.invalidateQueries({ queryKey: ['consultation_history'] });
  queryClient.invalidateQueries({ queryKey: ['offline_consultation_audit', consultation.id] });
}

export function useSaveOfflineConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveOfflineConsultationInput) => {
      const { data, error } = await supabase.rpc('save_offline_consultation', {
        p_queue_entry_id: input.queueEntryId,
        p_doctor_id: input.doctorId,
        p_original_consulted_at: input.originalConsultedAt,
        p_case_note: input.caseNote,
        p_diagnosis_id: input.diagnosisId,
        p_diagnosis_text: input.diagnosisText,
        p_dispense_note: input.dispenseNote,
        p_expected_revision: input.expectedRevision,
      });
      if (error) throw error;
      if (!data) throw new Error('Offline consultation was not saved.');
      return data;
    },
    onSuccess: (consultation) => {
      invalidateOfflineConsultationQueries(queryClient, consultation);
    },
  });
}

export function useReviewOfflineConsultation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReviewOfflineConsultationInput) => {
      const { data, error } = await supabase.rpc('review_offline_consultation', {
        p_consultation_id: input.consultationId,
        p_action: input.action,
        p_reason: input.reason ?? null,
        p_expected_revision: input.expectedRevision,
      });
      if (error) throw error;
      if (!data) throw new Error('Offline consultation was not reviewed.');
      return data;
    },
    onSuccess: (consultation) => {
      invalidateOfflineConsultationQueries(queryClient, consultation);
    },
  });
}

export function useOfflineConsultationAudit(consultationId: string | null | undefined) {
  return useQuery({
    queryKey: ['offline_consultation_audit', consultationId],
    enabled: !!consultationId,
    queryFn: async (): Promise<OfflineConsultationAuditEntry[]> => {
      const { data, error } = await supabase.rpc('get_offline_consultation_audit', {
        p_consultation_id: consultationId!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
