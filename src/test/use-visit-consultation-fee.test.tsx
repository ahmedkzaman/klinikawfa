import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQuery = vi.hoisted(() => vi.fn());

const supabaseQuery = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return { from, select, eq, single };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabaseQuery.from },
}));

vi.mock('@tanstack/react-query', () => ({ useQuery }));

import {
  fetchVisitPanelFee,
  useVisitConsultationFee,
} from '@/hooks/clinic/useVisitConsultationFee';

describe('fetchVisitPanelFee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuery.mockImplementation((options) => options);
  });

  it('returns null without querying for a cash visit', async () => {
    expect(await fetchVisitPanelFee(null)).toBeNull();
    expect(supabaseQuery.from).not.toHaveBeenCalled();
  });

  it('reads the configured positive consultation fee for the visit panel', async () => {
    supabaseQuery.single.mockResolvedValue({
      data: { consultation_fee_override: 18 },
      error: null,
    });

    expect(await fetchVisitPanelFee('panel-1')).toBe(18);
    expect(supabaseQuery.from).toHaveBeenCalledWith('insurance_providers');
    expect(supabaseQuery.select).toHaveBeenCalledWith('consultation_fee_override');
    expect(supabaseQuery.eq).toHaveBeenCalledWith('id', 'panel-1');
  });

  it('returns null when the visit panel consultation fee is blank', async () => {
    supabaseQuery.single.mockResolvedValue({
      data: { consultation_fee_override: null },
      error: null,
    });

    expect(await fetchVisitPanelFee('panel-1')).toBeNull();
  });

  it('preserves a zero consultation fee for the visit panel', async () => {
    supabaseQuery.single.mockResolvedValue({
      data: { consultation_fee_override: 0 },
      error: null,
    });

    expect(await fetchVisitPanelFee('panel-1')).toBe(0);
  });

  it('resolves a blank visit-panel fee to the clinic cash fee', async () => {
    supabaseQuery.single.mockResolvedValue({
      data: { consultation_fee_override: null },
      error: null,
    });

    const { queryFn } = useVisitConsultationFee('panel-1', 35) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual({ amount: 35, source: 'cash-fallback' });
  });

  it('resolves a zero visit-panel fee as a panel fee', async () => {
    supabaseQuery.single.mockResolvedValue({
      data: { consultation_fee_override: 0 },
      error: null,
    });

    const { queryFn } = useVisitConsultationFee('panel-1', 35) as unknown as {
      queryFn: () => Promise<unknown>;
    };

    await expect(queryFn()).resolves.toEqual({ amount: 0, source: 'panel' });
  });
});
