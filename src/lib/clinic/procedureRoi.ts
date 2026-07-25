export type ProcedureScoreboardRow = {
  kind: string;
  item_name: string;
};

export function normalizeProcedureName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isProcedureScoreboardRow(
  row: ProcedureScoreboardRow,
  serviceCategories: Map<string, string>,
): boolean {
  if (row.kind === 'service') return true;
  return serviceCategories.get(normalizeProcedureName(row.item_name)) === 'Procedure';
}
