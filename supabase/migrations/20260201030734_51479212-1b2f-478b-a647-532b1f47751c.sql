-- =============================================
-- STAGE 5: Database Schema for Klinik Awfa
-- =============================================

-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- 2. Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TIME NOT NULL,
  service TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 5. Create blog_categories table
CREATE TABLE public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

-- 6. Create blog_posts table
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- 7. Create gallery_images table
CREATE TABLE public.gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  alt_text TEXT,
  tags TEXT[],
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to check if user is staff or admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'staff')
  )
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Staff/Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- User roles policies (admin only)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Appointments policies
CREATE POLICY "Anyone can submit appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Staff/Admin can view appointments"
  ON public.appointments FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update appointments"
  ON public.appointments FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete appointments"
  ON public.appointments FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- Blog categories policies
CREATE POLICY "Anyone can view categories"
  ON public.blog_categories FOR SELECT
  USING (true);

CREATE POLICY "Staff/Admin can insert categories"
  ON public.blog_categories FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update categories"
  ON public.blog_categories FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete categories"
  ON public.blog_categories FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- Blog posts policies
CREATE POLICY "Anyone can view published posts"
  ON public.blog_posts FOR SELECT
  USING (published = true);

CREATE POLICY "Staff/Admin can view all posts"
  ON public.blog_posts FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can insert posts"
  ON public.blog_posts FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update posts"
  ON public.blog_posts FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete posts"
  ON public.blog_posts FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- Gallery images policies
CREATE POLICY "Anyone can view gallery images"
  ON public.gallery_images FOR SELECT
  USING (true);

CREATE POLICY "Staff/Admin can insert gallery images"
  ON public.gallery_images FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can update gallery images"
  ON public.gallery_images FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/Admin can delete gallery images"
  ON public.gallery_images FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- =============================================
-- TRIGGERS
-- =============================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blog_categories_updated_at
  BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();