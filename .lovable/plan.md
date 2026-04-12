

## Refactor Roster Generator to Follow Staff Roster Criteria Framework

### Summary

Rewrite the roster generation logic in `Roster.tsx` and update shift definitions in `rosterUtils.ts` to match the new criteria framework. Key changes: new shift times, hybrid staff back in regular pool, structured warning system, and strict rule priority enforcement.

### Changes

**1. Update shift times** (`src/lib/rosterUtils.ts` + `src/pages/staff/admin/Roster.tsx`)

| Shift | Current | New |
|-------|---------|-----|
| Shift 1 (AM) | 8am–2pm (6h) or 8am–4pm (8h, display only) | **8:00 AM – 4:00 PM = 8 hours** |
| Shift 2 (PM) | 2pm–8pm (6h) or 4pm–12am (display only) | **4:00 PM – 12:00 AM = 8 hours** |
| Hybrid | 8am–2pm (6h) | **8:00 AM – 1:00 PM = 5 hours** |

- Update `SHIFT_HOURS` (already 8, correct), `HYBRID_HOURS` from 6 to 5
- Update `SHIFT_TIMES` in `rosterUtils.ts`: S1 end to `16:00`, S2 start to `16:00` end to `00:00`, Hybrid end to `13:00`
- Update all display labels in both files

**2. Hybrid staff back in regular shift pool** (`Roster.tsx`)

Currently `pickStaff()` filters out hybrid staff with `!isHybrid(s.id)`. Remove this filter so hybrid-designated staff are eligible for Shift 1/2 auto-assignment. The hybrid row remains manual-only (no change there).

**3. Rewrite `generateRoster()` with strict priority order** (`Roster.tsx`)

Restructure the generator to follow this priority:

1. **Permanent off days** — absolute hard block, never bypassed
2. **Minimum staffing** — Shift 1: min 1, Shift 2: min 2 (new defaults, replace current equal `staffPerShift` for both)
3. **Max consecutive days** — 6-day limit; may breach only when all others unavailable AND slot would be understaffed AND breach is recorded as exception warning
4. **Manual hybrid** — preserve existing hybrid assignments (already done)
5. **Staff-per-shift config** — use configured number but apply min-staffing floor
6. **OT threshold** — soft filter, relax if needed
7. **Fairness** — weighted pick among eligible

The `pickStaff()` function changes:
- Accept separate min counts per shift (shift1: 1, shift2: 2 default)
- Eligibility filter order: off day → already assigned → weekday S2 restriction → consecutive days (with exception logic) → OT threshold (soft)
- When consecutive-day breach happens, add a compliance warning

**4. Add separate min staffing per shift** (`Roster.tsx`)

Replace single `staffPerShift` state with `staffPerShift1` (default 1) and `staffPerShift2` (default 2). Update UI to show two separate selectors. Keep the auto-adjust logic for ≤4 staff.

**5. Structured warning system** (`Roster.tsx`)

Replace flat `warnings` string array with categorized warnings:

```typescript
interface RosterWarning {
  type: 'coverage' | 'compliance' | 'info';
  message: string;
}
```

- **Coverage**: empty slot, shift below minimum
- **Compliance**: exceeded 6 consecutive days (exception), assigned despite restriction, OT exceeded
- **Info**: partial week below threshold, manual hybrid affecting balance

Display warnings grouped by type with color-coded badges (red for coverage, orange for compliance, blue for info).

**6. Enhanced summary table** (`Roster.tsx`)

Add columns: total Shift 1 count, total Shift 2 count, total working days. Currently only shows total shifts + hybrid shifts + total hours + OT status.

**7. Update balancing passes** (`Roster.tsx`)

- Top-up pass: must respect off days (already does), must also respect consecutive-day limit
- Global balancing pass: must respect off days (already does), add consecutive-day check before swapping

### Files Changed

- `src/pages/staff/admin/Roster.tsx` — main refactor
- `src/lib/rosterUtils.ts` — shift time definitions

### No database changes needed

