export interface UnpaidVisit {
  consultation_id: string;
  created_at: string;
  doctor_name: string | null;
  total: number;
  paid: number;
  panel_covered: number;
  outstanding: number;
}

export interface DebtConsultationSnapshot {
  id: string;
  queue_entry_id: string | null;
  created_at: string;
  doctors: { name: string | null } | Array<{ name: string | null }> | null;
}

export interface DebtItemSnapshot {
  consultation_id: string;
  price: number | null;
  quantity: number | null;
  deleted_at: string | null;
}

export interface DebtPaymentSnapshot {
  queue_entry_id: string;
  amount: number | null;
  payment_method?: string | null;
  deleted_at: string | null;
}

export interface DebtPanelClaimSnapshot {
  queue_entry_id: string | null;
  amount: number | null;
  status: string | null;
}

interface CanonicalDebtSnapshots {
  consultations: DebtConsultationSnapshot[];
  items: DebtItemSnapshot[];
  payments: DebtPaymentSnapshot[];
  panelClaims: DebtPanelClaimSnapshot[];
}

export const ACTIVE_PANEL_CLAIM_STATUSES = ['pending', 'submitted', 'approved', 'received'] as const;
const ACTIVE_PANEL_CLAIM_STATUS_SET = new Set<string>(ACTIVE_PANEL_CLAIM_STATUSES);

export function buildCanonicalUnpaidVisits({
  consultations,
  items,
  payments,
  panelClaims,
}: CanonicalDebtSnapshots): UnpaidVisit[] {
  const queueByConsultation = new Map(
    consultations
      .filter((consultation) => consultation.queue_entry_id)
      .map((consultation) => [consultation.id, consultation.queue_entry_id!] as const),
  );
  const representativeByQueue = new Map<string, DebtConsultationSnapshot>();
  for (const consultation of consultations) {
    if (consultation.queue_entry_id && !representativeByQueue.has(consultation.queue_entry_id)) {
      representativeByQueue.set(consultation.queue_entry_id, consultation);
    }
  }

  return [...representativeByQueue.entries()].flatMap(([queueEntryId, consultation]) => {
    const total = items
      .filter((item) => !item.deleted_at && queueByConsultation.get(item.consultation_id) === queueEntryId)
      .reduce((sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0), 0);
    const paid = payments
      .filter((payment) => (
        !payment.deleted_at
        && payment.queue_entry_id === queueEntryId
        && String(payment.payment_method ?? '').trim().toLowerCase() !== 'panel'
      ))
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    const remainingAfterPayments = Math.max(total - paid, 0);
    const claimAmount = panelClaims
      .filter((claim) => (
        claim.queue_entry_id === queueEntryId
        && ACTIVE_PANEL_CLAIM_STATUS_SET.has(String(claim.status).toLowerCase())
      ))
      .reduce((sum, claim) => sum + Number(claim.amount ?? 0), 0);
    const panelCovered = Math.min(Math.max(claimAmount, 0), remainingAfterPayments);
    const outstanding = +(remainingAfterPayments - panelCovered).toFixed(2);
    if (outstanding <= 0.005) return [];

    const doctor = Array.isArray(consultation.doctors)
      ? consultation.doctors[0]
      : consultation.doctors;
    return [{
      consultation_id: consultation.id,
      created_at: consultation.created_at,
      doctor_name: doctor?.name ?? null,
      total: +total.toFixed(2),
      paid: +paid.toFixed(2),
      panel_covered: +panelCovered.toFixed(2),
      outstanding,
    }];
  });
}
