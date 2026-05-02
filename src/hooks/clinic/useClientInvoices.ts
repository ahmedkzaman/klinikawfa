import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CorporateClient } from './useCorporateClients';

export type ClientInvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Cancelled';

export interface ClientInvoice {
  id: string;
  invoice_no: string;
  client_id: string;
  issue_date: string;
  due_date: string | null;
  status: ClientInvoiceStatus;
  total_amount: number;
  notes: string | null;
  payment_ref: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<CorporateClient, 'id' | 'name' | 'address' | 'contact_person' | 'phone' | 'email'> | null;
}

export interface ClientInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ClientInvoiceDetail extends ClientInvoice {
  items: ClientInvoiceItem[];
}

const LIST_KEY = ['client_invoices'];
const detailKey = (id: string) => ['client_invoices', id];

export function useClientInvoices() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<ClientInvoice[]> => {
      const { data, error } = await supabase
        .from('client_invoices')
        .select('*, client:corporate_clients(id,name,address,contact_person,phone,email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientInvoice[];
    },
  });
}

export function useClientInvoiceDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: detailKey(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<ClientInvoiceDetail | null> => {
      if (!id) return null;
      const { data: inv, error } = await supabase
        .from('client_invoices')
        .select('*, client:corporate_clients(id,name,address,contact_person,phone,email)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!inv) return null;
      const { data: items, error: iErr } = await supabase
        .from('client_invoice_items')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at', { ascending: true });
      if (iErr) throw iErr;
      return {
        ...(inv as unknown as ClientInvoice),
        items: (items ?? []) as unknown as ClientInvoiceItem[],
      };
    },
  });
}

export interface CreateInvoiceInput {
  client_id: string;
  issue_date: string;
  due_date?: string | null;
  notes?: string | null;
}

export function useCreateClientInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput): Promise<ClientInvoice> => {
      const { data, error } = await supabase
        .from('client_invoices')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          client_id: input.client_id,
          issue_date: input.issue_date,
          due_date: input.due_date || null,
          notes: input.notes || null,
          status: 'Draft',
          // invoice_no left blank — trigger assigns via sequence
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as ClientInvoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useUpdateClientInvoiceHeader() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ClientInvoice, 'client_id' | 'issue_date' | 'due_date' | 'notes' | 'status' | 'payment_ref'>>;
    }) => {
      const { error } = await supabase
        .from('client_invoices')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}
