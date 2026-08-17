import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  malaysiaTodayIso,
  type PanelClaimPortion,
  type PanelClaimPortionDraft,
  type PanelClaimPortionStatus,
} from '@/lib/clinic/panelClaimPortions';

export const PANEL_CLAIMS_PAGE_SIZE = 50;

export type PanelClaimStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

export type PanelClaimsTab = 'all' | 'overdue' | PanelClaimStatus;

export interface PanelClaimRow {
  id: string;
  claim_no: string;
  amount: number;
  received_amount: number | null;
  status: PanelClaimStatus;
  claim_date: string;
  due_date: string | null;
  submitted_date: string | null;
  approved_amount: number | null;
  write_off_amount: number | null;
  payment_reference: string | null;
  received_date: string | null;
  gl_document_url: string | null;
  remarks: string | null;
  created_at: string;
  is_overdue: boolean;
  portions_version: number;
  queue_entry_id: string | null;
  insurance_providers: { id: string; name: string } | null;
  patients: { id: string; name: string; reg_no: string | null } | null;
  updater: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface PanelClaimsSummary {
  pendingCount: number;
  overdueCount: number;
  approvedSum: number;
  rejectedSum: number;
  receivedSum: number;
  outstandingSum: number;
  creditDueSum: number;
}

interface PanelClaimsPage {
  rows: PanelClaimRow[];
  total: number;
}

const PANEL_CLAIMS_SELECT = `
  id, claim_no, amount, received_amount, status, claim_date, due_date,
  submitted_date, approved_amount, write_off_amount,
  payment_reference, received_date, gl_document_url,
  remarks, created_at, is_overdue, portions_version, queue_entry_id,
  insurance_providers:panel_id ( id, name ),
  patients:patient_id ( id, name, reg_no ),
  updater:profiles!fk_panel_claims_updated_by ( id, full_name, email )
` as const;

// Cast supabase client to any for the new view (`panel_claims_view`) which is
// not yet present in the auto-generated types until the next regeneration.
const db = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

function normalizeRow(row: PanelClaimRow): PanelClaimRow {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    received_amount:
      row.received_amount === null || row.received_amount === undefined
        ? null
        : Number(row.received_amount),
    approved_amount:
      row.approved_amount === null || row.approved_amount === undefined
        ? null
        : Number(row.approved_amount),
    write_off_amount:
      row.write_off_amount === null || row.write_off_amount === undefined
        ? null
        : Number(row.write_off_amount),
  };
}

export function usePanelClaims(tab: PanelClaimsTab, page: number, claimId?: string | null) {
  return useQuery<PanelClaimsPage>({
    queryKey: claimId ? ['panel_claims', tab, page, claimId] : ['panel_claims', tab, page],
    queryFn: async () => {
      const from = page * PANEL_CLAIMS_PAGE_SIZE;
      const to = from + PANEL_CLAIMS_PAGE_SIZE - 1;

      let query = db
        .from('panel_claims_view')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(PANEL_CLAIMS_SELECT, { count: 'exact' } as any)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (claimId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq('id', claimId);
      }

      if (tab === 'overdue') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq('is_overdue', true);
      } else if (tab !== 'all') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq('status', tab);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        rows: ((data ?? []) as unknown as PanelClaimRow[]).map(normalizeRow),
        total: count ?? 0,
      };
    },
  });
}

interface SummaryRowRaw {
  status: PanelClaimStatus;
  amount: number | string | null;
  received_amount: number | string | null;
  is_overdue: boolean | null;
}

const OUTSTANDING_STATUSES: PanelClaimStatus[] = [
  'pending',
  'submitted',
  'approved',
];

export function aggregatePanelClaimsSummary(rows: SummaryRowRaw[]): PanelClaimsSummary {
  const summary: PanelClaimsSummary = {
    pendingCount: 0,
    overdueCount: 0,
    approvedSum: 0,
    rejectedSum: 0,
    receivedSum: 0,
    outstandingSum: 0,
    creditDueSum: 0,
  };

  for (const r of rows) {
    const amount = Number(r.amount ?? 0);
    const received =
      r.received_amount === null || r.received_amount === undefined
        ? null
        : Number(r.received_amount);

    if (r.status === 'pending') summary.pendingCount += 1;
    if (r.is_overdue) summary.overdueCount += 1;

    switch (r.status) {
      case 'approved':
        summary.approvedSum += amount;
        break;
      case 'rejected':
        summary.rejectedSum += amount;
        break;
      case 'received':
        summary.receivedSum += received ?? amount;
        break;
    }

    if (r.status !== 'cancelled' && r.status !== 'rejected') {
      summary.creditDueSum += Math.max((received ?? 0) - amount, 0);
    }
    if (OUTSTANDING_STATUSES.includes(r.status)) {
      summary.outstandingSum += Math.max(amount - (received ?? 0), 0);
    }
  }

  return summary;
}

