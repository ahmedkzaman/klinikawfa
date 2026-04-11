

## Manual Hybrid Staff Assignment in Roster Generator

### Problem
Currently, hybrid staff (Purchaser/Housecall Nurse) are **automatically** assigned to the hybrid row every day they're not on an off day or rest day. The admin wants full manual control over which hybrid staff work and on which specific days.

### Solution

**Edit: `src/pages/staff/admin/Roster.tsx`**

1. **Add a hybrid schedule UI** — Below the existing "Staff Settings (Hybrid & Off Days)" card, add a new section (or inline with the existing settings) where the admin can tick which days each hybrid staff member should work their hybrid shift. This will be a per-staff, per-day-of-week checkbox grid (similar to the off-day grid but for "Hybrid Work Days").

   Alternatively (and simpler): after the roster is generated, make the **Hybrid row editable** — each cell becomes a multi-select or toggle showing which hybrid staff are assigned that day. The generator will leave the hybrid row **empty by default**, and the admin fills it in manually.

   **Recommended approach**: Make the hybrid row fully manual with selectable dropdowns (like Shift 1/Shift 2 already have). The generator will:
   - Still mark hybrid staff so they're excluded from regular shift assignment
   - But **not** auto-populate the hybrid row
   - Admin manually assigns hybrid staff to specific days using dropdowns in the hybrid row cells

2. **Remove auto-assignment in `generateRoster()`** — Delete the block (lines ~320-328) that automatically assigns all hybrid staff to every non-off day. Instead, preserve any existing hybrid assignments from the current roster state (if re-generating) or leave empty.

3. **Make hybrid row cells editable** — Currently hybrid cells just display text. Change them to use a multi-select or per-cell dropdown (similar to shift cells) so admin can pick which hybrid staff work each day. Only hybrid-typed staff appear in the dropdown.

4. **Keep hybrid staff excluded from regular shifts** — The `!isHybrid(s.id)` filter in `pickStaff()` stays, so hybrid staff don't get auto-assigned to Shift 1/2. But they only appear in the hybrid row when the admin manually places them.

5. **Update `updateCell`** — Extend it to support `'hybrid'` as a shift key, and allow adding/removing hybrid staff from a day.

6. **Hours tracking** — When calculating summary hours, hybrid hours still count (6h per assigned day). The summary and fairness metrics remain accurate based on what the admin manually assigned.

### Technical Details
- No database changes needed
- Single file edit: `src/pages/staff/admin/Roster.tsx`
- The hybrid row cells will use a popover or multi-checkbox approach (since multiple hybrid staff can work the same day)
- Off-day and rest-day rules still apply — the UI should visually disable or warn if admin tries to assign a hybrid staff member on their off day

