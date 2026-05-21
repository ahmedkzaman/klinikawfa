import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const STOCK_MSG = 'Not enough stock available for this item.';

function isInsufficientStock(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'P0001' || (e.message?.includes('insufficient_stock') ?? false);
}

export function useConsultationItems(consultationId: string | undefined) {
  return useQuery({
    queryKey: ['consultation_items', consultationId],
    enabled: !!consultationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultation_items')
        .select('*, inventory_items(unit), services(name), packages(name)')
        .eq('consultation_id', consultationId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Adds a consultation item.
 *
 * Pricing contract (enforced by DB trigger `trg_resolve_selling_price`):
 *
 * - **Catalog-linked rows** (`item_id`, `service_id`, or `package_id` is set):
 *   the trigger is the source of truth and resolves `price` from the catalog
 *   using the hierarchy:
 *     Bespoke Panel Override → Standard Panel Price → Self Pay Price.
 *   Any `price` passed from the frontend is overwritten.
 *
 * - **Manual / free-text rows** (none of the catalog FKs set, e.g. the
 *   auto-seeded "Consultation Fee"): the trigger trusts the `price` value
 *   sent from the frontend and stamps `price_tier` automatically based on
 *   whether the visit is a panel visit (`PANEL`) or self-pay (`SELF PAY`).
 *
 * Manual price adjustments after insert (discounts, etc.) must still go
 * through `useUpdateConsultationItem`.
 */
export function useAddConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      consultation_id: string;
      item_name: string;
      quantity?: number;
      dosage?: string;
      /**
       * Authoritative for manual / free-text rows. Overwritten by the trigger
       * when the row is linked to a catalog entry (item / service / package).
       */
      price?: number;
      price_tier?: string | null;
      item_id?: string | null;
      service_id?: string | null;
      package_id?: string | null;
      // Optional prescribing defaults forwarded from the master inventory item.
      indication?: string | null;
      dosage_qty?: number | null;
      dosage_unit?: string | null;
      frequency?: string | null;
      instruction?: string | null;
      duration?: string | null;
      precaution?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('consultation_items')
        .insert(item)
        .select()
        .maybeSingle();
      if (error) {
        if (isInsufficientStock(error)) {
          toast.error(STOCK_MSG);
          throw new Error(STOCK_MSG);
        }
        throw error;
      }
      return data;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', vars.consultation_id] }),
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRemoveConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      consultationId,
    }: {
      id: string;
      consultationId: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('consultation_items')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Permission denied or item not found.');
      return consultationId;
    },
    onSuccess: (consultationId) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] }),
  });
}

export function useUpdateDispensedQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      consultationId: string;
      dispensed_qty: number | null;
      partial_reason: 'patient_request' | 'out_of_stock' | null;
    }) => {
      const { data, error } = await supabase
        .from('consultation_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          dispensed_qty: input.dispensed_qty,
          partial_reason: input.partial_reason,
        } as any)
        .eq('id', input.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Permission denied or item not found.');
      return input.consultationId;
    },
    onSuccess: (consultationId) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateConsultationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      consultationId,
      ...updates
    }: {
      id: string;
      consultationId: string;
      quantity?: number;
      price?: number;
      price_tier?: string | null;
      indication?: string | null;
      dosage_qty?: number | null;
      dosage_unit?: string | null;
      frequency?: string | null;
      instruction?: string | null;
      duration?: string | null;
      precaution?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('consultation_items')
        .update(updates)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) {
        if (isInsufficientStock(error)) {
          toast.error(STOCK_MSG);
          throw new Error(STOCK_MSG);
        }
        throw error;
      }
      if (!data) throw new Error('Permission denied or item not found.');
      return consultationId;
    },
    onSuccess: (consultationId) =>
      qc.invalidateQueries({ queryKey: ['consultation_items', consultationId] }),
  });
}

