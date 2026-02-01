import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type BlogPost = Tables<'blog_posts'>;
type BlogCategory = Tables<'blog_categories'>;

interface UseBlogPostsOptions {
  category?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}

interface UseBlogPostsReturn {
  posts: BlogPost[];
  totalPosts: number;
  totalPages: number;
  isLoading: boolean;
  error: Error | null;
  categories: BlogCategory[];
  categoriesLoading: boolean;
}

export function useBlogPosts(options: UseBlogPostsOptions = {}): UseBlogPostsReturn {
  const { category, searchQuery, page = 1, limit = 6 } = options;

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['blog-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch posts with filtering and pagination
  const { data, isLoading, error } = useQuery({
    queryKey: ['blog-posts', category, searchQuery, page, limit],
    queryFn: async () => {
      // First get category ID if filtering by category
      let categoryId: string | null = null;
      if (category) {
        const { data: catData } = await supabase
          .from('blog_categories')
          .select('id')
          .eq('slug', category)
          .single();
        categoryId = catData?.id || null;
      }

      // Build query for count
      let countQuery = supabase
        .from('blog_posts')
        .select('*', { count: 'exact', head: true })
        .eq('published', true);

      if (categoryId) {
        countQuery = countQuery.eq('category_id', categoryId);
      }

      if (searchQuery) {
        countQuery = countQuery.or(`title_en.ilike.%${searchQuery}%,title_ms.ilike.%${searchQuery}%,content_en.ilike.%${searchQuery}%,content_ms.ilike.%${searchQuery}%`);
      }

      const { count } = await countQuery;

      // Build query for posts
      let postsQuery = supabase
        .from('blog_posts')
        .select('*')
        .eq('published', true)
        .order('published_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (categoryId) {
        postsQuery = postsQuery.eq('category_id', categoryId);
      }

      if (searchQuery) {
        postsQuery = postsQuery.or(`title_en.ilike.%${searchQuery}%,title_ms.ilike.%${searchQuery}%,content_en.ilike.%${searchQuery}%,content_ms.ilike.%${searchQuery}%`);
      }

      const { data: posts, error } = await postsQuery;

      if (error) throw error;

      return {
        posts: posts || [],
        totalPosts: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      };
    },
  });

  return {
    posts: data?.posts || [],
    totalPosts: data?.totalPosts || 0,
    totalPages: data?.totalPages || 0,
    isLoading,
    error: error as Error | null,
    categories,
    categoriesLoading,
  };
}

// Hook for fetching a single post
export function useBlogPost(slug: string) {
  return useQuery({
    queryKey: ['blog-post', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select(`
          *,
          category:blog_categories(*)
        `)
        .eq('slug', slug)
        .eq('published', true)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });
}

// Hook for fetching related posts
export function useRelatedPosts(categoryId: string | null, currentPostId: string) {
  return useQuery({
    queryKey: ['related-posts', categoryId, currentPostId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('category_id', categoryId)
        .eq('published', true)
        .neq('id', currentPostId)
        .order('published_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
    enabled: !!categoryId && !!currentPostId,
  });
}
