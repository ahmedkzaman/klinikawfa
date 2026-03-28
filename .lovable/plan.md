

## Add Position Selector to Staff Directory

### What changes
Add a dropdown in each employee row on the Employees page to set their position from a fixed list: Clinic Assistant, Staff Nurse, Medical Assistant, Doctor, Manager. Changing the position updates the `profiles.position` column. This value is already displayed on the employee's own profile and can be referenced in appraisal workflows.

### File: `src/pages/staff/admin/Employees.tsx`

1. Define a constant array of positions:
   ```typescript
   const STAFF_POSITIONS = ['Clinic Assistant', 'Staff Nurse', 'Medical Assistant', 'Doctor', 'Manager'];
   ```

2. Add a `handlePositionChange` function that updates `profiles.position` via Supabase and refreshes the list.

3. In each employee row, add a second `<Select>` dropdown (next to the role selector) for position, showing the 5 options. Pre-select the current `e.position` value. Include a "No position" placeholder for unset values.

### No database changes needed
The `profiles.position` column already exists as `text` and RLS already allows admins to update profiles (via `Users can update own profile` policy). However, admins need to update **other** users' profiles — need to check if there's an admin update policy.

**RLS gap**: The current `profiles` table only has "Users can update own profile" — admins can't update other users' positions. A migration is needed to add an admin update policy:
```sql
CREATE POLICY "Admin can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
```

### Summary of changes
- 1 migration: Add admin update policy on profiles
- 1 file edit: `Employees.tsx` — add position dropdown with 5 options

