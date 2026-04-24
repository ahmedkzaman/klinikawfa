import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const QUERY_KEY = ['packages'];

export function usePackages() {
  const queryClient = useQueryClient();

  const { data: packages = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('packages').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const addPackage = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('packages').insert(values as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const updatePackage = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase
        .from('packages')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deletePackage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return { packages, isLoading, addPackage, updatePackage, deletePackage };
}

/* ------------------------------------------------------------------ */
/* Named mutation hooks (Step 12 catalog management)                  */
/* ------------------------------------------------------------------ */

export interface PackageInput {
  name: string;
  cost: number;
  price: number;
}

function mapPackagePayload(input: Partial<PackageInput>) {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.cost !== undefined) payload.cost = input.cost;
  if (input.price !== undefined) payload.price = input.price;
  return payload;
}

export function useAddPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PackageInput) => {
      const { error } = await supabase
        .from('packages')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(mapPackagePayload(input) as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<PackageInput>) => {
      const { error } = await supabase
        .from('packages')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(mapPackagePayload(input) as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
