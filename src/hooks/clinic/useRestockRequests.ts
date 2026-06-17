import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
