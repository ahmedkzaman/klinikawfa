import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Review {
  id: string;
  name_ms: string;
  name_en: string | null;
  text_ms: string;
  text_en: string | null;
  rating: number;
  published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type ReviewInsert = Omit<Review, 'id' | 'created_at' | 'updated_at'>;
export type ReviewUpdate = Partial<ReviewInsert> & { id: string };

export function useReviews(publishedOnly = true) {
  return useQuery({
    queryKey: ['reviews', { publishedOnly }],
    queryFn: async () => {
      if (publishedOnly) {
        const { data, error } = await supabase
          .from('website_review_presentations')
          .select('id,name_ms,name_en,review_text_ms,review_text_en,rating,display_order,created_at,updated_at')
          .eq('status', 'published')
          .order('display_order', { ascending: true });
        if (error) throw error;
        return (data || []).map((row) => ({
          id: row.id,
          name_ms: row.name_ms,
          name_en: row.name_en,
          text_ms: row.review_text_ms,
          text_en: row.review_text_en,
          rating: row.rating,
          published: true,
          display_order: row.display_order,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })) as Review[];
      }
      const query = supabase
        .from('reviews')
        .select('*')
        .order('display_order', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      return data as Review[];
    },
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (review: ReviewInsert) => {
      const { data, error } = await supabase
        .from('reviews')
        .insert(review)
        .select()
        .single();

      if (error) throw error;
      return data as Review;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useUpdateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ReviewUpdate) => {
      const { data, error } = await supabase
        .from('reviews')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Review;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reviews').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
