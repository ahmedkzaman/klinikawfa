import { formatPaymentMethod } from '@/lib/clinic/paymentMethod';

export type BillingSortKey = 'date' | 'subtotal' | 'paid' | 'outstanding' | 'method';
export type BillingSortDirection = 'asc' | 'desc';

export interface SortableBillingEntry {
  queueEntryId: string;
  createdAt: string;
  subtotal: number;
  paid: number;
  outstanding: number;
  latestMethod: string | null;
  displayMethod?: string;
}

export function sortBillingEntries<T extends SortableBillingEntry>(
  entries: readonly T[],
  key: BillingSortKey,
  direction: BillingSortDirection,
): T[] {
  return [...entries].sort((a, b) => {
    if (key === 'method') {
      const method = compareMethods(a, b, direction);
      if (method !== 0) return method;
      return compareNewestThenQueue(a, b);
    }

    const primary = compareByKey(a, b, key);
    if (primary !== 0) return direction === 'asc' ? primary : -primary;
    return compareNewestThenQueue(a, b);
  });
}

function compareByKey<T extends SortableBillingEntry>(
  a: T,
  b: T,
  key: BillingSortKey,
): number {
  if (key === 'date') {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }

  return Number(a[key] ?? 0) - Number(b[key] ?? 0);
}

function compareMethods<T extends SortableBillingEntry>(
  a: T,
  b: T,
  direction: BillingSortDirection,
): number {
  const aLabel = a.displayMethod ?? formatPaymentMethod(a.latestMethod, a.paid);
  const bLabel = b.displayMethod ?? formatPaymentMethod(b.latestMethod, b.paid);
  const aBlank = !aLabel.trim();
  const bBlank = !bLabel.trim();
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  const labelCompare = aLabel.localeCompare(
    bLabel,
    undefined,
    { sensitivity: 'base' },
  );
  return direction === 'asc' ? labelCompare : -labelCompare;
}

function compareNewestThenQueue<T extends SortableBillingEntry>(a: T, b: T): number {
  const newestFirst =
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (newestFirst !== 0) return newestFirst;
  return a.queueEntryId.localeCompare(b.queueEntryId);
}
