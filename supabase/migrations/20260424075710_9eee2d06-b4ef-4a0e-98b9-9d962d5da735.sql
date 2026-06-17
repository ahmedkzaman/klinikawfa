ALTER TABLE public.doctors
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive'));
CREATE INDEX doctors_status_idx ON public.doctors(status);

ALTER TABLE public.user_roles
  ADD CONSTRAINT fk_user_roles_profile
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.doctors
  ADD CONSTRAINT fk_doctors_profile
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;