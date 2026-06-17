import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type VendorInvoiceStatus = 'Open' | 'Paid' | 'Overdue';

export interface VendorInvoice {
  id: string;
  invoice_no: string;
  supplier_id: string;
  po_id: string | null;
  amount: number;
  due_date: string | null;
  status: VendorInvoiceStatus;
  payment_ref: string | null;
  created_at: string;
  updated_at: string;
  supplier?: { id: string; name: string } | null;
  po?: { id: string; po_number: string } | null;
}

export interface VendorInvoiceInput {
  invoice_no: string;
  supplier_id: string;
  po_id?: string | null;
  amount: number;
  due_date?: string | null;
}

const KEY = ['vendor_invoices'];

export function useVendorInvoices() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<VendorInvoice[]> => {
      const { data, error } = await supabase
        .from('vendor_invoices')
        .select('*, supplier:suppliers(id, name), po:purchase_orders(id, po_number)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VendorInvoice[];
    },
  });
}

export function useCreateVendorInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VendorInvoiceInput) => {
      const payload = {
        invoice_no: input.invoice_no,
        supplier_id: input.supplier_id,
        po_id: input.po_id || null,
        amount: Number(input.amount) || 0,
        due_date: input.due_date || null,
      };
      const { error } = await supabase
        .from('vendor_invoices')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payment_ref }: { id: string; payment_ref: string }) => {
      const { error } = await supabase
        .from('vendor_invoices')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'Paid', payment_ref } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
