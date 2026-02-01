-- Create reviews table for patient testimonials
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ms TEXT NOT NULL,
  name_en TEXT,
  text_ms TEXT NOT NULL,
  text_en TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  published BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can view published reviews (for homepage)
CREATE POLICY "Anyone can view published reviews"
ON public.reviews
FOR SELECT
USING (published = true);

-- Staff/Admin can view all reviews
CREATE POLICY "Staff/Admin can view all reviews"
ON public.reviews
FOR SELECT
USING (is_staff_or_admin(auth.uid()));

-- Staff/Admin can insert reviews
CREATE POLICY "Staff/Admin can insert reviews"
ON public.reviews
FOR INSERT
WITH CHECK (is_staff_or_admin(auth.uid()));

-- Staff/Admin can update reviews
CREATE POLICY "Staff/Admin can update reviews"
ON public.reviews
FOR UPDATE
USING (is_staff_or_admin(auth.uid()));

-- Staff/Admin can delete reviews
CREATE POLICY "Staff/Admin can delete reviews"
ON public.reviews
FOR DELETE
USING (is_staff_or_admin(auth.uid()));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();