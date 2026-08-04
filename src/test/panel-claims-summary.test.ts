import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { aggregatePanelClaimsSummary, getPanelClaimBalances } from '@/hooks/clinic/usePanelClaims';

describe('panel claim summary', () => {
  it('clamps corrected claim debt and tracks panel credit separately', () => {
    expect(aggregatePanelClaimsSummary([{ status: 'received', amount: 120, received_amount: 130, is_overdue: false }]))
      .toMatchObject({ outstandingSum: 0, creditDueSum: 10, receivedSum: 130 });
  });

  it('counts split claims once from their synchronized parent aggregate', () => {
    expect(aggregatePanelClaimsSummary([
      { status: 'pending', amount: 400, received_amount: 150, is_overdue: false },
      { status: 'received', amount: 300, received_amount: 300, is_overdue: false },
    ])).toMatchObject({
      pendingCount: 1,
      receivedSum: 300,
      outstandingSum: 250,
    });
  });
});

describe('panel claim balances', () => {
  it('uses the parent aggregate receipt total to display received and outstanding values', () => {
    expect(getPanelClaimBalances({ amount: 120, received_amount: 40 })).toEqual({
      received: 40,
      outstanding: 80,
    });
  });

  it('keeps the RM400 split claim display at its parent billed amount', () => {
    expect(getPanelClaimBalances({ amount: 400, received_amount: 150 })).toEqual({
      received: 150,
      outstanding: 250,
    });
  });
});