export function usePanelClaimsSummary() {
  return useQuery<PanelClaimsSummary>({
    queryKey: ['panel_claims_summary'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from('panel_claims_view')
        .select('status, amount, received_amount, is_overdue');
      if (error) throw error;
      return aggregatePanelClaimsSummary((data ?? []) as unknown as SummaryRowRaw[]);
    },
  });
}

// ---------- Treatment items for the claim ledger ----------

export interface ClaimTreatmentItem {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface ClaimLedger {
  visit_date: string | null;
  items: ClaimTreatmentItem[];
}

export function useClaimTreatmentItems(queueEntryId: string | null | undefined) {
  return useQuery<ClaimLedger>({
    enabled: Boolean(queueEntryId),
    queryKey: ['panel_claim_items', queueEntryId],
    queryFn: async () => {
      // 1. Find the active consultation for this queue entry
      const { data: consult, error: cErr } = await supabase
        .from('consultations')
        .select('id, created_at')
        .eq('queue_entry_id', queueEntryId!)
        .is('deleted_at', null)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!consult) return { visit_date: null, items: [] };

      // 2. Fetch its active items
      const { data: items, error: iErr } = await supabase
        .from('consultation_items')
        .select('id, item_name, quantity, price')
        .eq('consultation_id', consult.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (iErr) throw iErr;

      return {
        visit_date: consult.created_at,
        items: (items ?? []).map((it) => {
          const qty = Number(it.quantity ?? 0);
          const price = Number(it.price ?? 0);
          return {
            id: it.id,
            item_name: it.item_name,
            quantity: qty,
            price,
            total: qty * price,
          };
        }),
      };
    },
  });
}

// ---------- Mutation: update claim ----------

export interface UpdateClaimPayload {
  id: string;
  status?: PanelClaimStatus;
  submitted_date?: string | null;
  approved_amount?: number | null;
  payment_reference?: string | null;
  received_date?: string | null;
  received_amount?: number | null;
  remarks?: string | null;
  gl_document_url?: string | null;
  due_date?: string | null;
}

export function useUpdatePanelClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateClaimPayload) => {
      const submittedDate = payload.submitted_date
        ?? (payload.status === 'submitted' ? malaysiaTodayIso() : null);
      const receivedDate = payload.received_date
        ?? (payload.status === 'received' ? malaysiaTodayIso() : null);
      const { error } = await supabase.rpc('update_panel_claim_workflow', {
        p_panel_claim_id: payload.id,
        p_status: payload.status ?? null,
        p_submitted_date: submittedDate,
        p_approved_amount: payload.approved_amount ?? null,
        p_payment_reference: payload.payment_reference ?? null,
        p_received_date: receivedDate,
        p_received_amount: payload.received_amount ?? null,
        p_remarks: payload.remarks ?? null,
        p_gl_document_url: payload.gl_document_url ?? null,
        p_due_date: payload.due_date ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panel_claims'] });
      qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
    },
  });
}

// ---------- Mutation: bulk mark as submitted ----------

/**
 * Bulk-marks the given claim ids as `status='submitted'` and stamps
 * `submitted_date = today`. Used by the multi-row checkbox action bar on
 * the Panel Claims page.
 */
export function useBulkMarkClaimsSubmitted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const today = malaysiaTodayIso();
      const { data, error } = await supabase.rpc('bulk_submit_panel_claims', {
        p_panel_claim_ids: ids,
        p_submitted_date: today,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panel_claims'] });
      qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
    },
  });
}

export function getPanelClaimBalances(row: Pick<PanelClaimRow, 'amount' | 'received_amount'>) {
  const amount = Number(row.amount ?? 0);
  const received = Math.max(Number(row.received_amount ?? 0), 0);
  return {
    received,
    outstanding: Math.max(amount - received, 0),
  };
}

// ---------- Payment portions ----------

