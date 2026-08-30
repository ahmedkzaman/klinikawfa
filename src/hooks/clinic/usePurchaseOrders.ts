import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const LIST_KEY = ['purchase_orders'];
const DASHBOARD_KEYS = [['procurement', 'dashboard'], ['procurement', 'stock-planning']];
const detailKey = (id: string) => ['purchase_orders', id];

export type POChannel = 'internal' | 'whatsapp' | 'supplier_website' | 'phone' | 'email' | 'other';
export type POStatus = 'Draft' | 'Awaiting approval' | 'Ordered' | 'Received' | 'Cancelled';

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
  order_channel: POChannel;
  supplier_reference: string | null;
  approved_at: string | null;
  approved_by: string | null;
  ordered_at: string | null;
  ordered_by: string | null;
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

function invalidateProcurement(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: LIST_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
  for (const key of DASHBOARD_KEYS) queryClient.invalidateQueries({ queryKey: key });
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
    mutationFn: async (input: {
      supplier_id?: string | null;
      inventory_item_id?: string;
      order_qty?: number;
    }) => {
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

      const draft = data as { id: string };
      if (input.inventory_item_id) {
        const quantity = Math.max(1, Math.round(input.order_qty ?? 1));
        const { data: inventoryItem, error: itemError } = await supabase
          .from('inventory_items')
          .select('cost_price')
          .eq('id', input.inventory_item_id)
          .single();

        if (itemError) {
          await supabase.from('purchase_orders').delete().eq('id', draft.id);
          throw itemError;
        }

        const { error: lineError } = await supabase.from('purchase_order_items').insert({
          po_id: draft.id,
          inventory_item_id: input.inventory_item_id,
          order_qty: quantity,
          unit_cost: Number((inventoryItem as { cost_price: number | null }).cost_price ?? 0),
        } as never);

        if (lineError) {
          await supabase.from('purchase_orders').delete().eq('id', draft.id);
          throw lineError;
        }
      }

      return draft;
    },
    onSuccess: () => invalidateProcurement(queryClient),
  });

  const updateHeader = useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<PurchaseOrderListRow, 'supplier_id' | 'order_date' | 'expected_date' | 'notes' | 'order_channel' | 'supplier_reference'>>) => {
      const { error } = await supabase.from('purchase_orders').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateProcurement(queryClient, vars.id),
  });

  /**
   * The only way client code moves a PO through the workflow. The database
   * decides the resulting status (approval routing, permission checks) and
   * returns it; the caller never assumes the requested status succeeded.
   */
  const transitionOrder = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'Ordered' | 'Cancelled' }) => {
      const { data, error } = await supabase.rpc('transition_purchase_order', {
        _po_id: id,
        _requested_status: status,
      });
      if (error) throw error;
      return data as POStatus;
    },
    onSuccess: (_d, vars) => invalidateProcurement(queryClient, vars.id),
  });

  const receiveGoods = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('receive_purchase_order', { _po_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, id) => invalidateProcurement(queryClient, id),
  });

  return { orders, isLoading, createDraft, updateHeader, transitionOrder, receiveGoods };
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
