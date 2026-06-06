# Move Video Calls to Clinic Portal

Move the Video Call Management page from `/staff/website/video-calls` into the Clinic Portal at `/clinic/video-calls`.

## Changes

**1. `src/App.tsx`**
- Remove `<Route path="website/video-calls" ...>` from the staff section.
- Add `<Route path="video-calls" element={<VideoCallManagement />} />` inside the `/clinic` routes block (gated by `ClinicProtectedRoute` with `requiredRole="ops_or_admin"` to match the existing telemed/billing access level).
- Keep the existing `VideoCallManagement` import (or move it next to other clinic page imports — purely cosmetic).

**2. `src/components/clinic/ClinicLayout.tsx`**
- Add a new entry to `clinicNavItems`: `{ href: '/clinic/video-calls', label: 'Video Calls', icon: Video }` (import `Video` from `lucide-react`).
- Place it in the "Clinical & Operations" cluster — suggested position: right after `Appointments`, so it reads Patients → Appointments → **Video Calls** → Queue Board.
- Visible to all clinic staff (no `adminOnly` / `specialAdminOnly` flag); locums won't see it since they only see `locumAllowed` items.

**3. `src/components/staff/StaffLayout.tsx`**
- Remove the `{ href: '/staff/website/video-calls', label: 'Video Calls', icon: Video }` line from `contentNavItems`.
- Remove the now-unused `Video` import if nothing else references it.

## Out of scope
- No DB / RLS / edge function changes — `video_rooms` table and `video-room` function already work from any authenticated staff context.
- No changes to `VideoCallManagement.tsx` itself; it renders correctly under either layout.
- No redirect from the old `/staff/website/video-calls` URL (internal-only page, no external bookmarks expected). Happy to add a `<Navigate>` redirect if you want one — say the word.

## Access
Anyone who can enter `/clinic` with `ops_or_admin` (operations staff, doctor-admin, admin, special-admin) will see and use the page. Locums and pure clinical-only roles will not.
