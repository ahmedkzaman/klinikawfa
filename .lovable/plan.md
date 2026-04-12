

## Include Hybrid Staff and Doctors in Daily Reporting + Real-time Sync

### Summary

Three changes: (1) hybrid staff assigned in the support roster should see Shift 1 daily tasks, (2) non-locum doctors from the doctor roster should see selfie tasks for their assigned shifts, and (3) add real-time subscriptions so roster/report changes reflect immediately.

### Current State

- **DailyReportingCard** (staff-facing): Only checks support roster `shift1`/`shift2` arrays. Misses hybrid assignments and doctor roster entirely.
- **DailyReportsSummary** (admin dashboard widget): Same — only support roster shifts.
- **DailyTaskReview** (admin full review page): Same — only support roster shifts.
- **Doctor roster structure**: `shift1` and `shift2` are single objects `{staffId, staffName}` (not arrays), `shift3` is locum.
- **Support roster hybrid structure**: `hybrid?: {staffId, staffName}[]` — currently ignored by all daily reporting components.

### Changes

**1. DailyReportingCard.tsx — Staff-facing card**

- Fetch both `support` and `doctor` rosters in parallel
- Check support roster: if user is in `hybrid` array → treat as AM shift (selfie only, no stock/blast tasks since hybrid = different role)
- Check doctor roster: if user is in `shift1` or `shift2` (single objects, not arrays) AND user is not in `shift3` (locum) → show selfie task only for their shift
- Doctors get **selfie task only** (no stock photos, no WhatsApp blasts)
- Hybrid staff get **all Shift 1 tasks** (selfie, stock photos, WhatsApp blasts) — they work AM shift (8am–1pm)
- Add a `userType` state: `'staff'` | `'hybrid'` | `'doctor'` to control which tasks are shown
- Upload windows for hybrid: same as AM shift (selfie 8–9am, stock 8–10am)
- Upload windows for doctors: shift-dependent (AM: 8–9am, PM: 4–5pm based on new shift times)
- Add Supabase realtime subscription on `saved_rosters` and `daily_reports` tables to auto-refresh on changes

**2. DailyReportsSummary.tsx — Admin dashboard widget**

- Fetch doctor roster alongside support roster
- Include hybrid staff from support roster under AM shift
- Include non-locum doctors under their respective shifts (selfie-only column tracking)
- Add a "Type" indicator (Staff/Hybrid/Doctor) in the table
- Add realtime subscription on `saved_rosters` and `daily_reports` for auto-refresh

**3. DailyTaskReview.tsx — Admin full review page**

- Fetch doctor roster alongside support roster
- Merge hybrid staff into AM entries
- Merge non-locum doctors into their shift entries
- Add "Type" column to distinguish staff/hybrid/doctor
- Doctor rows show selfie status only; stock and blast columns show "N/A"
- Add realtime subscription for auto-refresh

**4. Enable realtime on saved_rosters table** (migration)

- `ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_rosters;`
- `daily_reports` may already need to be added too: `ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_reports;`

### Determining Locum Doctors

The doctor roster `staff_list` includes all doctors. To identify locum:
- Option A: Check if doctor is assigned to `shift3` in the roster (shift3 = locum slot). This is simpler and already available in roster data.
- Option B: Query `staff_payroll_profiles.employment_type = 'locum'`.

Will use **Option A** — if a doctor only ever appears in `shift3`, they are locum and excluded. For `shift1`/`shift2` assignments, the doctor is non-locum by definition.

### Technical Details

**Doctor roster data structure** (single objects, not arrays):
```typescript
{
  "2026-04-12": {
    "shift1": { "staffId": "...", "staffName": "..." },
    "shift2": { "staffId": "...", "staffName": "..." },
    "shift3": { "staffId": "...", "staffName": "Locum" }
  }
}
```

**Realtime subscription pattern:**
```typescript
const channel = supabase
  .channel('roster-reports')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_rosters' }, () => fetchData())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, () => fetchData())
  .subscribe();
```

### Files Changed

- `src/components/staff/DailyReportingCard.tsx` — add hybrid + doctor roster checks, conditional task display, realtime
- `src/components/staff/DailyReportsSummary.tsx` — merge doctor + hybrid data, realtime
- `src/pages/staff/admin/DailyTaskReview.tsx` — merge doctor + hybrid data, type column, realtime
- Migration: enable realtime on `saved_rosters` and `daily_reports`

