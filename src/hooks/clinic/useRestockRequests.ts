import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useRestockRequests(status: 'open' | 'all' = 'open') {
  return useQuery({
    queryKey: ['restock_requests', status],
    queryFn: async () => {
      const q = supabase
        .from('restock_requests' as never)
        .select('id, inventory_item_id, requested_by, reason, status, created_at, inventory_items(name)')
        .order('created_at', { ascending: false })
        .limit(200);
      const { data, error } = status === 'open' ? await q.eq('status', 'open') : await q;
      if (error) throw error;
      return data ?? [];
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
