# Sprint 5 Patch — Roster Utils Property Fix

## Problem
`staff_list` entries store the UUID under `id`, but the early-exit checks in `src/lib/rosterUtils.ts` look for `s.staffId === userId`. The bouncer rejects everyone, so `getUserShiftsForMonth` returns empty and `DailyReportingCard` stays blank for Siti, Ahmed, and all others.

## Change
In `src/lib/rosterUtils.ts`, update every `staff_list` pre-check to accept both shapes:

```ts
const isInRoster = Array.isArray(roster.staff_list)
  && roster.staff_list.some((s: any) => s.id === userId || s.staffId === userId);
```

Apply identically in:
- `getUserShiftsForMonth`
- `getUserShiftForDate`
- `getAllShiftsForMonth` (only if it contains the same pre-check)

No other logic, no other files, no DB changes.

## Verification
- Reload `/staff/dashboard` as Siti → ☀️ AM Shift card.
- Console `[DailyReportingCard] detection` shows `resolvedShift: 'AM'`, `resolvedType: 'staff'`.
- Ahmed remains on 🩺 Doctor AM Shift.
