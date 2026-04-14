

## Plan: Allow Admin to Remove Staff from Shift 1 Cells

### Problem
The Shift 1 dropdown only lists staff members. There is no way to unassign a staff member from a Shift 1 slot (set it to empty/none).

### Fix

**File: `src/pages/staff/admin/Roster.tsx`**

1. **Update `updateCell` function** (line 724-738) — Handle a special `"__none__"` value that removes the cell from the shift array instead of replacing it with a staff member.

2. **Add "None / Remove" option to Shift 1 Select dropdown** (line 1135-1138) — Add a `<SelectItem value="__none__">— None —</SelectItem>` before the staff list, only for `shift1`.

No changes to Shift 2, Hybrid, or any other settings.

