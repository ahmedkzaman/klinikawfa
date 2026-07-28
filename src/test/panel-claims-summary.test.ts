import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { aggregatePanelClaimsSummary } from '@/hooks/clinic/usePanelClaims';

describe('panel claim summary', () => {
  it('clamps corrected claim debt and tracks panel credit separately', () => {
    expect(aggregatePanelClaimsSummary([{ status: 'received', amount: 120, received_amount: 130, is_overdue: false }]))
      .toMatchObject({ outstandingSum: 0, creditDueSum: 10, receivedSum: 130 });
  });
});
