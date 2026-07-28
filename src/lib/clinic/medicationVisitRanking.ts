export interface MedicationDispenseRow {
  itemId: string | null;
  itemName: string;
  queueEntryId: string;
  quantity: number | string | null;
  dispensedQuantity: number | string | null;
}

export interface MedicationVisitRank {
  itemName: string;
  dispensedVisitCount: number;
}

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function rankMedicationsByDispensedVisits(
  rows: MedicationDispenseRow[],
  limit = 10,
): MedicationVisitRank[] {
  const medicines = new Map<string, { itemName: string; visits: Set<string> }>();

  for (const row of rows) {
    const effectiveQuantity = Number(row.dispensedQuantity ?? row.quantity ?? 0);
    const itemName = normalizedName(row.itemName);

    if (!row.queueEntryId || !itemName || !Number.isFinite(effectiveQuantity) || effectiveQuantity <= 0) {
      continue;
    }

    const key = row.itemId ? `id:${row.itemId}` : `name:${itemName.toLocaleLowerCase()}`;
    const medicine = medicines.get(key) ?? { itemName, visits: new Set<string>() };
    medicine.visits.add(row.queueEntryId);
    medicines.set(key, medicine);
  }

  return Array.from(medicines.values())
    .map(({ itemName, visits }) => ({ itemName, dispensedVisitCount: visits.size }))
    .sort(
      (a, b) =>
        b.dispensedVisitCount - a.dispensedVisitCount ||
        a.itemName.localeCompare(b.itemName),
    )
    .slice(0, limit);
}
