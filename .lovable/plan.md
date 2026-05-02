## Sprint 4: Calendar, Rooms & Queue TV — Reconciled Plan

### Architecture audit

The original spec collides with three live structures in our DB. Repeating the Sprint 3 lesson, we **reuse** instead of fork.

| Spec proposes | Already exists | Decision |
|---|---|---|
| `clinic_rooms (name, status)` | `public.rooms (id, label)` — used by `assigned_room_id` on `queue_entries`, `useRooms`, queue board | **Reuse `rooms`.** Add `status text default 'active'` for soft-disable. Keep column `label` (do not rename — touches consultation/queue/room joins everywhere). |
| `appointments (patient_id, start_time, end_time, status, notes)` | `public.clinic_appointments` — already FK'd from `queue_entries.source_appointment_id`, used by FollowUpScheduler, and intake_appointment_to_queue() RPC. Public `appointments` table is the **lead-form** (name/phone/service strings) — different domain. | **Reuse `clinic_appointments`** as the calendar source of truth. Do NOT touch public `appointments` (lead form). |
| `queue_entries.room_id`, `called_at` | Both already exist as `assigned_room_id` and `called_at` | **No-op** — wire up UI only. |
| `clinic_settings.queue_call_by, tv_youtube_id, tv_ticker_text` | New columns | **Add as proposed.** |

### Task 1 — Migration `sprint4_queue_tv_schema.sql`

```sql
-- Rooms: add status (active/inactive) for soft-disable
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.trg_validate_room_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS: %', NEW.status USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rooms_validate ON public.rooms;
CREATE TRIGGER trg_rooms_validate BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_room_status();

-- Allow ops/admin to mutate rooms
CREATE POLICY "Ops/Admin manage rooms" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_ops_or_admin(auth.uid()))
  WITH CHECK (public.is_ops_or_admin(auth.uid()));

-- TV / call-mode settings on the singleton settings row
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS queue_call_by text NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS tv_youtube_id text,
  ADD COLUMN IF NOT EXISTS tv_ticker_text text;

-- Extend existing trg_validate_clinic_settings to enforce queue_call_by IN ('name','number')
-- (re-create the function with the extra check appended).

-- Realtime publication for the TV
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
ALTER TABLE public.queue_entries REPLICA IDENTITY FULL;
```

No new tables. No `appointments` schema change (would break the lead form).

### Task 2 — `src/pages/clinic/settings/QueueSettings.tsx` + tile in `SettingsPage`

- **Rooms section**: list `rooms` (label + status toggle), add-row inline (label only). Uses new `useRoomsAdmin` hook with `insert/update`.
- **TV section**: form bound to `useClinicSettings().update` for `tv_youtube_id`, `tv_ticker_text`, and a radio for `queue_call_by` (`name` / `number`).
- Add route `/clinic/settings/queue` and a card on `SettingsPage` (admin/ops visible).

### Task 3 — `src/pages/clinic/Appointments.tsx` (calendar)

New main nav entry "Appointments" in `ClinicLayout` (between Queue and Patients).

- Bespoke grid: **Day** view (single column, 30-min rows 08:00–20:00) + **Week** view (7 cols × time rows). Pure CSS grid, no extra deps.
- Data source: `clinic_appointments` joined to `patients` and `doctors`. New hook `useClinicAppointmentsRange(from, to)`.
- Click empty slot → "New Appointment" dialog: PatientPicker + date/time + doctor + notes → inserts into `clinic_appointments` (status `scheduled`).
- Click existing appointment → side sheet showing details + actions:
  - **Mark Arrived & Check-In**: updates appointment status `arrived`, then opens existing `CheckInWalkInDialog` pre-filled with that patient, which on submit creates the `queue_entries` row (linking via `source_appointment_id`).
  - Cancel / No Show actions update status only.
- Statuses use the existing `clinic_appointment_status` enum; if `arrived` / `no_show` / `cancelled` are not in the enum yet, the migration appends them with `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.

### Task 4 — Doctor "Call Patient" with room selector

Touches `src/pages/clinic/Consultation.tsx` / `ConsultationDetail.tsx` (the live doctor view that already calls `useCallPatient`).

- Replace the bare "Call Patient" click with a small **Room Picker dialog** (radio of active `rooms`, remembers last choice in localStorage).
- On confirm, extend `useCallPatient` to also set `assigned_room_id`. `clinic_status` stays as the existing `with_doctor` (which is the queue's "in progress"). `called_at` and `called_by_doctor_id` already get set today.

### Task 5 — `/tv` route → `src/pages/tv/QueueTV.tsx`

- Mounted in `App.tsx` outside `ClinicLayout` and outside `MainLayout` — bare full-screen route, no header/sidebar/footer.
- Dark theme (`bg-slate-950 text-white`), 16:9 fixed layout.
- **Gate screen**: full-screen "Start TV Display" button. On click → `audio.unlock()` + reveal dashboard (sets `started=true` in state). Required because browsers block `speechSynthesis.speak()` and `<audio>` until a user gesture.
- Layout once started:
  - Left 65%: YouTube iframe `https://www.youtube.com/embed/{tv_youtube_id}?autoplay=1&mute=1&loop=1&playlist={tv_youtube_id}&controls=0`. Below it, CSS `@keyframes` marquee scrolling `tv_ticker_text`.
  - Right 35%: huge "NOW CALLING" panel showing the latest called patient (number or name based on `queue_call_by`) and the room label, with a Framer Motion scale-flash animation on change.
- **Realtime engine**: subscribe to `postgres_changes` on `queue_entries` UPDATE. Trigger fires when `clinic_status` becomes `with_doctor` AND `called_at` was just set.
  - Fetch the joined patient + room (lightweight follow-up `select` by id since `postgres_changes` payload lacks joins).
  - Push onto a "currently calling" state.
  - Play `/sounds/chime.mp3` (1 sec ding, added to `public/`), then `window.speechSynthesis.speak("Calling {name|number}, to {room.label}")`.
  - Queue announcements so simultaneous calls play sequentially.

### Task 6 — Files & route wiring

- `src/App.tsx`: add `<Route path="/tv" element={<QueueTV />} />` (outside layouts) and `<Route path="settings/queue" element={<QueueSettings />} />` inside the clinic layout block. Add Appointments route.
- `src/components/clinic/ClinicLayout.tsx`: add nav item `{ href: '/clinic/appointments', label: 'Appointments', icon: CalendarDays }`.
- New: `src/hooks/clinic/useRoomsAdmin.ts` (extend existing `useRooms.ts`).
- New: `src/hooks/clinic/useClinicAppointmentsRange.ts`.
- New: `src/components/clinic/appointments/{NewAppointmentDialog,AppointmentDetailsSheet,DayView,WeekView}.tsx`.
- New: `src/components/clinic/consultation/RoomPickerDialog.tsx`.
- New: `src/pages/tv/QueueTV.tsx` + `public/sounds/chime.mp3`.
- Update `useClinicSettings.ts` interface to include the 3 new columns.
- Update `useQueueEntries.ts` `useCallPatient` to accept optional `room_id`.

### Open question for confirmation

The doctor-call status today is `with_doctor` (your `clinic_status` enum). The spec said "in_progress" — they're the same concept. **Plan uses the existing `with_doctor` value** so the queue board, consultation workspace, and panel-claim trigger keep working. The TV will treat any transition into `with_doctor` with a fresh `called_at` as a "now calling" event. Confirm this interpretation when approving.
