export type PanelClaimStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

export interface PanelClaimRow {
  queue_entry_id?: string | null;
  claim_date?: string | null;
  amount: number | string | null;
  status: PanelClaimStatus;
}

export interface PanelBilledSummary {
  totalBilled: number;
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
    if (!isPanelClaimBilled(row.status)) return summary;
    const amount = Number(row.amount ?? 0);
    summary.totalBilled += Number.isFinite(amount) ? amount : 0;
    summary.claimCount += 1;
    summary.claims.push(row);
    return summary;
  }, { totalBilled: 0, claimCount: 0, claims: [] });
}
