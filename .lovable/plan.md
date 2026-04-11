

## Fix: Roster Generator Ignoring Staff Off Days During Balancing Pass

### Problem
The roster generator has **two passes**:
1. **Initial assignment** (lines 272–408) — correctly checks `isOffDay()` and skips staff on their permanent off days.
2. **Top-up/balancing pass** (lines 439–491) — tries to equalize hours across the week by swapping staff into shifts. This pass **does not check permanent off days**, so it can assign staff to work on their designated day off, undoing the first pass's work.

### Fix

**Edit: `src/pages/staff/admin/Roster.tsx`**

1. Move the `isOffDay` helper function **outside** the main generation loop so it's accessible to both passes (currently it's scoped inside the `for (const day of sortedDays)` block).

2. In the top-up pass (around line 454), add an `isOffDay` check before considering a staff member for swap on a given day:
   ```typescript
   // Before swapping 'under' into a shift on 'day':
   const dayOfWeek = getDay(day);
   if (rosterSettings[under.id]?.permanentOffDays?.includes(dayOfWeek)) continue;
   ```

3. Also check that the **donor** being removed isn't the only option (no change needed — the donor check is fine, the issue is only with the replacement staff being placed on their off day).

This is a one-file, ~5-line fix in `Roster.tsx`.

