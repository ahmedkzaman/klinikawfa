import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type OverrideTarget =
  | { itemId: string }
  | { serviceId: string }
  | { packageId: string };

export interface PanelOverrideRow {
  id: string;
  panel_id: string;
  item_id: string | null;
  service_id: string | null;
  package_id: string | null;
  override_price: number;
}

export interface OverrideDraft {
  panel_id: string;
  override_price: number;
}

const OVERRIDES_KEY = (target: OverrideTarget) => {
  if ('itemId' in target) return ['panel_price_overrides', 'item', target.itemId] as const;
  if ('serviceId' in target) return ['panel_price_overrides', 'service', target.serviceId] as const;
  return ['panel_price_overrides', 'package', target.packageId] as const;
};

function buildFilter(target: OverrideTarget) {
  if ('itemId' in target) return { column: 'item_id' as const, value: target.itemId };
  if ('serviceId' in target) return { column: 'service_id' as const, value: target.serviceId };
  return { column: 'package_id' as const, value: target.packageId };
}

/* ------------------------------------------------------------------ */
/* Read                                                               */
/* ------------------------------------------------------------------ */

export function usePriceOverridesForItem(itemId?: string) {
  return useQuery({
    enabled: !!itemId,
    queryKey: itemId ? OVERRIDES_KEY({ itemId }) : ['panel_price_overrides', 'item', 'none'],
    queryFn: async (): Promise<PanelOverrideRow[]> => {
      if (!itemId) return [];
      const { data, error } = await supabase
        .from('panel_price_overrides')
        .select('id, panel_id, item_id, service_id, package_id, override_price')
        .eq('item_id', itemId);
      if (error) throw error;
      return (data ?? []) as PanelOverrideRow[];
    },
  });
}

export function usePriceOverridesForService(serviceId?: string) {
  return useQuery({
    enabled: !!serviceId,
    queryKey: serviceId
      ? OVERRIDES_KEY({ serviceId })
      : ['panel_price_overrides', 'service', 'none'],
    queryFn: async (): Promise<PanelOverrideRow[]> => {
      if (!serviceId) return [];
      const { data, error } = await supabase
        .from('panel_price_overrides')
        .select('id, panel_id, item_id, service_id, package_id, override_price')
        .eq('service_id', serviceId);
      if (error) throw error;
      return (data ?? []) as PanelOverrideRow[];
    },
  });
}

export function usePriceOverridesForPackage(packageId?: string) {
  return useQuery({
    enabled: !!packageId,
    queryKey: packageId
      ? OVERRIDES_KEY({ packageId })
      : ['panel_price_overrides', 'package', 'none'],
    queryFn: async (): Promise<PanelOverrideRow[]> => {
      if (!packageId) return [];
      const { data, error } = await supabase
        .from('panel_price_overrides')
        .select('id, panel_id, item_id, service_id, package_id, override_price')
        .eq('package_id', packageId);
      if (error) throw error;
      return (data ?? []) as PanelOverrideRow[];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Reconcile (diff existing vs desired → batch upsert + delete)       */
/* ------------------------------------------------------------------ */

export interface ReconcileInput {
  target: OverrideTarget;
  overrides: OverrideDraft[];
}

export function useReconcileOverrides() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ target, overrides }: ReconcileInput) => {
      const filter = buildFilter(target);

      // 1. Fetch existing overrides for this target
      const { data: existing, error: fetchErr } = await supabase
        .from('panel_price_overrides')
        .select('id, panel_id, override_price')
        .eq(filter.column, filter.value);
      if (fetchErr) throw fetchErr;

      const existingByPanel = new Map(
        (existing ?? []).map((row) => [row.panel_id, row]),
      );
      const desiredPanelIds = new Set(overrides.map((o) => o.panel_id));

      // 2. Determine deletions (existing but no longer desired)
      const idsToDelete = (existing ?? [])
        .filter((row) => !desiredPanelIds.has(row.panel_id))
        .map((row) => row.id);

      // 3. Determine inserts (desired but not existing)
      const toInsert = overrides
        .filter((o) => !existingByPanel.has(o.panel_id))
        .map((o) => ({
          panel_id: o.panel_id,
          override_price: o.override_price,
          item_id: 'itemId' in target ? target.itemId : null,
          service_id: 'serviceId' in target ? target.serviceId : null,
          package_id: 'packageId' in target ? target.packageId : null,
        }));

      // 4. Determine updates (price changed)
      const toUpdate = overrides
        .map((o) => {
          const prev = existingByPanel.get(o.panel_id);
          if (!prev) return null;
          if (Number(prev.override_price) === Number(o.override_price)) return null;
          return { id: prev.id, override_price: o.override_price };
        })
        .filter((x): x is { id: string; override_price: number } => x !== null);

      // 5. Execute
      if (idsToDelete.length > 0) {
        const { error } = await supabase
          .from('panel_price_overrides')
          .delete()
          .in('id', idsToDelete);
        if (error) throw error;
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('panel_price_overrides')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(toInsert as any);
        if (error) throw error;
      }

      for (const upd of toUpdate) {
        const { error } = await supabase
          .from('panel_price_overrides')
          .update({ override_price: upd.override_price })
          .eq('id', upd.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: OVERRIDES_KEY(variables.target) });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Active panels (for dropdown)                                       */
/* ------------------------------------------------------------------ */

export interface ActivePanel {
  id: string;
  name: string;
}

export function useActivePanels() {
  return useQuery({
    queryKey: ['insurance_providers', 'active', 'minimal'],
    queryFn: async (): Promise<ActivePanel[]> => {
      const { data, error } = await supabase
        .from('insurance_providers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as ActivePanel[];
    },
  });
}
