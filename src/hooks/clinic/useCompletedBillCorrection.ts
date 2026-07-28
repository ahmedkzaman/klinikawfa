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
  type BillAdjustmentKind,
  type CompletedBillCorrectionContext,
  type CompletedBillCorrectionItem,
  type CompletedBillCorrectionPayment,
} from '@/lib/clinic/completedBillCorrection';

export interface CompletedBillCorrectionResult {
  auditId: string;
  fingerprint: string;
}

const CORRECTION_CONTEXT_KEY = (queueEntryId: string) => [
  'completed-bill-correction-context',
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
  () => ['consultation-items'] as const,
  (queueEntryId: string) => ['payments', queueEntryId] as const,
  (queueEntryId: string) => ['clinic', 'queue-entry', queueEntryId] as const,
  (queueEntryId: string) => ['clinic', 'completed-visit-detail', queueEntryId] as const,
  () => ['clinic', 'patient-financials'] as const,
  () => ['clinic', 'financial-insights'] as const,
  () => ['clinic', 'doctor-clinical-activity'] as const,
  () => ['panel_claims'] as const,
  () => ['billing'] as const,
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

  return { id, amount, paymentMethod, paymentType };
}

function parsePanelClaim(value: unknown): CompletedBillCorrectionContext['panelClaim'] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const id = requiredString(value.id);
  const status = requiredString(value.status);
  const amount = finiteNumber(value.amount);
  const receivedAmount = finiteNumber(value.received_amount);
  if (id === null || status === null || amount === null || receivedAmount === null) return undefined;

  return { id, status, amount, receivedAmount };
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

  if (
    queueEntryId === null ||
    consultationId === null ||
    fingerprint === null ||
    items.some((item) => item === null) ||
    payments.some((payment) => payment === null) ||
    panelClaim === undefined
  ) {
    throw invalidContextError();
  }

  return {
    queueEntryId,
    consultationId,
    fingerprint,
    items: items as CompletedBillCorrectionItem[],
    payments: payments as CompletedBillCorrectionPayment[],
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
  return useQuery({
    queryKey: CORRECTION_CONTEXT_KEY(queueEntryId ?? ''),
    enabled: enabled && queueEntryId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_completed_bill_correction_context', {
        p_queue_entry_id: queueEntryId!,
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
