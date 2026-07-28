function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface BillingLineTotalInput {
  price: number | string | null | undefined;
  quantity: number | string | null | undefined;
  deletedAt?: string | null;
}

/**
 * Authoritative display total for billable lines. Billing always follows the
 * saved quantity; dispensed quantity is an inventory fact, not a charge.
 */
export function sumActiveBillingLines(lines: BillingLineTotalInput[]): number {
  return roundCurrency(lines.reduce((total, line) => {
    if (line.deletedAt) return total;
    const price = Number(line.price ?? 0);
    const quantity = Number(line.quantity ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) return total;
    return total + price * quantity;
  }, 0));
}

export function reconcileBillingSubtotal(
  savedItemsSubtotal: number,
  paid: number,
): {
  subtotal: number;
  unitemizedAdditionalCharges: number;
} {
  const itemSubtotal = roundCurrency(Math.max(Number(savedItemsSubtotal) || 0, 0));
  const paidTotal = roundCurrency(Math.max(Number(paid) || 0, 0));
  const unitemizedAdditionalCharges = roundCurrency(
    Math.max(paidTotal - itemSubtotal, 0),
  );

  return {
    subtotal: roundCurrency(itemSubtotal + unitemizedAdditionalCharges),
    unitemizedAdditionalCharges,
  };
}
