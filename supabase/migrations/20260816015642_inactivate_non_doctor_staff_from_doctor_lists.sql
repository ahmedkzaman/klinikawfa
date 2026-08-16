-- Keep historical consultation attribution intact, but remove these staff
-- profiles from active doctor pickers, appointment assignment, roster/call-in
-- lists, and doctor-on-duty selection going forward.
UPDATE public.doctors
SET
  status = 'inactive',
  on_duty = false,
  updated_at = now()
WHERE lower(trim(name)) IN (
  'siti rozita binti ramli',
  'nurul husna binti ab rahman',
  'nur intan syazwanie',
  'dr. novencia',
  'novencia'
);
