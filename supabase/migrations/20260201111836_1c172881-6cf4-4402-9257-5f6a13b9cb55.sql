-- Add bilingual columns to blog_posts table
ALTER TABLE public.blog_posts
ADD COLUMN title_ms TEXT,
ADD COLUMN title_en TEXT,
ADD COLUMN content_ms TEXT,
ADD COLUMN content_en TEXT,
ADD COLUMN excerpt_ms TEXT,
ADD COLUMN excerpt_en TEXT,
ADD COLUMN featured_image TEXT,
ADD COLUMN reading_time INTEGER DEFAULT 5;

-- Add bilingual columns to blog_categories table
ALTER TABLE public.blog_categories
ADD COLUMN name_ms TEXT,
ADD COLUMN name_en TEXT;

-- Migrate existing data to new columns (use existing title/content for English)
UPDATE public.blog_posts
SET 
  title_en = title,
  content_en = content,
  title_ms = title,
  content_ms = content;

-- Migrate existing category names to English column
UPDATE public.blog_categories
SET 
  name_en = name,
  name_ms = name;

-- Insert default categories if they don't exist
INSERT INTO public.blog_categories (slug, name, name_ms, name_en)
VALUES 
  ('children-health', 'Children''s Health', 'Kesihatan Kanak-kanak', 'Children''s Health'),
  ('general-health', 'General Health', 'Kesihatan Umum', 'General Health'),
  ('lump-wart-info', 'Lump & Wart Info', 'Info Ketumbuhan & Ketuat', 'Lump & Wart Info'),
  ('ent-ear-care', 'ENT / Ear Care Tips', 'Tips Penjagaan Telinga', 'ENT / Ear Care Tips')
ON CONFLICT (slug) DO UPDATE SET
  name_ms = EXCLUDED.name_ms,
  name_en = EXCLUDED.name_en;