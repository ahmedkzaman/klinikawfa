import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCanonicalUnpaidVisits } from '@/lib/clinic/debtOutstanding';

describe('debt settlement selectable balances', () => {
  it('uses the authorized canonical debt snapshot instead of direct claim-table reads', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/clinic/billing/SettleDebtModal.tsx',
    ), 'utf8');

    expect(source).toContain("rpc('get_patient_debt_snapshot'");
    expect(source).not.toContain(".from('panel_claims')");
  });

  it('subtracts physical payments and active panel coverage per historical queue', () => {
    const visits = buildCanonicalUnpaidVisits({
      consultations: [
        { id: 'consultation-a', queue_entry_id: 'queue-a', created_at: '2026-01-01', doctors: { name: 'A' } },
        { id: 'consultation-b', queue_entry_id: 'queue-b', created_at: '2026-02-01', doctors: null },
      ],
      items: [
        { consultation_id: 'consultation-a', price: 100, quantity: 1, deleted_at: null },
        { consultation_id: 'consultation-b', price: 50, quantity: 1, deleted_at: null },
      ],
      payments: [
        { queue_entry_id: 'queue-a', amount: 20, deleted_at: null },
        { queue_entry_id: 'queue-b', amount: 10, deleted_at: null },
      ],
      panelClaims: [
        { queue_entry_id: 'queue-a', amount: 60, status: 'approved' },
        { queue_entry_id: 'queue-b', amount: 40, status: 'rejected' },
      ],
    });

    expect(visits).toEqual([
      expect.objectContaining({
        consultation_id: 'consultation-a', total: 100, paid: 20,
        panel_covered: 60, outstanding: 20,
      }),
      expect.objectContaining({
        consultation_id: 'consultation-b', total: 50, paid: 10,
        panel_covered: 0, outstanding: 40,
      }),
    ]);
  });

  it('does not count legacy panel allocation rows as patient payments', () => {
    const visits = buildCanonicalUnpaidVisits({
      consultations: [
        { id: 'consultation-a', queue_entry_id: 'queue-a', created_at: '2026-01-01', doctors: null },
      ],
      items: [
        { consultation_id: 'consultation-a', price: 100, quantity: 1, deleted_at: null },
      ],
      payments: [
        { queue_entry_id: 'queue-a', amount: 60, payment_method: 'panel', deleted_at: null },
      ],
      panelClaims: [
        { queue_entry_id: 'queue-a', amount: 60, status: 'approved' },
      ],
    });

    expect(visits).toEqual([
      expect.objectContaining({
        total: 100, paid: 0, panel_covered: 60, outstanding: 40,
      }),
    ]);
  });
});
