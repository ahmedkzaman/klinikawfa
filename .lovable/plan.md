## Sprint 4 Hotfix Plan — Navigation, Queue Visibility, Dispensary Calls, TV Player

Four operational fixes. No new features.

---

### Task 1 — Sidebar reorder

**File:** `src/components/clinic/ClinicLayout.tsx`

Replace the `clinicNavItems` array with the exact requested sequence. Add new lucide imports (`LayoutDashboard`, `PackageSearch`, `ShoppingCart`, `Trash2`) and drop the no-longer-used ones (`ListOrdered`, `Package`, `ClipboardList`, `Archive`).

New order:
1. Patients (`Users`)
2. Appointments (`CalendarDays`)
3. Queue Board (`LayoutDashboard`)
4. Consultation (`Stethoscope`)
5. Dispensary (`Pill`)
6. Billings (`Receipt`)
7. Inventory (`PackageSearch`)
8. Panel Claims (`FileText`)
9. Receivables (`Briefcase`)
10. Procurement (`ShoppingCart`)
11. Voided Records (`Trash2`, `specialAdminOnly`)
12. Insight (`LineChart`, `adminOnly`)
13. Settings (`Settings`)

Update the `ClinicNavItem.icon` type fallback (currently `typeof ListOrdered`) to `LucideIcon` from `lucide-react` so removing `ListOrdered` doesn't break typing.

---

### Task 2 — Queue Board "Full Active Journey" view

**Note:** the DB enum is `sent_to_dispensary` (the spec's `ready_for_dispensing` doesn't exist). We'll treat `sent_to_dispensary` + `dispensing_payment` as the dispensary statuses.

**File:** `src/types/clinic.ts`

The board already keeps registered / ready_for_doctor / with_doctor / dispensary / on_hold visible (the hook only excludes `completed` and `cancelled`). The reported issue is the `with_doctor` column being too narrow / patients seeming to disappear. Action: keep the existing column structure but make the active-journey explicit by ensuring `QUEUE_COLUMNS` includes a single-row view that always shows `with_doctor` and dispensary states side-by-side. No data fix needed — the hook already returns them.

**File:** `src/pages/clinic/QueueBoard.tsx`

Add a defensive client-side filter so only these statuses render on the board, regardless of any future hook change:

```ts
const ACTIVE = ['registered','ready_for_doctor','with_doctor','sent_to_dispensary','dispensing_payment','on_hold'] as const;
const visibleEntries = entries.filter(e => ACTIVE.includes(e.clinic_status as any));
```

Use `visibleEntries` when grouping into `QUEUE_COLUMNS` and computing `totalActive`. This guarantees patients remain on the board through their entire active journey.

---

### Task 3 — Dispensary calling mechanism

**3a. Migration** — `supabase/migrations/<ts>_dispensary_room.sql`

Insert (idempotent) a Dispensary room:

```sql
insert into public.rooms (label, status)
select 'Farmasi', 'active'
where not exists (
  select 1 from public.rooms where label ilike 'farmasi' or label ilike 'dispensary%'
);
```

**3b. Dispensary UI** — `src/pages/clinic/Dispensary.tsx`

- Import `Speaker` icon, `RoomPickerDialog`, and `useCallPatient` from `@/hooks/clinic/useQueueEntries`.
- Add local state `callTarget: QueueEntryWithJoins | null`.
- For rows with `clinic_status === 'sent_to_dispensary'`, add a "Call Patient" button (Speaker icon, primary blue) next to the existing Open button. Clicking it sets `callTarget` (opens the picker).
- Render `<RoomPickerDialog open={!!callTarget} onOpenChange={() => setCallTarget(null)} patientLabel={callTarget?.patients?.name} onConfirm={(roomId) => useCallPatient.mutate(...)} />`.
- The existing `useCallPatient` mutation sets `called_at`, `called_by_doctor_id`, and `assigned_room_id`, but flips status to `with_doctor`. We need a **dispensary-flavored variant** that does NOT change `clinic_status` (it must stay `sent_to_dispensary` so the row remains on the dispensary board). Options:

**Add `useCallToDispensary` hook** in `src/hooks/clinic/useQueueEntries.ts`:

```ts
export function useCallToDispensary() {
  // updates queue_entries: called_at = now(), assigned_room_id = roomId
  // does NOT touch clinic_status
}
```

Use that from Dispensary.tsx so the realtime UPDATE event still fires (TV listens on `called_at` change).

**3c. TV Logic** — `src/pages/tv/QueueTV.tsx`

The TV trigger currently fires only when `clinic_status` becomes `with_doctor`. Update it to fire when **`called_at` changes** for any active status (covers both doctor calls AND dispensary calls). Concretely:

```ts
const calledTsChanged = next.called_at && next.called_at !== prev.called_at;
const isActiveCall = ['with_doctor','sent_to_dispensary','dispensing_payment'].includes(next.clinic_status);
if (!(calledTsChanged && isActiveCall)) return;
```

The Malay TTS already announces `"Nombor giliran, X, sila ke, [Room Name]"` using the room label — so "Farmasi" / "Dispensary Counter" naturally flows. No template change required.

---

### Task 4 — TV YouTube player (autoplay with sound)

**File:** `src/pages/tv/QueueTV.tsx`

- Drop `&mute=1` from the iframe `src`. New URL: `https://www.youtube.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&rel=0`.
- Keep `allow="autoplay; encrypted-media"` (already present).
- Iframe is keyed only by `ytId` and lives directly inside the always-mounted left pane — no blur/visibility unmount logic exists, confirmed. Leave as-is so the player persists.

The "Mulakan Paparan TV" gate already captures a user gesture before mounting the iframe, satisfying the browser autoplay-with-sound policy.

---

### Files touched

- `src/components/clinic/ClinicLayout.tsx`
- `src/pages/clinic/QueueBoard.tsx`
- `src/pages/clinic/Dispensary.tsx`
- `src/hooks/clinic/useQueueEntries.ts` (new `useCallToDispensary`)
- `src/pages/tv/QueueTV.tsx`
- `supabase/migrations/<ts>_dispensary_room.sql` (new)
