import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

type OutOfStockRequestFrequencyRow = {
  month: string;
  month_label: string;
  inventory_item_id: string;
  item_name: string;
  request_count: number;
};

export function useRestockRequests(status: 'open' | 'all' = 'open') {
  return useQuery({
    queryKey: ['restock_requests', status],
    queryFn: async () => {
      const q = supabase
        .from('restock_requests' as never)
        .select('id, inventory_item_id, requested_by, reason, status, created_at, inventory_items(name, stock)')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data, error } = status === 'open' ? await q.eq('status', 'open') : await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;

      const userIds = Array.from(
        new Set(
          rows
            .map((r) => r.requested_by as string | null)
            .filter((v): v is string => !!v),
        ),
      );

      let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        profileMap = Object.fromEntries(
          (profiles ?? []).map((p) => [
            p.id as string,
            { full_name: p.full_name as string | null, email: p.email as string | null },
          ]),
        );
      }

      return rows.map((r) => ({
        ...r,
        requester:
          r.requested_by && profileMap[r.requested_by as string]
            ? profileMap[r.requested_by as string]
            : null,
      }));
    },
  });
}

export function useCreateRestockRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; reason?: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('restock_requests' as never).insert({
        inventory_item_id: input.itemId,
        requested_by: user.id,
        reason: input.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restock_requests'] });
      toast.success('Restock requested');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCloseRestockRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('restock_requests' as never)
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by: user?.id ?? null,
        } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restock_requests'] });
      toast.success('Marked as ordered');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useOutOfStockRestockRequestFrequency() {
  return useQuery({
    queryKey: ['restock_requests', 'out_of_stock_frequency'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restock_requests' as never)
        .select('id, created_at, inventory_item_id, inventory_items(name, stock)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []).filter(
        (r: Record<string, unknown>) =>
          ((r.inventory_items as Record<string, unknown> | null)?.stock ?? null) === 0,
      );

      const counts = rows.reduce<Map<string, OutOfStockRequestFrequencyRow>>((acc, row) => {
        const stockRow = row.inventory_items as Record<string, unknown> | null;
        if (!stockRow) return acc;

        const itemId = String(row.inventory_item_id);
        const itemName = String(stockRow.name ?? 'Unknown item');
        const createdAt = row.created_at as string | null;
        if (!createdAt) return acc;

        const month = format(new Date(createdAt), 'yyyy-MM');
        const monthLabel = format(new Date(createdAt), 'MMMM yyyy');
        const key = `${itemId}::${month}`;

        const existing = acc.get(key);
        if (existing) {
          existing.request_count += 1;
          return acc;
        }

        acc.set(key, {
          month,
          month_label: monthLabel,
          inventory_item_id: itemId,
          item_name: itemName,
          request_count: 1,
        });
        return acc;
      }, new Map<string, OutOfStockRequestFrequencyRow>());

      return [...counts.values()].sort((a, b) => {
        if (a.month !== b.month) {
          return b.month.localeCompare(a.month);
        }
        return b.request_count - a.request_count;
      });
    },
    staleTime: 1000 * 60,
  });
}
