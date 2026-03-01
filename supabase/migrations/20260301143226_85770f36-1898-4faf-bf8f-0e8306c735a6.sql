
-- Add HR columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS department text,
ADD COLUMN IF NOT EXISTS position text;

-- Geofence zones
CREATE TABLE public.geofence_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/Admin can view zones" ON public.geofence_zones FOR SELECT TO authenticated USING (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Admin can insert zones" ON public.geofence_zones FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin can update zones" ON public.geofence_zones FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin can delete zones" ON public.geofence_zones FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Attendance records
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  punch_type text NOT NULL CHECK (punch_type IN ('in', 'out')),
  punch_time timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  zone_id uuid REFERENCES public.geofence_zones(id),
  face_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own attendance" ON public.attendance_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all attendance" ON public.attendance_records FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can insert own attendance" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can delete attendance" ON public.attendance_records FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Staff zone assignments
CREATE TABLE public.staff_zone_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.geofence_zones(id) ON DELETE CASCADE,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_zone_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own assignments" ON public.staff_zone_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all assignments" ON public.staff_zone_assignments FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin can insert assignments" ON public.staff_zone_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin can update assignments" ON public.staff_zone_assignments FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin can delete assignments" ON public.staff_zone_assignments FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Staff tasks
CREATE TABLE public.staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  deadline date,
  color text NOT NULL DEFAULT '#3b82f6',
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own tasks" ON public.staff_tasks FOR SELECT TO authenticated USING (auth.uid() = assigned_to OR auth.uid() = created_by);
CREATE POLICY "Admin can view all tasks" ON public.staff_tasks FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can insert tasks" ON public.staff_tasks FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Staff can update own tasks" ON public.staff_tasks FOR UPDATE TO authenticated USING (auth.uid() = assigned_to OR auth.uid() = created_by);
CREATE POLICY "Admin can update all tasks" ON public.staff_tasks FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admin can delete tasks" ON public.staff_tasks FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_staff_tasks_updated_at BEFORE UPDATE ON public.staff_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Task delete requests
CREATE TABLE public.task_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.staff_tasks(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own delete requests" ON public.task_delete_requests FOR SELECT TO authenticated USING (auth.uid() = requested_by);
CREATE POLICY "Admin can view all delete requests" ON public.task_delete_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can insert delete requests" ON public.task_delete_requests FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));
CREATE POLICY "Admin can update delete requests" ON public.task_delete_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Leave requests
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual', 'sick', 'emergency', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own leave" ON public.leave_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin can view all leave" ON public.leave_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can insert leave" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff can update own pending leave" ON public.leave_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admin can update all leave" ON public.leave_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Staff can delete own pending leave" ON public.leave_requests FOR DELETE TO authenticated USING (auth.uid() = user_id AND status = 'pending');

-- Staff notifications
CREATE TABLE public.staff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  related_task_id uuid REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own notifications" ON public.staff_notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff can update own notifications" ON public.staff_notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff/Admin can insert notifications" ON public.staff_notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff_or_admin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notifications;
