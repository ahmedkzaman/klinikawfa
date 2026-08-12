import { PAYMENT_METHOD_LABELS } from '@/lib/clinic/paymentMethod';

export const PHYSICAL_PAYMENT_METHODS = ['cash', 'qr_pay', 'card', 'transfer'] as const;
export type PhysicalPaymentMethod = typeof PHYSICAL_PAYMENT_METHODS[number];

export interface PatientPaymentAllocation {
  method: PhysicalPaymentMethod | '';
  amount: number;
  notes?: string | null;
}

export interface PaymentAllocationValidation {
  valid: boolean;
  total: number;
  remaining: number;
  errors: string[];
}

export const toSen = (amount: number) => Math.round(amount * 100);
export const fromSen = (sen: number) => sen / 100;

export function remainingAllocationAmount(
  expectedAmount: number,
  allocations: PatientPaymentAllocation[],
) {
  return fromSen(Math.max(0, toSen(expectedAmount) - allocations.reduce(
    (sum, allocation) => sum + toSen(Number(allocation.amount) || 0), 0,
  )));
}

export function validatePaymentAllocations({ allocations, expectedAmount, requireExact }: {
  allocations: PatientPaymentAllocation[];
  expectedAmount: number;
  requireExact: boolean;
}): PaymentAllocationValidation {
  const errors: string[] = [];
  const expectedSen = toSen(expectedAmount);
  const totalSen = allocations.reduce((sum, row) => sum + toSen(Number(row.amount) || 0), 0);
  const methods = allocations.map((row) => row.method).filter(Boolean);
  if (!allocations.length && expectedSen > 0) errors.push('Add at least one payment method.');
  if (allocations.some((row) => !PHYSICAL_PAYMENT_METHODS.includes(row.method as PhysicalPaymentMethod))) errors.push('Select a payment method for every amount.');
  if (allocations.some((row) => toSen(row.amount) <= 0)) errors.push('Every payment amount must be greater than RM0.00.');
  if (new Set(methods).size !== methods.length) errors.push('Each payment method can only be used once.');
  if (totalSen > expectedSen) errors.push(`Allocated amount exceeds the balance by RM${fromSen(totalSen - expectedSen).toFixed(2)}.`);
  if (requireExact && totalSen < expectedSen) errors.push(`Allocate the remaining RM${fromSen(expectedSen - totalSen).toFixed(2)}.`);
  return {
    valid: errors.length === 0,
    total: fromSen(totalSen),
    remaining: fromSen(Math.max(0, expectedSen - totalSen)),
    errors,
  };
}

export function summarizePaymentMethods(methods: Array<string | null | undefined>) {
  const present = new Set(methods.filter((method): method is PhysicalPaymentMethod =>
    PHYSICAL_PAYMENT_METHODS.includes(method as PhysicalPaymentMethod),
  ));
  return PHYSICAL_PAYMENT_METHODS.filter((method) => present.has(method))
    .map((method) => PAYMENT_METHOD_LABELS[method])
    .join(' + ');
}
