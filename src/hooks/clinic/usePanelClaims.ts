import { useQuery } from '@tanstack/react-query';
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
  remarks: string | null;
  created_at: string;
  is_overdue: boolean;
  insurance_providers: { id: string; name: string } | null;
  patients: { id: string; name: string } | null;
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
  remarks, created_at, is_overdue,
  insurance_providers:panel_id ( id, name ),
  patients:patient_id ( id, name ),
  updater:profiles!fk_panel_claims_updated_by ( id, full_name, email )
` as const;

// Cast supabase client to any for the new view (`panel_claims_view`) which is
// not yet present in the auto-generated types until the next regeneration.
// The shape is enforced via PanelClaimRow above.
const db = supabase as unknown as {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

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
        rows: ((data ?? []) as unknown as PanelClaimRow[]).map((row) => ({
          ...row,
          amount: Number(row.amount ?? 0),
          received_amount:
            row.received_amount === null || row.received_amount === undefined
              ? null
              : Number(row.received_amount),
        })),
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
