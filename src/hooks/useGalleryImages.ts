import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type GalleryImage = Tables<'gallery_images'>;

interface GalleryCategory {
  id: string;
  labelMs: string;
  labelEn: string;
  tags: string[];
}

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  { 
    id: 'all', 
    labelMs: 'Semua', 
    labelEn: 'All', 
    tags: [] 
  },
  { 
    id: 'waiting', 
    labelMs: 'Ruang Menunggu & Zon Kanak-kanak', 
    labelEn: 'Waiting Area & Kids Zone', 
    tags: ['waiting', 'kids', 'play', 'lobby'] 
  },
  { 
    id: 'treatment', 
    labelMs: 'Bilik Rawatan', 
    labelEn: 'Treatment Rooms', 
    tags: ['treatment', 'room', 'consultation'] 
  },
  { 
    id: 'exterior', 
    labelMs: 'Luaran Klinik', 
    labelEn: 'Clinic Exterior', 
    tags: ['exterior', 'signage', 'entrance', 'building'] 
  },
  { 
    id: 'staff', 
    labelMs: 'Kakitangan', 
    labelEn: 'Staff', 
    tags: ['staff', 'team', 'doctor', 'nurse'] 
  },
  { 
    id: 'events', 
    labelMs: 'Acara', 
    labelEn: 'Events', 
    tags: ['events', 'event', 'celebration', 'ceremony', 'activity'] 
  },
];

export type GalleryCategoryId = 'all' | 'waiting' | 'treatment' | 'exterior' | 'staff' | 'events';

async function fetchGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function useGalleryImages(activeCategory: GalleryCategoryId = 'all') {
  const query = useQuery({
    queryKey: ['gallery-images'],
    queryFn: fetchGalleryImages,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Client-side filtering for instant response
  const filteredImages = query.data?.filter((image) => {
    if (activeCategory === 'all') return true;
    
    const category = GALLERY_CATEGORIES.find((c) => c.id === activeCategory);
    if (!category || category.tags.length === 0) return true;

    // Check if any of image's tags match the category's tags
    const imageTags: string[] = image.tags || [];
    return imageTags.some((tag: string) => 
      category.tags.some((catTag) => 
        tag.toLowerCase().includes(catTag.toLowerCase())
      )
    );
  }) || [];

  return {
    images: filteredImages,
    allImages: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
