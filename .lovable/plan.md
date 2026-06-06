# Patient Self-Booking & Admin Appointment Sync

## 1. Public booking page — `src/pages/AppointmentBooking.tsx`

Replace the existing `/appointment` route (currently `src/pages/Appointment.tsx`) with a fresh multi-step component wrapped in `MainLayout` + `SEOHead`.

State: `step` (1 | 2 | 3 | 4-success), plus `react-hook-form` with `zod` resolver covering all fields, so each "Next" button calls `form.trigger([...stepFields])` before advancing.

**Step 1 — Patient Details (Card)**
- `patient_name` (text, 2–80, trimmed)
- `patient_phone` (text, regex `^\+?60?1\d{7,9}$` or simple `^[0-9+\-\s]{8,15}$`)
- `patient_ic` (12-digit Malaysian IC, optional spaces/dashes stripped)
- Next button → validate → step 2

**Step 2 — Service & Slot (Card)**
- `useQuery(['clinic-services-public'])` → `supabase.from('clinic_services').select('slug,title').order('title')`. Render in a `Select`; selected option writes `service_slug` and the display `service` title.
- Date: shadcn `Popover` + `Calendar` (`mode="single"`, `disabled={{ before: today }}`, `pointer-events-auto`). Stored as ISO `yyyy-MM-dd`.
- Time: `Select` of 30-min slots from `09:00`–`16:30` inclusive (last bookable slot `16:30`, clinic closes 17:00). Generated client-side.
- Back / Next.

**Step 3 — Payment Lock & Checkout (Card)**
- Read-only summary list of all entered values + service title.
- Notice block: "A booking fee is required to confirm this slot. Your appointment will be marked **Pending Payment** until the fee is received."
- PDPA consent checkbox (required).
- Primary button **"Proceed to Payment"** runs the `bookMutation`:
  ```ts
  supabase.from('appointments').insert({
    patient_name, patient_phone, patient_ic,
    service: serviceTitle,
    service_slug,
    appointment_date,
    appointment_time, // 'HH:mm'
    status: 'pending_payment',
  }).select('id').single()
  ```
  On success → store returned id → advance to success step. On error → `toast.destructive`.

**Step 4 — Success screen**
- Centered Card with `CheckCircle`, headline "Booking received", subtext "Redirecting to secure payment gateway…", booking reference (short id), and a "Return home" link. No actual redirect yet (Stripe wiring deferred).

A small stepper header (1 ▸ 2 ▸ 3) at top of the card for orientation.

## 2. Admin sync dashboard — `src/pages/staff/admin/AppointmentsView.tsx`

Route `/staff/admin/appointments` inside the existing StaffLayout (auth + admin gating already enforced).

**Data**
```ts
useQuery(['admin-appointments'], () =>
  supabase
    .from('appointments')
    .select('id, patient_name, patient_phone, patient_ic, appointment_date, appointment_time, service, status, clinic_services:service_slug(title)')
    .order('appointment_date', { ascending: true })
    .order('appointment_time', { ascending: true })
)
```
Service column prefers `clinic_services.title`, falls back to `appointments.service`.

**Layout**
- Page header "Appointments" + small refresh button.
- `Tabs` with two values:
  - `upcoming` — rows where `status = 'confirmed'` and `appointment_date >= today`.
  - `pending` — rows where `status = 'pending_payment'`.
- Each tab renders the same `Table`: Date · Time · Patient Name · Service · Contact (phone) · Status badge · Actions.
- Empty state row per tab.

**Row actions (Admins only, gated by `isAdmin` from `useAuth`)**
- Always: **Cancel Booking** → `AlertDialog` confirm → `update({ status: 'cancelled', updated_at: now })`.
- Upcoming tab: **Mark as Completed** → `update({ status: 'completed' })`.
- Pending tab: **Force Confirm** (cash at counter) → `update({ status: 'confirmed', payment_reference: 'COUNTER-CASH' })`.

All mutations use a single `useMutation` factory that takes `(id, patch)`, shows a toast, and invalidates `['admin-appointments']`.

## 3. Wiring

- `src/App.tsx`:
  - Replace `import Appointment from "./pages/Appointment"` with `import AppointmentBooking from "./pages/AppointmentBooking"` and update the `/appointment` route element.
  - Add `<Route path="admin/appointments" element={<AppointmentsView />} />` inside the existing `/staff` block.
- `src/components/staff/StaffLayout.tsx`: add `CalendarCheck` (already imported) entry `{ href: '/staff/admin/appointments', label: 'Appointments', icon: CalendarCheck }` to `adminNavItems`, placed just below "Admin Dashboard".

## Out of scope

- Real Stripe checkout (button stays mocked, success screen only).
- Slot-conflict prevention / availability lookup against existing bookings.
- Bilingual copy (will inherit current `LanguageContext` for static labels only where trivial).
- Schema, RLS, or storage changes — all required policies and FKs already exist.
- Edits to the legacy `pages/Appointment.tsx` beyond removing its route import (file can be deleted in a follow-up if unused).
