-- Table 1: Staff Payroll Profiles
CREATE TABLE public.staff_payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  employee_id text,
  full_name text,
  nric_passport text,
  employment_type text DEFAULT 'permanent',
  job_title text,
  department text,
  date_joined date,
  resignation_date date,
  payroll_status text DEFAULT 'active',
  bank_name text,
  bank_account_number text,
  account_holder_name text,
  salary_payment_type text DEFAULT 'monthly',
  basic_salary numeric DEFAULT 0,
  daily_rate numeric DEFAULT 0,
  hourly_rate numeric DEFAULT 0,
  overtime_eligible boolean DEFAULT false,
  overtime_rate numeric DEFAULT 0,
  fixed_allowance numeric DEFAULT 0,
  transport_allowance numeric DEFAULT 0,
  meal_allowance numeric DEFAULT 0,
  oncall_allowance numeric DEFAULT 0,
  custom_allowance numeric DEFAULT 0,
  unpaid_leave_deduction numeric DEFAULT 0,
  lateness_deduction numeric DEFAULT 0,
  absence_deduction numeric DEFAULT 0,
  custom_deduction numeric DEFAULT 0,
  tax_id text,
  epf_reference text,
  socso_reference text,
  other_statutory_ref text,
  payroll_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.staff_payroll_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own payroll profile" ON public.staff_payroll_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin full access payroll profiles" ON public.staff_payroll_profiles
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Table 2: Attendance Payroll Records
CREATE TABLE public.attendance_payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  shift_assigned text,
  scheduled_start time,
  scheduled_end time,
  actual_clock_in timestamptz,
  actual_clock_out timestamptz,
  working_status text DEFAULT 'present',
  total_worked_hours numeric DEFAULT 0,
  late_minutes numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  approved_overtime_hours numeric DEFAULT 0,
  unpaid_leave boolean DEFAULT false,
  payable_day boolean DEFAULT true,
  payroll_locked boolean DEFAULT false,
  remarks text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attendance_payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own attendance payroll" ON public.attendance_payroll_records
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin full access attendance payroll" ON public.attendance_payroll_records
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Table 3: Monthly Payroll Summaries
CREATE TABLE public.monthly_payroll_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  total_scheduled_days integer DEFAULT 0,
  total_present_days integer DEFAULT 0,
  total_leave_days integer DEFAULT 0,
  total_absent_days integer DEFAULT 0,
  total_late_incidents integer DEFAULT 0,
  total_worked_hours numeric DEFAULT 0,
  total_overtime_hours numeric DEFAULT 0,
  total_payable_regular_hours numeric DEFAULT 0,
  total_payable_overtime_hours numeric DEFAULT 0,
  unpaid_leave_count integer DEFAULT 0,
  unpaid_leave_deduction numeric DEFAULT 0,
  lateness_deduction numeric DEFAULT 0,
  absence_deduction numeric DEFAULT 0,
  total_allowances numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  gross_pay numeric DEFAULT 0,
  net_pay numeric DEFAULT 0,
  payroll_status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, month, year)
);

ALTER TABLE public.monthly_payroll_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own payroll summaries" ON public.monthly_payroll_summaries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin full access payroll summaries" ON public.monthly_payroll_summaries
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Updated_at triggers
CREATE TRIGGER update_staff_payroll_profiles_updated_at
  BEFORE UPDATE ON public.staff_payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monthly_payroll_summaries_updated_at
  BEFORE UPDATE ON public.monthly_payroll_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();