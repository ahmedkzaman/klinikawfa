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
  expectedRevision: number | null;
};

export type ReviewOfflineConsultationInput = {
  consultationId: string;
  action: 'approve' | 'return';
  reason?: string | null;
  expectedRevision: number;
};

export type OfflineConsultationAuditEntry =
  Database['public']['Functions']['get_offline_consultation_audit']['Returns'][number];

export const OFFLINE_CONSULTATION_AUDIT_LIMIT = 50;

export type EligibleOfflineDoctor = {
  id: string;
  user_id: string;
  name: string;
  status: 'active';
  on_duty: boolean;
  avatar_url: string | null;
};

export type OfflineConsultationEntryState = {
  consultation_id: string;
  queue_entry_id: string;
  doctor_id: string;
  doctor_name: string;
  approval_status: 'pending' | 'returned' | 'approved';
  approval_revision: number;
  entered_by_name: string;
  entered_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  return_reason: string | null;
  consultation_status: string;
  queue_status: string;
};

type RpcResult = { data: unknown; error: { message: string } | null };
const offlineRpc = supabase.rpc as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;

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
      return (data ?? [])
        .slice(-OFFLINE_CONSULTATION_AUDIT_LIMIT)
        .map(({ id, action, actor_id, actor_name, created_at, reason }) => ({
          id,
          action,
          actor_id,
          actor_name,
          created_at,
          reason,
        }));
    },
  });
}

export function useOfflineConsultationEntryVisits(
  start: string,
  end: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['offline_consultation_entry_visits', start, end],
    enabled,
    queryFn: async () => {
      const { data, error } = await offlineRpc('list_offline_consultation_entry_visits', {
        p_start: start,
        p_end: end,
      });
      if (error) throw new Error(error.message);
      return new Set(((data ?? []) as { queue_entry_id: string }[]).map((row) => row.queue_entry_id));
    },
  });
}

export function useEligibleOfflineConsultationDoctors(enabled: boolean) {
  return useQuery({
    queryKey: ['eligible_offline_consultation_doctors'],
    enabled,
    queryFn: async () => {
      const { data, error } = await offlineRpc('list_eligible_offline_consultation_doctors');
      if (error) throw new Error(error.message);
      return (data ?? []) as EligibleOfflineDoctor[];
    },
  });
}

export function useOfflineConsultationEntryState(
  consultationId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['offline_consultation_entry_state', consultationId],
    enabled: enabled && !!consultationId,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await offlineRpc('get_offline_consultation_entry_state', {
        p_consultation_id: consultationId!,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as OfflineConsultationEntryState[])[0] ?? null;
    },
  });
}

export async function assertOfflineConsultationEditable(consultationId: string) {
  const { error } = await offlineRpc('assert_offline_consultation_editable', {
    p_consultation_id: consultationId,
  });
  if (error) throw new Error(error.message);
}

export function useProceedOfflineConsultationToDispensary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ consultationId, expectedRevision }: {
      consultationId: string;
      expectedRevision: number;
    }) => {
      const { data, error } = await offlineRpc('proceed_offline_consultation_to_dispensary', {
        p_consultation_id: consultationId,
        p_expected_revision: expectedRevision,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultation_queue'] });
      queryClient.invalidateQueries({ queryKey: ['offline_consultation_entry_visits'] });
    },
  });
}
