import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

interface PanelClaimsPage {
  rows: PanelClaimRow[];
  total: number;
}

const PANEL_CLAIMS_SELECT = `
  id, claim_no, amount, received_amount, status, claim_date, due_date,
  submitted_date, approved_amount, write_off_amount,
  payment_reference, received_date, gl_document_url,
  remarks, created_at, is_overdue, queue_entry_id,
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

export function usePanelClaims(tab: PanelClaimsTab, page: number) {
  return useQuery<PanelClaimsPage>({
    queryKey: ['panel_claims', tab, page],
    queryFn: async () => {
      const from = page * PANEL_CLAIMS_PAGE_SIZE;
      const to = from + PANEL_CLAIMS_PAGE_SIZE - 1;

      let query = db
        .from('panel_claims_view')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(PANEL_CLAIMS_SELECT, { count: 'exact' } as any)
        .order('created_at', { ascending: false })
        .range(from, to);

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

function aggregate(rows: SummaryRowRaw[]): PanelClaimsSummary {
  const summary: PanelClaimsSummary = {
    pendingCount: 0,
    overdueCount: 0,
    approvedSum: 0,
    rejectedSum: 0,
    receivedSum: 0,
    outstandingSum: 0,
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

    if (OUTSTANDING_STATUSES.includes(r.status)) {
      summary.outstandingSum += amount;
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
      return aggregate((data ?? []) as unknown as SummaryRowRaw[]);
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
      const { id, ...rest } = payload;
      const { data: auth } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { ...rest, updated_by: auth.user?.id ?? null };

      // Auto-stamp dates on transition if caller didn't supply them
      const today = new Date().toISOString().slice(0, 10);
      if (rest.status === 'submitted' && !('submitted_date' in rest)) {
        patch.submitted_date = today;
      }
      if (rest.status === 'received' && !('received_date' in rest)) {
        patch.received_date = today;
      }

      const { error } = await supabase
        .from('panel_claims')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['panel_claims'] });
      qc.invalidateQueries({ queryKey: ['panel_claims_summary'] });
    },
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
