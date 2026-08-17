import { csvEscape } from './exports';

export const FINANCE_SECTIONS = [
  'summary',
  'collections',
  'panels',
  'costs',
  'reconciliation',
  'advanced',
] as const;

export type FinanceSection = (typeof FINANCE_SECTIONS)[number];

export type FinanceLedgerSummary = {
  visitBilled: number | null;
  patientCollected: number | null;
  panelBilled: number | null;
  panelReceived: number | null;
  patientOutstanding: number | null;
  panelOutstanding: number | null;
};

type FinanceLedgerInput = {
  financialControl?: {
    period?: { billedRevenue?: number | null; cashCollected?: number | null };
    reconciliation?: {
      selfPayOutstanding?: number | null;
      panelOutstanding?: number | null;
    };
  } | null;
  sales?: { summary?: { totalCollected?: number | null } } | null;
  panelBilled?: { totalBilled?: number | null; totalReceived?: number | null } | null;
};

export type FinanceCollectionRow = {
  paymentMethod?: string | null;
  amount?: number | string | null;
};

export type FinanceCollectionGroup = {
  key: 'card' | 'qr_pay' | 'cash' | 'e_wallet' | 'other';
  label: 'Card' | 'QR Pay' | 'Cash' | 'E-wallet' | 'Other';
  collected: number;
  paymentCount: number;
};
export type FinanceCollectionKey = FinanceCollectionGroup['key'];

type DailyBillingRow = { visit_date: string; revenue: number | string | null };
type DailyCollectionRow = { createdAt: string; amount: number | string | null };
type DailyPanelRow = { claim_date?: string | null; amount: number | string | null; status: string };
type LifecycleRow = {
  status: string;
  due_date?: string | null;
  amount: number | string | null;
  received_amount?: number | string | null;
};
type PanelCsvRow = LifecycleRow & {
  id?: string | null;
  claim_date?: string | null;
  queue_entry_id?: string | null;
  provider?: string | null;
  provider_name?: string | null;
  panel_provider_name?: string | null;
  insurance_providers?: { name?: string | null } | null;
};

const COLLECTION_GROUPS: Array<Pick<FinanceCollectionGroup, 'key' | 'label'>> = [
  { key: 'card', label: 'Card' },
  { key: 'qr_pay', label: 'QR Pay' },
  { key: 'cash', label: 'Cash' },
  { key: 'e_wallet', label: 'E-wallet' },
  { key: 'other', label: 'Other' },
];

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildFinanceLedgerSummary(input: FinanceLedgerInput): FinanceLedgerSummary {
  const patientCollected = finiteOrNull(input.sales?.summary?.totalCollected);
  const panelReceived = finiteOrNull(input.panelBilled?.totalReceived);

  return {
    visitBilled: finiteOrNull(input.financialControl?.period?.billedRevenue),
    patientCollected,
    panelBilled: finiteOrNull(input.panelBilled?.totalBilled),
    panelReceived,
    patientOutstanding: finiteOrNull(input.financialControl?.reconciliation?.selfPayOutstanding),
    panelOutstanding: finiteOrNull(input.financialControl?.reconciliation?.panelOutstanding),
  };
}

export function financeCollectionKey(method: string | null | undefined): FinanceCollectionGroup['key'] | null {
  const normalized = String(method ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized || normalized === 'panel') return null;
  if (normalized === 'card' || normalized.includes('credit') || normalized.includes('debit')) return 'card';
  if (normalized === 'qr_pay' || normalized.includes('duitnow') || normalized.startsWith('qr')) return 'qr_pay';
  if (normalized === 'cash') return 'cash';
  if (normalized.includes('e_wallet') || normalized.includes('ewallet') || normalized.includes('touch_n_go') || normalized === 'tng') return 'e_wallet';
  return 'other';
}

export function groupFinanceCollections(rows: FinanceCollectionRow[]): FinanceCollectionGroup[] {
  const totals = new Map(COLLECTION_GROUPS.map(({ key }) => [key, { collected: 0, paymentCount: 0 }]));
  for (const row of rows) {
    const key = financeCollectionKey(row.paymentMethod);
    if (!key) continue;
    const amount = Number(row.amount ?? 0);
    const current = totals.get(key) as { collected: number; paymentCount: number };
    current.collected += Number.isFinite(amount) ? amount : 0;
    current.paymentCount += 1;
  }
  return COLLECTION_GROUPS.map(({ key, label }) => ({ key, label, ...(totals.get(key) as { collected: number; paymentCount: number }) }));
}

