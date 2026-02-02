-- Add scheduled_at column to blog_posts table for scheduled publishing
ALTER TABLE public.blog_posts 
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE;