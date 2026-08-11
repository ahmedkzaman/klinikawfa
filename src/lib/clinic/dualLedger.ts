export type DualLedgerSettlement =
  | 'settled'
  | 'patient_due'
  | 'panel_due'
  | 'needs_attention';

export type PatientPayment = number | {
  amount: number;
  deletedAt?: string | null;
  paymentMethod?: string | null;
};

export interface PanelClaimLedgerInput {
  amount: number;
  receivedAmount?: number | null;
  status?: string | null;
}

export interface DualLedgerInput {
  billedTotal: number;
  patientPayments?: PatientPayment[];
  expectsPanel?: boolean;
  panelClaim?: PanelClaimLedgerInput | null;
  /** @deprecated Panel-method payment rows are allocation records, not panel remittances. */
  panelPayments?: number;
}

export interface DualLedgerState {
  billedTotal: number;
  patientPaid: number;
  panelCovered: number;
  panelReceived: number;
  patientOutstanding: number;
  panelOutstanding: number;
  unattributedBalance: number;
  creditDue: number;
  excessAttribution: number;
  settlement: DualLedgerSettlement;
}

const ACTIVE_CLAIM_STATUSES = new Set(['pending', 'submitted', 'approved', 'received']);

const money = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
};

export function calculateDualLedger(input: DualLedgerInput): DualLedgerState {
  const billedTotal = Math.max(money(input.billedTotal), 0);
  const patientPaid = money((input.patientPayments ?? []).reduce((sum, payment) => {
    if (typeof payment === 'number') return sum + money(payment);
    return payment.deletedAt || String(payment.paymentMethod ?? '').toLowerCase() === 'panel'
      ? sum
      : sum + money(payment.amount);
  }, 0));

  const status = String(input.panelClaim?.status ?? '').toLowerCase();
  const hasActiveClaim = Boolean(input.panelClaim) && ACTIVE_CLAIM_STATUSES.has(status);
  // A patient payment (cash, QR, card, transfer, etc.) can never also be
  // receivable from the panel. Cap legacy/full-bill claims at the remainder.
  const remainingAfterPatientPayment = Math.max(money(billedTotal - patientPaid), 0);
  const panelCovered = hasActiveClaim
    ? Math.min(Math.max(money(input.panelClaim?.amount), 0), remainingAfterPatientPayment)
    : 0;
  const panelReceived = hasActiveClaim
    // Only an amount explicitly received against the claim is panel income.
    // Legacy payment_method='panel' rows describe allocation and must not be
    // added here, otherwise a patient QR/cash payment is double-attributed.
    ? Math.min(Math.max(money(input.panelClaim?.receivedAmount), 0), panelCovered)
    : 0;
  const attributed = money(patientPaid + panelCovered);
  const excessAttribution = Math.max(money(attributed - billedTotal), 0);
  const creditDue = Math.max(money(patientPaid + panelReceived - billedTotal), 0);

  let patientOutstanding = 0;
  let panelOutstanding = 0;
  let unattributedBalance = 0;
  let settlement: DualLedgerSettlement = 'settled';

  if (input.expectsPanel) {
    if (!hasActiveClaim) {
      unattributedBalance = Math.max(money(billedTotal - patientPaid), 0);
      settlement = unattributedBalance > 0 ? 'needs_attention' : 'settled';
    } else {
      panelOutstanding = Math.max(money(panelCovered - panelReceived), 0);
      unattributedBalance = Math.max(money(billedTotal - attributed), 0);
      if (excessAttribution > 0 || unattributedBalance > 0) settlement = 'needs_attention';
      else if (panelOutstanding > 0) settlement = 'panel_due';
    }
  } else {
    patientOutstanding = Math.max(money(billedTotal - patientPaid), 0);
    settlement = patientOutstanding > 0 ? 'patient_due' : 'settled';
  }

  return {
    billedTotal,
    patientPaid,
    panelCovered,
    panelReceived,
    patientOutstanding,
    panelOutstanding,
    unattributedBalance,
    creditDue,
    excessAttribution,
    settlement,
  };
}
