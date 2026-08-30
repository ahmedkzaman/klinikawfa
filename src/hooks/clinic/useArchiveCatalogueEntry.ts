import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CatalogueType } from '@/lib/clinic/catalogueArchive';

export function useArchiveCatalogueEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: CatalogueType; id: string }) => {
      const { error } = await supabase.rpc('archive_catalogue_entry' as never, { p_catalogue_type: type, p_entry_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => ['inventory_items', 'inventory_items_safe', 'services', 'services_safe', 'packages', 'packages_safe'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  });
}
