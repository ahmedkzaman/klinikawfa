import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicPackage {
  id: string;
  name: string;
  description: string | null;
  total_price: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicPackageItem {
  id: string;
  package_id: string;
  inventory_item_id: string;
  quantity: number;
  inventory_item?: { id: string; name: string } | null;
}

export interface ClinicPackageItemDraft {
  inventory_item_id: string;
  quantity: number;
}

const LIST_KEY = ['clinic_packages'];
const ITEMS_KEY = (id?: string) => ['clinic_package_items', id ?? 'none'];

export function useClinicPackages() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<ClinicPackage[]> => {
      const { data, error } = await supabase
        .from('clinic_packages')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as ClinicPackage[];
    },
  });
}

export function useClinicPackageItems(packageId?: string) {
  return useQuery({
    queryKey: ITEMS_KEY(packageId),
    enabled: !!packageId,
    queryFn: async (): Promise<ClinicPackageItem[]> => {
      if (!packageId) return [];
      const { data, error } = await supabase
        .from('clinic_package_items')
        .select('*, inventory_item:inventory_items(id, name)')
        .eq('package_id', packageId);
      if (error) throw error;
      return (data ?? []) as unknown as ClinicPackageItem[];
    },
  });
}

export function useUpsertClinicPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id?: string | null;
      name: string;
      description?: string | null;
      total_price: number;
      items: ClinicPackageItemDraft[];
    }): Promise<{ id: string }> => {
      let pkgId = args.id ?? null;
      const payload = {
        name: args.name,
        description: args.description ?? null,
        total_price: Number(args.total_price) || 0,
      };

      if (pkgId) {
        const { error } = await supabase
          .from('clinic_packages')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update(payload as any)
          .eq('id', pkgId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('clinic_packages')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(payload as any)
          .select('id')
          .single();
        if (error) throw error;
        pkgId = (data as { id: string }).id;
      }

      // Reconcile items: delete-then-insert
      const { error: delErr } = await supabase
        .from('clinic_package_items')
        .delete()
        .eq('package_id', pkgId);
      if (delErr) throw delErr;

      const cleaned = args.items
        .filter((it) => it.inventory_item_id && Number(it.quantity) > 0)
        .map((it) => ({
          package_id: pkgId!,
          inventory_item_id: it.inventory_item_id,
          quantity: Number(it.quantity),
        }));

      if (cleaned.length > 0) {
        const { error: insErr } = await supabase
          .from('clinic_package_items')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(cleaned as any);
        if (insErr) throw insErr;
      }

      return { id: pkgId! };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ITEMS_KEY(res.id) });
    },
  });
}

export function useDeleteClinicPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clinic_packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
