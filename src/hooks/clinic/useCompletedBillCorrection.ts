import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  toCompletedBillCorrectionPayload,
  normalizeCompletedBillPaymentMethod,
  type BillAdjustmentKind,
  type CompletedBillCorrectionContext,
  type CompletedBillCorrectionItem,
  type CompletedBillCorrectionPayment,
} from '@/lib/clinic/completedBillCorrection';

export interface CompletedBillCorrectionResult {
  auditId: string;
  fingerprint: string;
}

export interface CompletedBillCorrectionHistoryEntry {
  id: string;
  actorId: string;
  createdAt: string;
  reason: string;
  beforeTotal: number;
  afterTotal: number;
}

const CORRECTION_CONTEXT_KEY = (queueEntryId: string) => [
  'completed-bill-correction-context',
  queueEntryId,
] as const;
const CORRECTION_HISTORY_KEY = (queueEntryId: string) => [
  'completed-bill-correction-history',
  queueEntryId,
] as const;

const CORRECTION_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHORIZED: 'You are not allowed to correct completed bills.',
  VISIT_NOT_COMPLETED: 'Only completed visits can be corrected.',
  STALE_BILL: 'This bill changed after you opened it. Reload and try again.',
  CORRECTION_REASON_REQUIRED: 'Enter a correction reason.',
  DISPENSED_MEDICINE_REMOVE: 'A dispensed medicine cannot be removed.',
  QUANTITY_BELOW_DISPENSED: 'Quantity cannot be below the amount already dispensed.',
};

const INVALIDATED_QUERY_KEYS = [
  (queueEntryId: string) => ['consultation', queueEntryId] as const,
  () => ['consultation_items'] as const,
  (queueEntryId: string) => ['payments', queueEntryId] as const,
  () => ['payments_ledger'] as const,
  () => ['clinic', 'queue-entries'] as const,
  (queueEntryId: string) => ['clinic', 'queue-entry', queueEntryId] as const,
  (queueEntryId: string) => ['clinic', 'completed-visit-detail', queueEntryId] as const,
  () => ['patient_outstanding'] as const,
  () => ['financial-insights'] as const,
  () => ['sales-insights'] as const,
  () => ['doctor-clinical-activity'] as const,
  () => ['patient-ltv'] as const,
  () => ['panel_claims'] as const,
  () => ['panel_claims_summary'] as const,
  (queueEntryId: string) => ['panel_claim_items', queueEntryId] as const,
  () => ['ledger_item_totals'] as const,
  () => ['receipt_payload'] as const,
  () => ['consultation_history'] as const,
  () => ['clinic', 'patient-visit-history'] as const,
  () => ['debt', 'unpaid-visits'] as const,
  (queueEntryId: string) => CORRECTION_CONTEXT_KEY(queueEntryId),
  (queueEntryId: string) => CORRECTION_HISTORY_KEY(queueEntryId),
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
    ? value
    : undefined;
}

function parseAdjustmentKind(value: unknown): BillAdjustmentKind | null | undefined {
  return value === null || value === 'other_charge' || value === 'discount' || value === 'tax'
    ? value
    : undefined;
}

function parseItem(value: unknown): CompletedBillCorrectionItem | null {
  if (!isRecord(value)) return null;

  const id = nullableString(value.id);
  const itemName = requiredString(value.item_name);
  const quantity = finiteNumber(value.quantity);
  const price = finiteNumber(value.price);
  const itemId = nullableString(value.item_id);
  const serviceId = nullableString(value.service_id);
  const packageId = nullableString(value.package_id);
  const dispensedQty = nullableFiniteNumber(value.dispensed_qty);
  const adjustmentKind = parseAdjustmentKind(value.adjustment_kind);
  const chargeTypeId = nullableString(value.charge_type_id);

  if (
    id === undefined ||
    itemName === null ||
    quantity === null ||
    price === null ||
    itemId === undefined ||
    serviceId === undefined ||
    packageId === undefined ||
    dispensedQty === undefined ||
    adjustmentKind === undefined ||
    chargeTypeId === undefined
  ) {
    return null;
  }

  return {
    id,
    itemName,
    quantity,
    price,
    itemId,
    serviceId,
    packageId,
    dispensedQty,
    adjustmentKind,
    chargeTypeId,
    remove: false,
  };
}

function parsePayment(value: unknown): CompletedBillCorrectionPayment | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id);
  const amount = finiteNumber(value.amount);
  const paymentMethod = requiredString(value.payment_method);
  const paymentType = requiredString(value.payment_type);
  if (id === null || amount === null || paymentMethod === null || paymentType === null) return null;

  return { id, amount, paymentMethod: normalizeCompletedBillPaymentMethod(paymentMethod) ?? paymentMethod, paymentType };
}

function parsePanelClaim(value: unknown): CompletedBillCorrectionContext['panelClaim'] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const id = requiredString(value.id);
  const status = requiredString(value.status);
  const amount = finiteNumber(value.amount);
  const receivedAmount = nullableFiniteNumber(value.received_amount);
  if (id === null || status === null || amount === null || receivedAmount === undefined) return undefined;

  return { id, status, amount, receivedAmount };
}

