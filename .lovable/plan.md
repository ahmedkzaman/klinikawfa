

## Comprehensive Staff Profile, Attendance Review & Settings System

This is a large feature set. I'll break it into manageable phases.

### What Already Exists
- Onboarding form (4-step wizard with personal, education, bank, health data) — stored in `staff_onboarding.onboarding_data` JSONB
- Attendance records (`attendance_records` table with punch in/out)
- Leave requests with approval workflow
- Staff History page (basic punch log)
- Language context (BM/EN toggle)
- Admin Employees page (role management)
- Saved rosters (doctor/support shifts)
- Admin onboarding status viewer

### What Needs to Be Built

---

### Phase 1: Database Changes (1 migration)

**New table: `staff_profile_submissions`** — tracks profile change requests with approval workflow

```sql
CREATE TABLE public.staff_profile_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE staff_profile_submissions ENABLE ROW LEVEL SECURITY;

-- Staff can manage own submissions
CREATE POLICY "Users can manage own profile submissions"
  ON staff_profile_submissions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin can view/update all
CREATE POLICY "Admins can manage all profile submissions"
  ON staff_profile_submissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

**Add `lateness_threshold_minutes` to `app_settings`** — configurable grace period (default 15 min).

---

### Phase 2: Admin Attendance Review Dashboard

**New file: `src/pages/staff/admin/AttendanceReview.tsx`**

- Month selector filter
- Staff name search + position filter
- 4 summary cards: Total Present, Total Leave, Total Absentees, Total Lateness
- Interactive donut chart (using existing Recharts/chart components) with segments: Working, Leave, Absentees, Lateness
- Click chart segment → filtered detail table below with: full name, date, expected clock-in (from roster), actual clock-in, lateness duration, status
- CSV export button for the month's data

**Attendance logic:**
- Cross-reference `attendance_records`, `leave_requests` (approved), and `saved_rosters` for each day
- Working = punch-in exists for a scheduled day
- Leave = approved leave covers the date
- Absent = scheduled in roster but no punch and no leave
- Late = punch-in exists but after shift start + configurable threshold

---

### Phase 3: Staff Attendance Self-Service Dashboard

**New file: `src/pages/staff/AttendanceReview.tsx`**

- Same structure as admin version but filtered to own records only
- Month selector, summary cards, donut chart
- Click segments to drill down into own absence/lateness records
- No CSV export (admin only)

---

### Phase 4: Staff Profile Page

**New file: `src/pages/staff/Profile.tsx`**

- Displays current approved profile data (pulled from latest approved `staff_profile_submissions` or `staff_onboarding.onboarding_data` as baseline)
- Fields: full name, IC/passport, phone, email, home address, bank name, bank account (masked as `****1234`), emergency contact, job title, department, preferred language
- "Edit Profile" button opens editable form
- On submit, creates a `staff_profile_submissions` record with status `pending`
- Shows current approval status banner (approved / pending review / rejected with reason)
- Resubmit option if rejected
- Bank account fully visible only to admin viewers

---

### Phase 5: Admin Profile Approval Page

**New file: `src/pages/staff/admin/ProfileApprovals.tsx`**

- List of pending profile submissions with staff name
- Click to view full submitted profile data side-by-side with current approved data
- Approve / Reject buttons (reject requires reason)
- On approve: update `staff_onboarding.onboarding_data` with new data, mark submission approved
- Approval history log (all submissions for each staff)

---

### Phase 6: Account Settings Page

**New file: `src/pages/staff/Settings.tsx`**

- Change password (using Supabase `updateUser({ password })`)
- Language selector (EN / BM) — saves to localStorage via existing `LanguageContext`, extensible for more languages
- Save preferences button

---

### Phase 7: Navigation & Routing Updates

**Edit: `src/components/staff/StaffLayout.tsx`**
- Add to Staff nav: "My Profile", "Attendance Review"
- Add to Admin nav: "Attendance Review", "Profile Approvals"
- Add to Staff nav (bottom): "Settings"

**Edit: `src/App.tsx`**
- Add routes: `/staff/profile`, `/staff/attendance-review`, `/staff/settings`, `/staff/admin/attendance-review`, `/staff/admin/profile-approvals`

---

### Files Summary

**Migration (1):**
- Create `staff_profile_submissions` table + RLS
- Insert lateness threshold setting

**New files (5):**
1. `src/pages/staff/admin/AttendanceReview.tsx`
2. `src/pages/staff/AttendanceReview.tsx`
3. `src/pages/staff/Profile.tsx`
4. `src/pages/staff/admin/ProfileApprovals.tsx`
5. `src/pages/staff/Settings.tsx`

**Edited files (2):**
1. `src/components/staff/StaffLayout.tsx` — nav items
2. `src/App.tsx` — routes

### Security
- Staff can only see own attendance and profile
- Profile changes require admin approval before becoming official
- Bank account numbers masked for non-admin views
- All new tables have RLS policies
- Existing attendance system untouched

