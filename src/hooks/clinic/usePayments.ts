import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { PatientPaymentAllocation } from '@/lib/clinic/paymentAllocations';
import type { PaymentRow } from '@/types/clinic';

const PAYMENTS_KEY = (queueEntryId: string) => ['payments', queueEntryId] as const;
const LEDGER_KEY = ['payments_ledger'] as const;

export interface SplitPaymentInput {
  queue_entry_id: string;
  consultation_id: string | null;
  payment_type: 'self_pay' | 'panel';
  expected_patient_amount: number;
  payments: PatientPaymentAllocation[];
  provider_id?: string | null;
  notes?: string | null;
  idempotency_key: string;
}

function splitPaymentRows(payments: PatientPaymentAllocation[]) {
  return payments.map(({ method, amount }) => ({ payment_method: method, amount }));
}

function invalidateSplitPaymentQueries(qc: ReturnType<typeof useQueryClient>, queueEntryId: string) {
  qc.invalidateQueries({ queryKey: PAYMENTS_KEY(queueEntryId) });
  qc.invalidateQueries({ queryKey: LEDGER_KEY });
  qc.invalidateQueries({ queryKey: ['consultation'] });
  qc.invalidateQueries({ queryKey: ['clinic'] });
  qc.invalidateQueries({ queryKey: ['visit-panel-claim', queueEntryId] });
  qc.invalidateQueries({ queryKey: ['panel_claims'] });
  qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
  qc.invalidateQueries({ queryKey: ['panel_claim_items', queueEntryId] });
}

/** Active payments for a queue entry, with realtime updates. */
export function usePayments(queueEntryId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<PaymentRow[]>({
    queryKey: ['payments', queueEntryId ?? ''],
    enabled: !!queueEntryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('queue_entry_id', queueEntryId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  useEffect(() => {
    if (!queueEntryId) return;
    const channel = supabase
      .channel(`payments-${queueEntryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `queue_entry_id=eq.${queueEntryId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: PAYMENTS_KEY(queueEntryId) });
          qc.invalidateQueries({ queryKey: LEDGER_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queueEntryId, qc]);

  return query;
}

export type LedgerPayment = PaymentRow & {
  queue_entries: {
    id: string;
    queue_sequence: number | null;
    clinic_status: string;
    created_at: string;
    patient_id: string;
    patients: { name: string; phone: string | null } | null;
    insurance_providers: { name: string } | null;
  } | null;
};

/** Joined payments + queue entries within a date range, for the Billings ledger. */
export function usePaymentsLedger(fromISO: string, toISO: string) {
  return useQuery<LedgerPayment[]>({
    queryKey: [...LEDGER_KEY, fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          `
          *,
          queue_entries (
            id, queue_sequence, clinic_status, created_at, patient_id,
            patients ( name, phone ),
            insurance_providers:panel_id ( name )
          )
        `,
        )
        .is('deleted_at', null)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LedgerPayment[];
    },
    staleTime: 30_000,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      queue_entry_id: string;
      consultation_id?: string | null;
      payment_type: string;
      payment_method: string;
      amount: number;
      notes?: string | null;
      idempotency_key: string;
    }) => {
      const { data, error } = await supabase.rpc('record_split_payments', {
        p_queue_entry_id: input.queue_entry_id,
        p_consultation_id: input.consultation_id ?? null,
        p_payment_type: input.payment_type,
        p_payments: [{ payment_method: input.payment_method, amount: input.amount }],
        p_notes: input.notes ?? null,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(vars.queue_entry_id) });
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRecordPaymentAndCompleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      queue_entry_id: string;
      consultation_id: string | null;
      payment_type: string;
      payment_method: string;
      amount: number;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc(
        'record_payment_and_complete_visit',
        {
          p_queue_entry_id: input.queue_entry_id,
          p_consultation_id: input.consultation_id,
          p_payment_type: input.payment_type,
          p_payment_method: input.payment_method,
          p_amount: input.amount,
          p_notes: input.notes ?? null,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(vars.queue_entry_id) });
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: ['consultation'] });
      qc.invalidateQueries({ queryKey: ['clinic'] });
    },
  });
}

export function useRecordSplitPaymentsAndCompleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitPaymentInput) => {
      const { data, error } = await supabase.rpc('record_split_payments_and_complete_visit', {
        p_queue_entry_id: input.queue_entry_id,
        p_consultation_id: input.consultation_id,
        p_payment_type: input.payment_type,
        p_expected_patient_amount: input.expected_patient_amount,
        p_payments: splitPaymentRows(input.payments),
        p_provider_id: input.provider_id ?? null,
        p_notes: input.notes ?? null,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw new Error(error.message || 'Split payment checkout failed');
      return data;
    },
    onSuccess: (_, vars) => invalidateSplitPaymentQueries(qc, vars.queue_entry_id),
    onError: (error, vars) => {
      if (error instanceof Error && error.message.includes('STALE_PATIENT_OUTSTANDING')) {
        invalidateSplitPaymentQueries(qc, vars.queue_entry_id);
      }
    },
  });
}

export function useRecordSplitPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SplitPaymentInput) => {
      const { data, error } = await supabase.rpc('record_split_payments', {
        p_queue_entry_id: input.queue_entry_id,
        p_consultation_id: input.consultation_id,
        p_payment_type: input.payment_type,
        p_payments: splitPaymentRows(input.payments),
        p_notes: input.notes ?? null,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => invalidateSplitPaymentQueries(qc, vars.queue_entry_id),
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      queue_entry_id,
      reason,
    }: {
      id: string;
      queue_entry_id: string;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('void_payment_portion', {
        p_payment_id: id,
        p_reason: reason,
      });
      if (error) throw error;
      return queue_entry_id;
    },
    onSuccess: (queue_entry_id) => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(queue_entry_id) });
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: ['visit-panel-claim', queue_entry_id] });
      qc.invalidateQueries({ queryKey: ['panel_claims'] });
      qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
      qc.invalidateQueries({ queryKey: ['panel_claim_items', queue_entry_id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
