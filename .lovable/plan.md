

## Fix: Dashboard Roster Loading Stuck on "Loading roster..."

### Root Cause
The roster data has **inconsistent formats** between doctor and support rosters:
- **Doctor roster**: Each shift is a **single object** `{staffId, staffName}` (not an array)
- **Support roster**: Each shift is an **array** `[{staffId, staffName}, ...]`

The dashboard code (`fetchTodayDuty`) always casts shifts as `RosterCell[]` (arrays). When it encounters the doctor roster's single-object format, the `.forEach()` call fails silently, and no data is rendered.

### Fix: `src/pages/staff/admin/Dashboard.tsx`

In the shift-parsing loop (around line 77), normalize the cell data to always be an array before iterating:

```ts
// Change from:
const cells = (todayData as any)[shiftKey] as RosterCell[] | undefined;

// To:
const rawCells = (todayData as any)[shiftKey];
const cells: RosterCell[] | undefined = rawCells
  ? Array.isArray(rawCells) ? rawCells : [rawCells]
  : undefined;
```

This handles both formats — if it's already an array, use it directly; if it's a single object, wrap it in an array.

### Single file change
- **Edit**: `src/pages/staff/admin/Dashboard.tsx` — line 77 only

