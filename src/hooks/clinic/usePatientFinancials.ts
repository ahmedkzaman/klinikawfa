import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function formatRm(n: number): string {
  return `RM ${n.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface OutstandingResult {
  patientOutstanding: number;
  panelOutstanding: number;
  hasPatientDebt: boolean;
  hasPanelDebt: boolean;
  unpaidVisitsCount: number;
}

const EMPTY: OutstandingResult = {
  patientOutstanding: 0,
  panelOutstanding: 0,
  hasPatientDebt: false,
  hasPanelDebt: false,
  unpaidVisitsCount: 0,
};

const ACTIVE_CLAIM_STATUSES = new Set(['pending', 'submitted', 'approved']);

/**
 * Dual-ledger outstanding balances for a patient across all historical visits.
 *
 * - patientOutstanding: cash the patient still owes (after panel coverage and
 *   any payments already collected).
 * - panelOutstanding: corporate panel claims that are billed but not yet
 *   disbursed (excludes rejected / cancelled / received).
 */
export function usePatientOutstanding(patientId: string | undefined | null) {
  const enabled = !!patientId;

  const query = useQuery<OutstandingResult>({
    queryKey: ['patient_outstanding', patientId ?? ''],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // 1) Active consultations for this patient.
      const { data: consultations, error: cErr } = await supabase
        .from('consultations')
        .select('id, queue_entry_id')
        .eq('patient_id', patientId!)
        .is('deleted_at', null);
      if (cErr) throw cErr;
      if (!consultations || consultations.length === 0) return EMPTY;

      const consultationIds = consultations.map((c) => c.id);
      const queueEntryIds = Array.from(
        new Set(consultations.map((c) => c.queue_entry_id).filter(Boolean) as string[]),
      );

      // 2) Active items, payments, and panel claims — fetched in parallel.
      const [itemsRes, paymentsRes, claimsRes] = await Promise.all([
        supabase
          .from('consultation_items')
          .select('consultation_id, price, quantity')
          .in('consultation_id', consultationIds)
          .is('deleted_at', null),
        queueEntryIds.length
          ? supabase
              .from('payments')
              .select('queue_entry_id, amount, payment_type')
              .in('queue_entry_id', queueEntryIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [], error: null }),
        queueEntryIds.length
          ? supabase
              .from('panel_claims')
              .select('queue_entry_id, amount, received_amount, status')
              .in('queue_entry_id', queueEntryIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (claimsRes.error) throw claimsRes.error;

      // 3) Index by visit (queue_entry_id).
      const visitTotalByEntry = new Map<string, number>();
      const consultationToEntry = new Map<string, string | null>(
        consultations.map((c) => [c.id, c.queue_entry_id ?? null]),
      );

      for (const it of itemsRes.data ?? []) {
        const entryId = consultationToEntry.get(it.consultation_id as string);
        if (!entryId) continue;
        const line = Number(it.price ?? 0) * Number(it.quantity ?? 0);
        visitTotalByEntry.set(entryId, (visitTotalByEntry.get(entryId) ?? 0) + line);
      }

      const patientPaidByEntry = new Map<string, number>();
      const panelPaidViaPaymentsByEntry = new Map<string, number>();
      for (const p of paymentsRes.data ?? []) {
        const entryId = p.queue_entry_id as string | null;
        if (!entryId) continue;
        const amt = Number(p.amount ?? 0);
        if (p.payment_type === 'panel') {
          panelPaidViaPaymentsByEntry.set(
            entryId,
            (panelPaidViaPaymentsByEntry.get(entryId) ?? 0) + amt,
          );
        } else {
          patientPaidByEntry.set(entryId, (patientPaidByEntry.get(entryId) ?? 0) + amt);
        }
      }

      // Per-visit panel coverage and disbursement (only count "active" claims
      // toward outstanding panel debt — ignore rejected/cancelled/received).
      const panelCoveredByEntry = new Map<string, number>();
      const panelReceivedByEntry = new Map<string, number>();
      const panelClaimActive = new Map<string, boolean>();
      for (const c of claimsRes.data ?? []) {
        const entryId = c.queue_entry_id as string | null;
        if (!entryId) continue;
        panelCoveredByEntry.set(
          entryId,
          (panelCoveredByEntry.get(entryId) ?? 0) + Number(c.amount ?? 0),
        );
        panelReceivedByEntry.set(
          entryId,
          (panelReceivedByEntry.get(entryId) ?? 0) + Number(c.received_amount ?? 0),
        );
        if (ACTIVE_CLAIM_STATUSES.has(String(c.status))) {
          panelClaimActive.set(entryId, true);
        }
      }

      // 4) Aggregate the two ledgers.
      let patientOutstanding = 0;
      let panelOutstanding = 0;
      let unpaidVisitsCount = 0;

      for (const entryId of queueEntryIds) {
        const visitTotal = visitTotalByEntry.get(entryId) ?? 0;
        const panelCovered = panelCoveredByEntry.get(entryId) ?? 0;
        const patientPortion = Math.max(visitTotal - panelCovered, 0);
        const patientPaid = patientPaidByEntry.get(entryId) ?? 0;
        const panelReceived =
          (panelReceivedByEntry.get(entryId) ?? 0) +
          (panelPaidViaPaymentsByEntry.get(entryId) ?? 0);

        const visitPatientOut = Math.max(patientPortion - patientPaid, 0);
        const visitPanelOut = panelClaimActive.get(entryId)
          ? Math.max(panelCovered - panelReceived, 0)
          : 0;

        patientOutstanding += visitPatientOut;
        panelOutstanding += visitPanelOut;
        if (visitPatientOut > 0.005 || visitPanelOut > 0.005) unpaidVisitsCount += 1;
      }

      return {
        patientOutstanding,
        panelOutstanding,
        hasPatientDebt: patientOutstanding > 0.005,
        hasPanelDebt: panelOutstanding > 0.005,
        unpaidVisitsCount,
      };
    },
  });

  return {
    ...(query.data ?? EMPTY),
    isLoading: enabled && query.isLoading,
  };
}
