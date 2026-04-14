

## Fix: "None" Should Clear the Slot, Not Remove It

### Problem
Currently, selecting "— None —" on a Shift 1 cell uses `splice` to remove the slot entirely from the array. This means the admin loses the slot and can't reassign someone to it without re-generating.

### Fix
Instead of removing the array entry, replace it with an empty placeholder `{ staffId: '', staffName: '' }`. This keeps the slot visible and the dropdown functional, so the admin can later select a different staff member.

**File: `src/pages/staff/admin/Roster.tsx`** — Change the `__none__` handler (lines 726–737):

```typescript
if (newStaffId === '__none__') {
  setRoster(prev => {
    if (!prev) return prev;
    const updated = { ...prev };
    const dayData = { ...updated[dateKey] };
    const cells = [...dayData[shift]];
    cells[index] = { staffId: '', staffName: '' };
    dayData[shift] = cells;
    updated[dateKey] = dayData;
    return updated;
  });
  return;
}
```

This replaces `splice(index, 1)` with setting the cell to an empty object, preserving the slot.

### Files Changed
- `src/pages/staff/admin/Roster.tsx` — one line change in `updateCell`

