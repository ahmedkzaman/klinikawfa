

## Roster Generator Enhancements

### Requirements Summary
1. **OT threshold**: Max normal hours = 45h/week; anything above = OT
2. **Hybrid staff row**: New row for "Purchaser" and "Housecall Nurse" — assigned by admin, AM-only shift, counts as working hours
3. **Permanent off days**: Admin can set which day(s) of the week each staff member is permanently off
4. **Max 6 consecutive working days**: Enforce minimum 1 rest day per week in the generator

### Changes

**Database Migration**
- Add a `staff_roster_settings` table to persist per-staff hybrid type and permanent off days:
  - `id` (uuid PK)
  - `user_id` (uuid, unique)
  - `hybrid_type` (text, nullable — `'purchaser'` | `'housecall_nurse'` | null)
  - `permanent_off_days` (integer array — day-of-week indices, e.g. `[0]` for Sunday)
  - `created_at`, `updated_at`
- RLS: admin full access, staff can view own

**Edit: `src/pages/staff/admin/Roster.tsx` (Support Staff RosterPanel)**
1. Add a **Staff Settings** card where admin can:
   - Toggle hybrid type per staff (None / Purchaser / Housecall Nurse)
   - Select permanent off day(s) per staff (checkboxes for Mon–Sun)
2. Load/save these settings from `staff_roster_settings`
3. Add a **Hybrid** row in the roster table (AM shift: 8am–2pm, 6h) — only hybrid staff appear here
4. Update `generateRoster()`:
   - Change OT threshold from 48h to 45h (normal ≤ 45h, >45h = OT)
   - Skip assigning staff on their permanent off days
   - Enforce max 6 consecutive working days — if a staff member has worked 6 days in a row, force a rest day
   - Hybrid staff on hybrid-shift days get assigned to the Hybrid row (AM only), not regular shifts
5. Update `RosterData` interface to include `hybrid: RosterCell[]`
6. Update summary calculation to include hybrid shift hours
7. Update the "Off" row to account for hybrid assignments

**Edit: `src/components/staff/roster/DoctorRosterPanel.tsx`**
- Same enhancements for doctor roster: permanent off days, 6-day consecutive limit, 45h OT threshold
- Hybrid row not applicable to doctors (only support staff)

**Edit: `src/lib/rosterUtils.ts`**
- Add `Hybrid` to `SHIFT_TIMES` map: `{ start: '08:00', end: '14:00', label: 'Hybrid (8am – 2pm)' }`
- Update any shift lookup logic to handle hybrid shifts

**Edit: `src/pages/staff/admin/Employees.tsx`**
- Add "Purchaser" and "Housecall Nurse" to `STAFF_POSITIONS` array

### Technical Details
- Hybrid shift = 6 hours (8am–2pm), same as S1
- The roster data structure gains a `hybrid` key per day: `{ shift1, shift2, hybrid }`
- Consecutive-day tracking: during generation, maintain a counter per staff; reset on rest days; if counter reaches 6, force skip on next day
- Permanent off days stored as integer array matching JS `getDay()` (0=Sun, 1=Mon, etc.)

### Files
- **Migration**: Create `staff_roster_settings` table
- **Edit**: `src/pages/staff/admin/Roster.tsx` — hybrid row, off days, consecutive limit, 45h OT
- **Edit**: `src/components/staff/roster/DoctorRosterPanel.tsx` — off days, consecutive limit, 45h OT
- **Edit**: `src/lib/rosterUtils.ts` — hybrid shift definition
- **Edit**: `src/pages/staff/admin/Employees.tsx` — new positions

