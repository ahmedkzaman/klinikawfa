import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentDoctor } from '@/hooks/clinic/useCurrentDoctor';

const test = vi.hoisted(() => {
  const linkedDoctor = {
    id: 'doctor-stale',
    user_id: 'operations-user',
    name: 'Former doctor profile',
    status: 'active',
    on_duty: false,
    avatar_url: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };

  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: linkedDoctor, error: null });

  return {
    state: { isClinical: false },
    linkedDoctor,
    from: vi.fn(() => query),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'operations-user', email: 'operations@example.test' },
    isClinical: test.state.isClinical,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: test.from },
}));

describe('useCurrentDoctor role boundary', () => {
  beforeEach(() => {
    test.state.isClinical = false;
  });

  it('returns no doctor identity to non-clinical staff even when a linked profile remains', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCurrentDoctor(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('drops a cached doctor identity when the same account becomes non-clinical', async () => {
    test.state.isClinical = true;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => useCurrentDoctor(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(test.linkedDoctor));

    test.state.isClinical = false;
    rerender();

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
