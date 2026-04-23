import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { softDelete } from '@/lib/clinic/softDelete';
import type { PaymentRow } from '@/types/clinic';

const PAYMENTS_KEY = (queueEntryId: string) => ['payments', queueEntryId] as const;
const LEDGER_KEY = ['payments_ledger'] as const;

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
    queue_number: number | null;
    clinic_status: string;
    created_at: string;
    patient_id: string;
    patients: { name: string; phone: string | null } | null;
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
            id, queue_number, clinic_status, created_at, patient_id,
            patients ( name, phone )
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
    }) => {
      const { data, error } = await supabase
        .from('payments')
        .insert(input)
        .select()
        .single();
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

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      queue_entry_id,
    }: {
      id: string;
      queue_entry_id: string;
    }) => {
      const { error } = await softDelete('payments', id);
      if (error) throw error;
      return queue_entry_id;
    },
    onSuccess: (queue_entry_id) => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(queue_entry_id) });
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