function normalizePanelClaimPortion(
  portion: Omit<PanelClaimPortion, 'status'> & { status: string },
): PanelClaimPortion {
  return {
    ...portion,
    amount: Number(portion.amount),
    received_amount: Number(portion.received_amount),
    status: portion.status as PanelClaimPortionStatus,
  };
}

function invalidatePanelFinanceQueries(
  qc: ReturnType<typeof useQueryClient>,
  claimId: string,
) {
  qc.invalidateQueries({ queryKey: ['panel_claims'] });
  qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
  qc.invalidateQueries({ queryKey: ['panel_claim_portions', claimId] });
  qc.invalidateQueries({ queryKey: ['panel_claim_portion_counts'] });
  qc.invalidateQueries({ queryKey: ['financial-control'] });
  qc.invalidateQueries({ queryKey: ['clinic-health'] });
}

export function usePanelClaimPortions(claimId: string | null | undefined) {
  return useQuery({
    enabled: Boolean(claimId),
    queryKey: ['panel_claim_portions', claimId],
    queryFn: async (): Promise<PanelClaimPortion[]> => {
      const { data, error } = await supabase
        .from('panel_claim_portions')
        .select('*')
        .eq('panel_claim_id', claimId!)
        .order('portion_no');
      if (error) throw error;
      return (data ?? []).map(normalizePanelClaimPortion);
    },
  });
}

export function usePanelClaimPortionCounts(claimIds: string[]) {
  const stableClaimIds = [...claimIds].sort();
  return useQuery({
    enabled: stableClaimIds.length > 0,
    queryKey: ['panel_claim_portion_counts', stableClaimIds],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('panel_claim_portions')
        .select('panel_claim_id')
        .in('panel_claim_id', stableClaimIds);
      if (error) throw error;
      return (data ?? []).reduce<Record<string, number>>((counts, portion) => {
        counts[portion.panel_claim_id] = (counts[portion.panel_claim_id] ?? 0) + 1;
        return counts;
      }, Object.fromEntries(stableClaimIds.map((claimId) => [claimId, 0])));
    },
  });
}

export interface ReplacePanelClaimPortionsPayload {
  claimId: string;
  portions: PanelClaimPortionDraft[];
  reason: string;
  expectedVersion: number;
}

export function useReplacePanelClaimPortions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      claimId,
      portions,
      reason,
      expectedVersion,
    }: ReplacePanelClaimPortionsPayload) => {
      const { data, error } = await supabase.rpc('replace_panel_claim_portions', {
        p_panel_claim_id: claimId,
        p_portions: portions.map(({ amount, remark }) => ({ amount: Number(amount), remark })),
        p_reason: reason,
        p_expected_version: expectedVersion,
      });
      if (error) throw error;
      return (data ?? []).map(normalizePanelClaimPortion);
    },
    onSuccess: (_, { claimId }) => invalidatePanelFinanceQueries(qc, claimId),
  });
}

export interface CancelPanelClaimPortionsPayload {
  claimId: string;
  reason: string;
  expectedVersion: number;
}

export function useCancelPanelClaimPortions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, reason, expectedVersion }: CancelPanelClaimPortionsPayload) => {
      const { error } = await supabase.rpc('cancel_panel_claim_portions', {
        p_panel_claim_id: claimId,
        p_reason: reason,
        p_expected_version: expectedVersion,
      });
      if (error) throw error;
    },
    onSuccess: (_, { claimId }) => invalidatePanelFinanceQueries(qc, claimId),
  });
}

export interface RecordPanelClaimPortionPaymentPayload {
  claimId: string;
  portionId: string;
  amount: number;
  receivedDate: string;
  paymentReference: string;
  remark: string;
  idempotencyKey: string;
}

export function useRecordPanelClaimPortionPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      claimId: _claimId,
      portionId,
      amount,
      receivedDate,
      paymentReference,
      remark,
      idempotencyKey,
    }: RecordPanelClaimPortionPaymentPayload) => {
      const { data, error } = await supabase.rpc('record_panel_claim_portion_payment', {
        p_portion_id: portionId,
        p_amount: amount,
        p_received_date: receivedDate,
        p_payment_reference: paymentReference,
        p_remark: remark,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return normalizePanelClaimPortion(data);
    },
    onSuccess: (_, { claimId }) => invalidatePanelFinanceQueries(qc, claimId),
  });
}

// ---------- GL document signed URL ----------

export async function getClaimDocSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('panel-claim-docs')
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error) return null;
  return data?.signedUrl ?? null;
}
