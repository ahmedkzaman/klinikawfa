import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const QUERY_KEY = ['inventory_items'];

export function useInventoryItems() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const addItem = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(values as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return { items, isLoading, addItem, updateItem, deleteItem };
}

/* ------------------------------------------------------------------ */
/* Named mutation hooks (Step 12 catalog management)                  */
/* ------------------------------------------------------------------ */

export type InventoryCategory = 'Medication' | 'Disposable Item' | 'Vaccine' | 'Other';

export interface InventoryItemInput {
  name: string;
  cost_price: number;
  /** Self-pay price. Maps to DB columns `price_to_patient_max` and `price_to_patient_min` (mirrored). */
  selling_price: number;
  /** Standard panel rate. Maps to DB column `standard_panel_price`. */
  standard_panel_price: number;
  /** Maps to DB column `stock` */
  current_stock: number;
  status: 'active' | 'inactive';
  /** Visual grouping in Inventory settings. Maps to DB column `category`. */
  category?: InventoryCategory;
  // Legacy / Excel-aligned metadata (Step 19.8)
  item_code?: string | null;
  is_otc?: boolean;
  brand?: string | null;
  uom?: string | null;
  // Default dispensing instructions (Step 18). All optional.
  default_indication?: string | null;
  default_dosage_qty?: string | null;
  default_dosage_unit?: string | null;
  default_frequency?: string | null;
  default_instruction?: string | null;
  default_duration?: string | null;
  default_duration_unit?: string | null;
  default_precaution?: string | null;
  // Phase 2A: Inventory dashboard fields
  /** Drug grouping (e.g. Antibiotic, Analgesic). Maps to DB column `groups`. */
  drug_group?: string | null;
  /** Low-stock alert threshold. Maps to DB column `stock_amount_warning`. */
  low_stock_threshold?: number | null;
  /** Earliest expiry date for current stock. Maps to DB column `nearest_expiry_date`. */
  expiry_date?: string | null;
  /** Tier 1 panel/corporate price. */
  price_tier_1?: number;
  /** Tier 2 panel/corporate price. */
  price_tier_2?: number;
  /** Soft-delete timestamp. null = active, set = archived. */
  archived_at?: string | null;
}

const DEFAULT_FIELDS = [
  'default_indication',
  'default_dosage_qty',
  'default_dosage_unit',
  'default_frequency',
  'default_instruction',
  'default_duration',
  'default_duration_unit',
  'default_precaution',
] as const;

function mapItemPayload(input: Partial<InventoryItemInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cost_price !== undefined) payload.cost_price = input.cost_price;
  if (input.selling_price !== undefined) {
    payload.price_to_patient_max = input.selling_price;
    payload.price_to_patient_min = input.selling_price;
  }
  if (input.standard_panel_price !== undefined) {
    payload.standard_panel_price = input.standard_panel_price;
  }
  if (input.current_stock !== undefined) payload.stock = input.current_stock;
  if (input.status !== undefined) payload.status = input.status;
  if (input.category !== undefined) payload.category = input.category;
  // Legacy / Excel-aligned metadata
  if (input.item_code !== undefined) {
    payload.item_code = typeof input.item_code === 'string' && input.item_code.trim() === '' ? null : input.item_code;
  }
  if (input.brand !== undefined) {
    payload.brand = typeof input.brand === 'string' && input.brand.trim() === '' ? null : input.brand;
  }
  if (input.uom !== undefined) {
    payload.uom = typeof input.uom === 'string' && input.uom.trim() === '' ? null : input.uom;
  }
  if (input.is_otc !== undefined) payload.is_otc = !!input.is_otc;
  for (const key of DEFAULT_FIELDS) {
    if (input[key] !== undefined) {
      const v = input[key];
      payload[key] = typeof v === 'string' && v.trim() === '' ? null : v;
    }
  }
  // Phase 2A fields
  if (input.drug_group !== undefined) {
    payload.groups = typeof input.drug_group === 'string' && input.drug_group.trim() === '' ? null : input.drug_group;
  }
  if (input.low_stock_threshold !== undefined) {
    payload.stock_amount_warning =
      input.low_stock_threshold === null || Number.isNaN(Number(input.low_stock_threshold))
        ? null
        : Number(input.low_stock_threshold);
  }
  if (input.expiry_date !== undefined) {
    payload.nearest_expiry_date =
      typeof input.expiry_date === 'string' && input.expiry_date.trim() === '' ? null : input.expiry_date;
  }
  if (input.price_tier_1 !== undefined) payload.price_tier_1 = Number(input.price_tier_1) || 0;
  if (input.price_tier_2 !== undefined) payload.price_tier_2 = Number(input.price_tier_2) || 0;
  if (input.archived_at !== undefined) payload.archived_at = input.archived_at;
  return payload;
}

export function useAddInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InventoryItemInput): Promise<{ id: string }> => {
      const { data, error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(mapItemPayload(input) as any)
        .select('id')
        .single();
      if (error) throw error;
      return { id: (data as { id: string }).id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<InventoryItemInput>): Promise<{ id: string }> => {
      const { error } = await supabase
        .from('inventory_items')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(mapItemPayload(input) as any)
        .eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
