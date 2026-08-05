export type ProcedureScoreboardRow = {
  kind: string;
  item_name: string;
};

export function normalizeProcedureName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveCurrentProcedureCogs(input: {
  quantity: number | string | null;
  recordedUnitCost: number | string | null;
  currentServiceCost: number | string | null;
}): number {
  const quantity = Number(input.quantity ?? 0);
  const currentServiceCost =
    input.currentServiceCost == null ? Number.NaN : Number(input.currentServiceCost);
  const recordedUnitCost = Number(input.recordedUnitCost ?? 0);
  const unitCost = Number.isFinite(currentServiceCost)
    ? currentServiceCost
    : recordedUnitCost;

  return Math.max(0, Number.isFinite(quantity) ? quantity : 0) *
    Math.max(0, Number.isFinite(unitCost) ? unitCost : 0);
}

export function isProcedureScoreboardRow(
  row: ProcedureScoreboardRow,
  serviceCategories: Map<string, string>,
): boolean {
  if (row.kind === 'service') return true;
  return serviceCategories.get(normalizeProcedureName(row.item_name)) === 'Procedure';
}
