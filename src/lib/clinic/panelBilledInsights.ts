export type PanelClaimStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

export interface PanelClaimRow {
  id?: string | null;
  queue_entry_id?: string | null;
  claim_date?: string | null;
  due_date?: string | null;
  received_date?: string | null;
  amount: number | string | null;
  received_amount?: number | string | null;
  insurance_providers?: { id?: string | null; name?: string | null } | null;
  status: PanelClaimStatus;
}

export interface PanelBilledSummary {
  totalBilled: number;
  totalReceived: number | null;
  claimCount: number;
  claims: PanelClaimRow[];
}

const BILLED_STATUSES = new Set<PanelClaimStatus>([
  'pending',
  'submitted',
  'approved',
  'received',
]);

export function isPanelClaimBilled(status: PanelClaimStatus): boolean {
  return BILLED_STATUSES.has(status);
}

export function aggregatePanelBilledClaims(rows: PanelClaimRow[]): PanelBilledSummary {
  return rows.reduce<PanelBilledSummary>((summary, row) => {
    summary.claims.push(row);
    if (!isPanelClaimBilled(row.status)) return summary;
    const amount = Number(row.amount ?? 0);
    summary.totalBilled += Number.isFinite(amount) ? amount : 0;
    summary.claimCount += 1;
    return summary;
  }, { totalBilled: 0, totalReceived: 0, claimCount: 0, claims: [] });
}
