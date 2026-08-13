import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisitPanelClaim } from '@/hooks/clinic/useVisitPanelClaim';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useVisitPanelClaim materialization state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: { claim: {
        id: 'claim-1', amount: 80, received_amount: 0, status: 'pending',
        submitted_date: null, approved_amount: null, payment_reference: null,
        received_date: null, is_materialized: false,
        portions: [{
          id: 'portion-1', received_amount: 0, payment_reference: null,
          received_date: null,
        }],
      } },
      error: null,
    });
  });

  it('loads lifecycle and mirrored portion fields without treating staged unpaid portions as materialized', async () => {
    const { result } = renderHook(() => useVisitPanelClaim('queue-1'), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(rpc).toHaveBeenCalledWith('get_visit_financial_snapshot', {
      p_queue_entry_id: 'queue-1',
    });
    expect(result.current.data).toEqual(expect.objectContaining({
      id: 'claim-1', isMaterialized: false, hasConfiguredPortions: true,
    }));
  });

  it('treats a queue payer or an existing claim as panel-backed on visit detail', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/clinic/VisitDetail.tsx'), 'utf8');
    expect(source).toContain("entry?.payment_method === 'panel'");
    expect(source).toMatch(/panelClaim\s*!==\s*null/);
    expect(source).not.toContain("entry?.payment_type === 'panel'");
  });

  it('marks a claim materialized when a portion has mirrored receipt evidence', async () => {
    rpc.mockResolvedValueOnce({
      data: { claim: {
        id: 'claim-1', amount: 80, received_amount: 0, status: 'pending',
        submitted_date: null, approved_amount: null, payment_reference: null,
        received_date: null, is_materialized: true,
        portions: [{
          id: 'portion-1', received_amount: 10, payment_reference: 'REF-1',
          received_date: '2026-08-13',
        }],
      } },
      error: null,
    });
    const { result } = renderHook(() => useVisitPanelClaim('queue-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.isMaterialized).toBe(true));
  });
});
