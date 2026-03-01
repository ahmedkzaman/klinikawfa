

# Plan: Port Staff & Admin HR Features from BioInnoTech to Klinik Awfa

## Overview

Add a **Staff Portal** (`/staff/*`) to Klinik Awfa with attendance tracking, calendar/task management, leave management, and admin HR tools -- all adapted from the BioInnoTech project. The existing `/admin/*` panel for content management (blog, gallery, reviews, etc.) stays untouched.

---

## Redundancies Identified

| Feature | Klinik Awfa (existing) | BioInnoTech (incoming) | Resolution |
|---------|----------------------|----------------------|------------|
| **User role management** | `/admin/users` manages admin/staff roles | Employees page also manages roles | Keep both -- existing one for content roles, new Employees page for HR/attendance context |
| **Authentication** | `AuthContext` at `/auth` with role-based access | Separate `useAuth` hook + `/staff/login` | Reuse existing `AuthContext` -- no separate staff login needed. Staff access `/staff/*` via existing `/auth` page |
| **Appraisals** | Not present | Present in BioInnoTech | Will **skip** -- not shown in screenshot reference |

---

## Modules to Build (Excluding Articles)

### Staff Pages (accessible by staff & admin)
1. **Staff Dashboard** -- Welcome screen, punch status, notifications, quick actions
2. **Punch In/Out** -- GPS geofencing + face verification for attendance
3. **History** -- Attendance records with monthly view, CSV export
4. **Calendar** -- Task management with month/week/day views, real-time sync
5. **Leave** -- Request annual/sick/emergency leave, view team leaves
6. **Documents** -- Empty placeholder page (to be updated later)

### Admin Pages (admin-only)
1. **Staff Admin Dashboard** -- Stats: employee count, zones, today's punches
2. **Employees** -- View staff directory, change roles, invite new employees
3. **Zones** -- Create/edit/delete geofence locations with GPS coordinates
4. **Assignments** -- Assign staff to zones with shift schedules (days + times)
5. **Requests** -- Approve/reject leave requests and task deletion requests

---

## Technical Implementation

### Phase 1: Database Tables (single migration)

New tables to create:

```text
geofence_zones
  - id, name, description, latitude, longitude, radius_meters, is_active, created_at

attendance_records
  - id, user_id, punch_type (in/out), punch_time, latitude, longitude,
    accuracy_meters, zone_id, face_verified, created_at

staff_zone_assignments
  - id, user_id, zone_id, start_time, end_time, days_of_week (int[]),
    is_active, created_at

staff_tasks
  - id, title, description, created_by, assigned_to, start_date,
    end_date, deadline, color, is_completed, created_at, updated_at

task_delete_requests
  - id, task_id, requested_by, status, reviewed_by, reviewed_at, created_at

leave_requests
  - id, user_id, leave_type, start_date, end_date, reason, status,
    reviewed_by, reviewed_at, created_at

staff_notifications
  - id, user_id, type, title, message, related_task_id, is_read, created_at
```

Also: add `phone`, `department`, `position` columns to existing `profiles` table.

RLS policies: Staff can read/write own records; admin can manage all. Geofence zones readable by all authenticated staff.

Enable realtime on `staff_tasks`, `leave_requests`, and `staff_notifications`.

### Phase 2: Utility Libraries & Hooks

| File | Purpose |
|------|---------|
| `src/lib/geofence.ts` | Haversine distance calculation, zone checking, accuracy status |
| `src/hooks/useGeolocation.ts` | Browser GPS position tracking |
| `src/hooks/useStaffTasks.ts` | CRUD for tasks with realtime sync, delete request flow |
| `src/hooks/useNotifications.ts` | Staff notifications with realtime updates |
| `src/hooks/useFaceDetection.ts` | Face detection + blink verification using face-api.js |

### Phase 3: Components

| Component | Purpose |
|-----------|---------|
| `src/components/staff/StaffLayout.tsx` | Sidebar navigation + auth guard for staff portal |
| `src/components/staff/FaceVerificationModal.tsx` | Camera-based face verification for punch |
| `src/components/staff/calendar/CalendarHeader.tsx` | View switcher (month/week/day) + navigation |
| `src/components/staff/calendar/MonthView.tsx` | Monthly calendar grid with task pills |
| `src/components/staff/calendar/WeekView.tsx` | Weekly timeline view |
| `src/components/staff/calendar/DayView.tsx` | Daily timeline view |
| `src/components/staff/calendar/TaskDialog.tsx` | Create/edit task dialog |
| `src/components/staff/calendar/TaskPill.tsx` | Task display chip |
| `src/components/staff/calendar/LeavePill.tsx` | Leave display chip |

### Phase 4: Pages

**Staff pages** (under `src/pages/staff/`):
- `Dashboard.tsx`, `Punch.tsx`, `History.tsx`, `Calendar.tsx`, `LeaveRequest.tsx`, `Documents.tsx`

**Admin pages** (under `src/pages/staff/admin/`):
- `Dashboard.tsx`, `Employees.tsx`, `Zones.tsx`, `Assignments.tsx`, `Requests.tsx`

### Phase 5: Routing & Integration

Add routes in `App.tsx`:

```text
/staff/dashboard    --> StaffDashboard
/staff/punch        --> StaffPunch
/staff/history      --> StaffHistory
/staff/calendar     --> StaffCalendar
/staff/leave        --> StaffLeaveRequest
/staff/documents    --> StaffDocuments
/staff/admin        --> StaffAdminDashboard
/staff/admin/employees   --> AdminEmployees
/staff/admin/zones       --> AdminZones
/staff/admin/assignments --> AdminAssignments
/staff/admin/requests    --> AdminRequests
```

All routes wrapped with `StaffLayout` which checks for staff/admin role using existing `AuthContext`.

### Key Adaptations from BioInnoTech

- Replace `useAuth()` hook calls with Klinik Awfa's `useAuth()` from `@/contexts/AuthContext`
- Use existing `profiles` table (add missing columns via migration)
- Adapt branding: use Klinik Awfa logo, "Klinik Awfa Staff" text
- Use bilingual labels (Malay/English) matching existing language context
- Documents page will be a placeholder with "Coming Soon" message

### Dependencies

- `face-api.js` -- for face detection/blink verification (loaded dynamically from CDN, no npm install needed)

---

## Files Created/Modified Summary

**New files (~25):**
- 1 database migration
- 3 utility/lib files
- 4 hooks
- 9 components
- 11 pages

**Modified files (2):**
- `src/App.tsx` -- add staff routes
- `src/pages/Auth.tsx` -- (optional) add staff portal link

