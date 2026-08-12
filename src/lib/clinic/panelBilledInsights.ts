export type PanelClaimStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

export interface PanelClaimRow {
  amount: number | string | null;
  status: PanelClaimStatus;
}

export interface PanelBilledSummary {
  totalBilled: number;
  claimCount: number;
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
    return summary;
  }, { totalBilled: 0, claimCount: 0 });
}
