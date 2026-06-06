## Goal
Build Landing Pages CMS at `/staff/admin/landing-pages` for full CRUD of `public.clinic_services`.

## Files

### 1. `src/pages/staff/admin/LandingPages.tsx` (new)
Self-contained admin page using React Hook Form + Zod + TanStack Query.

- **List view**: shadcn `Table` with columns Title, Slug (mono), Last Updated (relative via `date-fns/formatDistanceToNow`), Actions. Actions: open public page (`/services/{slug}` new tab), Edit, Delete. Loading row + empty state row.
- **Header**: title "Landing Pages" + "Create New Landing Page" button.
- **Create/Edit `Dialog`** (max-w-2xl, scrollable) shared for both modes. Fields: title, slug (disabled in edit mode, helper "No spaces, lowercase only, e.g. rawatan-ke-rumah"), call_to_action (default "Book Appointment"), description (Textarea rows={4}), hero_image_url (optional url), promo_video_url (optional url), services_list dynamic editor (`useFieldArray` over `{value: string}[]`, Add Item / trash row, disabled trash when length===1).
- **Zod schema**: slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` max 80; title 1–120; description 1–500; cta 1–60; urls `.url().optional().or(z.literal(""))`; services_list min 1 item.
- **Save mutation**: maps field array to string[], filters empties, nulls empty urls. Insert on create; Update with `updated_at: new Date().toISOString()` on edit. Error 23505 → "slug already exists" toast. Success → toast + close + invalidate `['clinic-services-admin']`.
- **Delete**: `AlertDialog` confirm → delete by id → toast + invalidate.

### 2. `src/App.tsx`
- Import `LandingPages` with the other staff admin pages.
- Add `<Route path="admin/landing-pages" element={<LandingPages />} />` inside the existing `/staff` block (next to other `admin/*` routes around line 167).

### 3. `src/components/staff/StaffLayout.tsx`
- Add `Globe` to the lucide-react import on line 10–13.
- Append `{ href: '/staff/admin/landing-pages', label: 'Landing Pages', icon: Globe }` to `adminNavItems` (after Punch Settings, line 52).

## Access control
`/staff/admin/*` already runs under StaffLayout's auth+role gating, and `clinic_services` RLS only allows mutations for `is_admin(auth.uid())` — non-admins will see read-only failures via toast. No new wrapper needed.

## Out of scope
- No schema, RLS, or storage changes (hero_image_url is plain text input only).
- No bilingual fields, pagination, bulk actions.