function parseOriginalTotals(value: Record<string, unknown>): CompletedBillCorrectionContext['originalTotals'] | null {
  const subtotal = finiteNumber(value.subtotal);
  const discountRm = finiteNumber(value.discount_rm);
  const taxRm = finiteNumber(value.tax_rm);
  const taxPct = finiteNumber(value.tax_pct);
  const total = finiteNumber(value.total);
  const paid = finiteNumber(value.paid);
  const outstanding = finiteNumber(value.outstanding);
  const creditDue = finiteNumber(value.credit_due);
  const status = value.status;
  if (
    subtotal === null || discountRm === null || taxRm === null || taxPct === null || total === null ||
    paid === null || outstanding === null || creditDue === null ||
    (status !== 'outstanding' && status !== 'paid' && status !== 'credit_due')
  ) return null;
  return { subtotal, discountRm, taxRm, taxPct, total, paid, outstanding, creditDue, status };
}

function invalidContextError(): Error {
  return new Error('Completed bill correction context is invalid.');
}

function parseCorrectionContext(value: unknown): CompletedBillCorrectionContext {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.payments)) {
    throw invalidContextError();
  }

  const queueEntryId = requiredString(value.queue_entry_id);
  const consultationId = requiredString(value.consultation_id);
  const fingerprint = requiredString(value.fingerprint);
  const items = value.items.map(parseItem);
  const payments = value.payments.map(parsePayment);
  const panelClaim = parsePanelClaim(value.panel_claim);
  const originalTotals = parseOriginalTotals(value);

  if (
    queueEntryId === null ||
    consultationId === null ||
    fingerprint === null ||
    items.some((item) => item === null) ||
    payments.some((payment) => payment === null) ||
    panelClaim === undefined ||
    originalTotals === null
  ) {
    throw invalidContextError();
  }

  return {
    queueEntryId,
    consultationId,
    fingerprint,
    items: items as CompletedBillCorrectionItem[],
    payments: payments as CompletedBillCorrectionPayment[],
    originalTotals,
    panelClaim,
  };
}

function parseCorrectionResult(value: unknown): CompletedBillCorrectionResult {
  if (!isRecord(value)) throw new Error('Completed bill correction result is invalid.');

  const auditId = requiredString(value.audit_id);
  const fingerprint = requiredString(value.fingerprint);
  if (auditId === null || fingerprint === null) {
    throw new Error('Completed bill correction result is invalid.');
  }

  return { auditId, fingerprint };
}

function parseCorrectionHistory(value: unknown): CompletedBillCorrectionHistoryEntry[] {
  if (!Array.isArray(value)) throw new Error('Completed bill correction history is invalid.');
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('Completed bill correction history is invalid.');
    const id = requiredString(entry.id);
    const actorId = requiredString(entry.actor_id);
    const createdAt = requiredString(entry.created_at);
    const reason = requiredString(entry.reason);
    const beforeTotal = finiteNumber(entry.before_total);
    const afterTotal = finiteNumber(entry.after_total);
    if (id === null || actorId === null || createdAt === null || reason === null || beforeTotal === null || afterTotal === null) {
      throw new Error('Completed bill correction history is invalid.');
    }
    return { id, actorId, createdAt, reason, beforeTotal, afterTotal };
  });
}

function toCompletedBillCorrectionError(error: unknown): Error {
  if (!isRecord(error)) return error instanceof Error ? error : new Error('Correction failed.');

  const code = [error.code, error.message].find(
    (value): value is string =>
      typeof value === 'string' &&
      Object.prototype.hasOwnProperty.call(CORRECTION_ERROR_MESSAGES, value),
  );
  if (code) return new Error(CORRECTION_ERROR_MESSAGES[code]);

  if (error instanceof Error) return error;

  const message = typeof error.message === 'string' ? error.message : 'Correction failed.';
  return Object.assign(new Error(message), error);
}

export function useCompletedBillCorrectionContext(
  queueEntryId: string | null,
  enabled: boolean,
): UseQueryResult<CompletedBillCorrectionContext> {
  const trimmedQueueEntryId = queueEntryId?.trim() ?? '';

  return useQuery({
    queryKey: CORRECTION_CONTEXT_KEY(trimmedQueueEntryId),
    enabled: enabled && Boolean(trimmedQueueEntryId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_completed_bill_correction_context', {
        p_queue_entry_id: trimmedQueueEntryId,
      });
      if (error) throw toCompletedBillCorrectionError(error);

      return parseCorrectionContext(data);
    },
  });
}

export function useCorrectCompletedBill(): UseMutationResult<
  CompletedBillCorrectionResult,
  Error,
  ReturnType<typeof toCompletedBillCorrectionPayload>
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.rpc('correct_completed_bill', payload);
      if (error) throw toCompletedBillCorrectionError(error);

      return parseCorrectionResult(data);
    },
    onSuccess: (_, payload) => {
      INVALIDATED_QUERY_KEYS.forEach((getKey) => {
        queryClient.invalidateQueries({ queryKey: getKey(payload.p_queue_entry_id) });
      });
    },
  });
}

/** Read-only audit history. Callers must enable this only for roles allowed by the audit RLS policy. */
export function useCompletedBillCorrectionHistory(
  queueEntryId: string | null,
): UseQueryResult<CompletedBillCorrectionHistoryEntry[]> {
  const trimmedQueueEntryId = queueEntryId?.trim() ?? '';

  return useQuery({
    queryKey: CORRECTION_HISTORY_KEY(trimmedQueueEntryId),
    enabled: Boolean(trimmedQueueEntryId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_completed_bill_correction_history', {
        p_queue_entry_id: trimmedQueueEntryId,
        p_limit: 25,
        p_before_created_at: null,
        p_before_id: null,
      });
      if (error) throw error;
      return parseCorrectionHistory(data ?? []);
    },
  });
}
