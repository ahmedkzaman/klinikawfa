import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
}

export function useSaveClientInvoiceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      items,
    }: {
      invoiceId: string;
      items: InvoiceItemDraft[];
    }) => {
      const payload = items
        .filter((i) => i.description.trim().length > 0)
        .map((i) => ({
          description: i.description.trim(),
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
        }));
      const { error } = await supabase.rpc('save_client_invoice_items', {
        _invoice_id: invoiceId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _items: payload as any,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: ['client_invoices'] });
      qc.invalidateQueries({ queryKey: ['client_invoices', invoiceId] });
    },
  });
}
