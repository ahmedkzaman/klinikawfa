import { useQuery } from '@tanstack/react-query';
import { calculateDualLedger } from '@/lib/clinic/dualLedger';
import { formatQueueNo } from '@/lib/clinic/queueNumber';

type HistoryPaymentRow = {
  id: string;
  amount: number | string | null;
  payment_method: string | null;
  payment_type: string | null;
  created_at: string;
  deleted_at?: string | null;
};

type HistoryItemRow = {
  quantity: number | string | null;
  price: number | string | null;
  deleted_at?: string | null;
};

type HistoryPanelClaimRow = {
  amount: number | string | null;
  received_amount?: number | string | null;
  status?: string | null;
};

export type PatientVisitPaymentHistorySourceRow = {
  id: string;
  queue_sequence: number | null;
  created_at: string;
  payment_method?: string | null;
  panel_id?: string | null;
  payments?: HistoryPaymentRow[] | null;
  panel_claims?: HistoryPanelClaimRow[] | null;
  consultations?: Array<{
    consultation_items?: HistoryItemRow[] | null;
  }> | { consultation_items?: HistoryItemRow[] | null } | null;
};

export type PatientVisitPaymentHistoryItem = {
  queueEntryId: string;
  queueLabel: string;
  visitDate: string;
  total: number;
  patientPaid: number;
  panelReceived: number;
  patientOutstanding: number;
  panelOutstanding: number;
  payments: Array<{
    id: string;
    amount: number;
    method: string | null;
    createdAt: string;
  }>;
};

const ACTIVE_CLAIM_STATUSES = new Set(['pending', 'submitted', 'approved', 'received']);

function list<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function money(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

export function mapPatientVisitPaymentHistoryRows(
  rows: PatientVisitPaymentHistorySourceRow[],
): PatientVisitPaymentHistoryItem[] {
  return rows
    .map((row) => {
      const consultations = list(row.consultations);
      const items = consultations.flatMap((consultation) =>
        list(consultation.consultation_items).filter((item) => !item.deleted_at),
      );
      const payments = list(row.payments).filter((payment) => !payment.deleted_at);
      const claims = list(row.panel_claims);
      const activeClaims = claims.filter((claim) =>
        ACTIVE_CLAIM_STATUSES.has(String(claim.status ?? '').toLowerCase()),
      );
      const claimSource = activeClaims.length ? activeClaims : claims.slice(0, 1);
      const total = money(
        items.reduce(
          (sum, item) => sum + money(item.price) * money(item.quantity),
          0,
        ),
      );
      const panelClaim = claimSource.length
        ? {
          amount: claimSource.reduce((sum, claim) => sum + money(claim.amount), 0),
          receivedAmount: claimSource.reduce((sum, claim) => sum + money(claim.received_amount), 0),
          status: activeClaims.length ? activeClaims[0]?.status ?? null : claimSource[0]?.status ?? null,
        }
        : null;
      const ledger = calculateDualLedger({
        billedTotal: total,
        patientPayments: payments.map((payment) => ({
          amount: money(payment.amount),
          deletedAt: payment.deleted_at,
          paymentMethod: payment.payment_method,
        })),
        panelPayments: payments
          .filter((payment) => payment.payment_method === 'panel')
          .reduce((sum, payment) => sum + money(payment.amount), 0),
        expectsPanel:
          row.payment_method?.trim().toLowerCase() === 'panel' ||
          Boolean(row.panel_id) ||
          activeClaims.length > 0 ||
          payments.some((payment) => payment.payment_type === 'panel' || payment.payment_type === 'insurance'),
        panelClaim,
      });

      return {
        queueEntryId: row.id,
        queueLabel: formatQueueNo(row.created_at, row.queue_sequence),
        visitDate: row.created_at,
        total,
        patientPaid: ledger.patientPaid,
        panelReceived: ledger.panelReceived,
        patientOutstanding: ledger.patientOutstanding,
        panelOutstanding: ledger.panelOutstanding,
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: money(payment.amount),
          method: payment.payment_method,
          createdAt: payment.created_at,
        })),
      };
    })
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

export function usePatientVisitPaymentHistory(patientId: string | null | undefined) {
  return useQuery<PatientVisitPaymentHistoryItem[]>({
    queryKey: ['patient-visit-payment-history', patientId ?? ''],
    enabled: Boolean(patientId),
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('queue_entries')
        .select(`
          id,
          queue_sequence,
          created_at,
          payment_method,
          panel_id,
          consultations:consultations!consultations_queue_entry_id_fkey (
            consultation_items!left ( quantity, price, deleted_at )
          ),
          payments ( id, amount, payment_method, payment_type, created_at, deleted_at ),
          panel_claims ( amount, received_amount, status )
        `)
        .eq('patient_id', patientId!)
        .is('deleted_at', null)
        .is('consultations.consultation_items.deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      return mapPatientVisitPaymentHistoryRows(
        (data ?? []) as unknown as PatientVisitPaymentHistorySourceRow[],
      );
    },
  });
}
