import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const LIST_KEY = ['purchase_orders'];
const detailKey = (id: string) => ['purchase_orders', id];

export type POStatus = 'Draft' | 'Sent' | 'Received' | 'Cancelled';

export interface PurchaseOrderListRow {
  id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_date: string | null;
  status: POStatus;
  total_amount: number;
  notes: string | null;
  received_at: string | null;
  created_at: string;
  supplier?: { id: string; name: string } | null;
}

export interface PurchaseOrderItemRow {
  id: string;
  po_id: string;
  inventory_item_id: string;
  order_qty: number;
  received_qty: number;
  unit_cost: number;
  total_price: number;
  inventory_item?: { id: string; name: string; cost_price: number | null } | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderListRow {
  items: PurchaseOrderItemRow[];
}

export function usePurchaseOrders() {
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(id, name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseOrderListRow[];
    },
  });

  const createDraft = useMutation({
    mutationFn: async (input: { supplier_id?: string | null }) => {
      const { data: numData, error: numErr } = await supabase.rpc('generate_po_number');
      if (numErr) throw numErr;

      // For Draft we need a supplier — if none provided, pick the first active supplier as a placeholder.
      let supplierId = input.supplier_id ?? null;
      if (!supplierId) {
        const { data: s } = await supabase
          .from('suppliers')
          .select('id')
          .eq('status', 'active')
          .order('name')
          .limit(1)
          .maybeSingle();
        supplierId = (s as { id: string } | null)?.id ?? null;
      }
      if (!supplierId) {
        throw new Error('Please add a supplier before creating a Purchase Order.');
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: numData as unknown as string,
          supplier_id: supplierId,
          status: 'Draft',
        } as never)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });

  const updateHeader = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<PurchaseOrderListRow, 'supplier_id' | 'order_date' | 'expected_date' | 'notes'>>) => {
      const { error } = await supabase.from('purchase_orders').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(vars.id) });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: POStatus }) => {
      const { error } = await supabase.from('purchase_orders').update({ status } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(vars.id) });
    },
  });

  const receiveGoods = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('receive_purchase_order', { _po_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: ['inventory_items'] });
    },
  });

  return { orders, isLoading, createDraft, updateHeader, setStatus, receiveGoods };
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: id ? detailKey(id) : ['purchase_orders', 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data: header, error: hErr } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(id, name)')
        .eq('id', id!)
        .single();
      if (hErr) throw hErr;

      const { data: items, error: iErr } = await supabase
        .from('purchase_order_items')
        .select('*, inventory_item:inventory_items(id, name, cost_price)')
        .eq('po_id', id!)
        .order('created_at');
      if (iErr) throw iErr;

      return {
        ...(header as unknown as PurchaseOrderListRow),
        items: (items ?? []) as unknown as PurchaseOrderItemRow[],
      } as PurchaseOrderDetail;
    },
  });
}