export function clinicDateKey(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildFinanceDailyRevenueCsv(
  billingRows: DailyBillingRow[],
  collectionRows: DailyCollectionRow[],
  panelRows: DailyPanelRow[],
): string[] {
  const totals = new Map<string, { visitBilled: number; patientCollected: number; panelBilled: number }>();
  const forDate = (date: string) => {
    const current = totals.get(date) ?? { visitBilled: 0, patientCollected: 0, panelBilled: 0 };
    totals.set(date, current);
    return current;
  };
  for (const row of billingRows) {
    forDate(row.visit_date).visitBilled += finiteOrNull(row.revenue) ?? 0;
  }
  for (const row of collectionRows) {
    const date = clinicDateKey(row.createdAt);
    if (date) forDate(date).patientCollected += finiteOrNull(row.amount) ?? 0;
  }
  for (const row of panelRows) {
    if (row.claim_date && !isTerminalPanelClaim(row.status)) {
      forDate(row.claim_date).panelBilled += finiteOrNull(row.amount) ?? 0;
    }
  }
  return [
    'date,visit_billed,patient_collected,panel_billed',
    ...[...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => [
      date,
      value.visitBilled.toFixed(2),
      value.patientCollected.toFixed(2),
      value.panelBilled.toFixed(2),
    ].join(',')),
  ];
}

export function isTerminalPanelClaim(status: string): boolean {
  return ['rejected', 'cancelled'].includes(String(status ?? '').trim().toLowerCase());
}

export function panelClaimFinancialAmounts(claim: LifecycleRow): {
  billed: number;
  received: number;
  outstanding: number;
} {
  const rawBilled = finiteOrNull(claim.amount) ?? 0;
  const received = finiteOrNull(claim.received_amount) ?? 0;
  if (isTerminalPanelClaim(claim.status)) return { billed: 0, received, outstanding: 0 };
  return { billed: rawBilled, received, outstanding: Math.max(rawBilled - received, 0) };
}

export function buildPanelClaimsCsv(claims: PanelCsvRow[]): string[] {
  return [
    'claim_id,claim_date,provider,status,queue_entry_id,billed,received,outstanding',
    ...claims.map((claim) => {
      const amounts = panelClaimFinancialAmounts(claim);
      const provider = claim.provider
        ?? claim.provider_name
        ?? claim.panel_provider_name
        ?? claim.insurance_providers?.name
        ?? '';
      return [
        claim.id,
        claim.claim_date,
        provider,
        claim.status,
        claim.queue_entry_id,
        amounts.billed.toFixed(2),
        amounts.received.toFixed(2),
        amounts.outstanding.toFixed(2),
      ].map(csvEscape).join(',');
    }),
  ];
}

export function panelLifecycleLabel(claim: LifecycleRow, asOfDate: string): string {
  const normalized = String(claim.status ?? '').trim().toLowerCase();
  const base = normalized === 'pending'
    ? 'Unsubmitted'
    : normalized
      ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1).replace(/_/g, ' ')}`
      : 'Unknown';
  const received = finiteOrNull(claim.received_amount) ?? 0;
  const billed = finiteOrNull(claim.amount) ?? 0;
  const overdue = !['received', 'rejected', 'cancelled'].includes(normalized)
    && billed - received > 0
    && Boolean(claim.due_date && claim.due_date < asOfDate);
  return overdue ? `${base} · Overdue` : base;
}

export function panelClaimHref(claimId: string): string {
  const params = new URLSearchParams({ tab: 'all', claim: claimId });
  return `/clinic/panel-claims?${params.toString()}`;
}

export function parsePanelClaimId(search: string): string | null {
  const claimId = new URLSearchParams(search).get('claim')?.trim();
  return claimId || null;
}

export function parseFinanceCollection(search: string): FinanceCollectionKey | null {
  const params = new URLSearchParams(search);
  if (params.get('section') !== 'finance' || params.get('finance') !== 'collections') return null;
  const collection = params.get('collection');
  return COLLECTION_GROUPS.some(({ key }) => key === collection)
    ? collection as FinanceCollectionKey
    : null;
}

function sectionForMetric(metric: string | null, alert: string | null): FinanceSection {
  if (metric === 'cash_collected') return 'collections';
  if (metric === 'cogs' || metric === 'gross_profit' || metric === 'margin') return 'costs';
  if (metric === 'cohort_outstanding' || metric === 'total_outstanding' || metric === 'adjustments') return 'reconciliation';
  if (metric === 'alerts' && (alert === 'unsubmitted_panel' || alert === 'overdue_panel')) return 'panels';
  return 'summary';
}

export function parseFinanceSection(search: string): FinanceSection {
  const params = new URLSearchParams(search);
  const section = params.get('finance');
  if (FINANCE_SECTIONS.includes(section as FinanceSection)) return section as FinanceSection;
  return sectionForMetric(params.get('metric'), params.get('alert'));
}

export function withFinanceSection(search: string, section: FinanceSection): string {
  const params = new URLSearchParams(search);
  params.set('section', 'finance');
  params.set('finance', section);
  for (const key of ['metric', 'alert', 'collection', 'panel']) params.delete(key);
  return `?${params.toString()}`;
}
