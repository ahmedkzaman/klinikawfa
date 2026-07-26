function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
