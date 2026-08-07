import { describe, expect, it } from 'vitest';
import { sortBillingEntries } from '@/lib/clinic/billingLedgerSort';

const rows = [
  {
    queueEntryId: 'queue-b',
    createdAt: '2026-08-02T09:00:00.000Z',
    subtotal: 80,
    paid: 80,
    outstanding: 0,
    latestMethod: 'card',
  },
  {
    queueEntryId: 'queue-a',
    createdAt: '2026-08-03T09:00:00.000Z',
    subtotal: 40,
    paid: 20,
    outstanding: 20,
    latestMethod: 'cash',
  },
  {
    queueEntryId: 'queue-c',
    createdAt: '2026-08-01T09:00:00.000Z',
    subtotal: 120,
    paid: 0,
    outstanding: 120,
    latestMethod: null,
  },
  {
    queueEntryId: 'queue-d',
    createdAt: '2026-08-03T08:00:00.000Z',
    subtotal: 40,
    paid: 40,
    outstanding: 0,
    latestMethod: 'qr_pay',
  },
];

function ids(result: typeof rows) {
  return result.map((row) => row.queueEntryId);
}

describe('sortBillingEntries', () => {
  it('sorts dates descending by default billing order', () => {
    expect(ids(sortBillingEntries(rows, 'date', 'desc'))).toEqual([
      'queue-a',
      'queue-d',
      'queue-b',
      'queue-c',
    ]);
  });

  it.each([
    ['subtotal' as const, 'asc' as const, ['queue-a', 'queue-d', 'queue-b', 'queue-c']],
    ['subtotal' as const, 'desc' as const, ['queue-c', 'queue-b', 'queue-a', 'queue-d']],
    ['paid' as const, 'asc' as const, ['queue-c', 'queue-a', 'queue-d', 'queue-b']],
    ['paid' as const, 'desc' as const, ['queue-b', 'queue-d', 'queue-a', 'queue-c']],
    ['outstanding' as const, 'asc' as const, ['queue-d', 'queue-b', 'queue-a', 'queue-c']],
    ['outstanding' as const, 'desc' as const, ['queue-c', 'queue-a', 'queue-d', 'queue-b']],
  ])('sorts %s %s', (key, direction, expected) => {
    expect(ids(sortBillingEntries(rows, key, direction))).toEqual(expected);
  });

  it('sorts methods by their displayed labels', () => {
    expect(ids(sortBillingEntries(rows, 'method', 'asc'))).toEqual([
      'queue-b',
      'queue-a',
      'queue-d',
      'queue-c',
    ]);
  });

  it('keeps blank methods last in either direction', () => {
    expect(ids(sortBillingEntries(rows, 'method', 'asc')).at(-1)).toBe('queue-c');
    expect(ids(sortBillingEntries(rows, 'method', 'desc')).at(-1)).toBe('queue-c');
  });

  it('does not mutate the input array', () => {
    const originalOrder = ids(rows);

    sortBillingEntries(rows, 'subtotal', 'desc');

    expect(ids(rows)).toEqual(originalOrder);
  });

  it('breaks equal values by newest date and then queue id', () => {
    const tiedRows = [
      { ...rows[0], queueEntryId: 'queue-c', subtotal: 25, createdAt: '2026-08-05T10:00:00.000Z' },
      { ...rows[1], queueEntryId: 'queue-a', subtotal: 25, createdAt: '2026-08-05T10:00:00.000Z' },
      { ...rows[2], queueEntryId: 'queue-b', subtotal: 25, createdAt: '2026-08-04T10:00:00.000Z' },
    ];

    expect(ids(sortBillingEntries(tiedRows, 'subtotal', 'asc'))).toEqual([
      'queue-a',
      'queue-c',
      'queue-b',
    ]);
  });
});
