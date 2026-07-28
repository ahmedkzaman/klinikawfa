import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { rankMedicationsByDispensedVisits } from '@/lib/clinic/medicationVisitRanking';

describe('rankMedicationsByDispensedVisits', () => {
  it('counts a medicine once per patient visit and sorts by visit count', () => {
    const result = rankMedicationsByDispensedVisits([
      {
        itemId: 'paracetamol',
        itemName: 'Paracetamol',
        queueEntryId: 'visit-1',
        quantity: 10,
        dispensedQuantity: 10,
      },
      {
        itemId: 'paracetamol',
        itemName: 'Paracetamol',
        queueEntryId: 'visit-1',
        quantity: 5,
        dispensedQuantity: 5,
      },
      {
        itemId: 'paracetamol',
        itemName: 'Paracetamol',
        queueEntryId: 'visit-2',
        quantity: 10,
        dispensedQuantity: 10,
      },
      {
        itemId: 'cetirizine',
        itemName: 'Cetirizine',
        queueEntryId: 'visit-3',
        quantity: 1,
        dispensedQuantity: 1,
      },
    ]);

    expect(result).toEqual([
      { itemName: 'Paracetamol', dispensedVisitCount: 2 },
      { itemName: 'Cetirizine', dispensedVisitCount: 1 },
    ]);
  });

  it('excludes zero-dispensed rows and falls back to quantity for legacy rows', () => {
    const result = rankMedicationsByDispensedVisits([
      {
        itemId: 'excluded',
        itemName: 'Not dispensed',
        queueEntryId: 'visit-1',
        quantity: 3,
        dispensedQuantity: 0,
      },
      {
        itemId: 'legacy',
        itemName: 'Legacy medicine',
        queueEntryId: 'visit-2',
        quantity: 2,
        dispensedQuantity: null,
      },
      {
        itemId: 'zero-legacy',
        itemName: 'Zero legacy',
        queueEntryId: 'visit-3',
        quantity: 0,
        dispensedQuantity: null,
      },
    ]);

    expect(result).toEqual([{ itemName: 'Legacy medicine', dispensedVisitCount: 1 }]);
  });

  it('groups by medicine identity and uses normalized names as a fallback', () => {
    const result = rankMedicationsByDispensedVisits([
      {
        itemId: 'same-id',
        itemName: 'Medicine old label',
        queueEntryId: 'visit-1',
        quantity: 1,
        dispensedQuantity: 1,
      },
      {
        itemId: 'same-id',
        itemName: 'Medicine new label',
        queueEntryId: 'visit-2',
        quantity: 1,
        dispensedQuantity: 1,
      },
      {
        itemId: null,
        itemName: '  Mometasone ',
        queueEntryId: 'visit-3',
        quantity: 1,
        dispensedQuantity: 1,
      },
      {
        itemId: null,
        itemName: 'mometasone',
        queueEntryId: 'visit-4',
        quantity: 1,
        dispensedQuantity: 1,
      },
    ]);

    expect(result).toEqual([
      { itemName: 'Medicine old label', dispensedVisitCount: 2 },
      { itemName: 'Mometasone', dispensedVisitCount: 2 },
    ]);
  });
});

describe('Top 10 Medications chart', () => {
  it('labels and plots patient visits instead of revenue', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/clinic/insight/ScoreboardsTab.tsx'),
      'utf8',
    );

    expect(source).toContain('By patient visits dispensed');
    expect(source).toContain('dataKey="Patient Visits"');
    expect(source).not.toContain('<p className="text-xs text-slate-500">By revenue</p>');
  });
});
