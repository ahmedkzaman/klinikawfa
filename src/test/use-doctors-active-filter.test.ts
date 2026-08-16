import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useDoctors } from '@/hooks/clinic/useDoctors';

const useQuery = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery,
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from },
}));

describe('useDoctors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [], error: null });
    from.mockReturnValue(query);
    useQuery.mockImplementation((options) => options);
  });

  it('loads only active doctor rows for selectable doctor lists', async () => {
    const options = useDoctors();

    await options.queryFn();

    expect(from).toHaveBeenCalledWith('doctors');
    expect(query.select).toHaveBeenCalledWith('*');
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
    expect(query.order).toHaveBeenCalledWith('name', { ascending: true });
  });
});
