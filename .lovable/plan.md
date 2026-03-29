

## Rebuild Doctor Roster with 3-Shift System

### Overview
Replace the current 2-shift doctor roster (shared `RosterPanel`) with a dedicated doctor roster that uses 3 shifts (8am-2pm, 2pm-8pm, 8pm-12am), enforces valid shift combinations, calculates overtime beyond 45h/week, and provides rich summary metrics. The support staff roster remains unchanged.

### Data Model Changes

```typescript
interface DoctorRosterData {
  [dateKey: string]: {
    shift1: RosterCell | null; // 8am-2pm, 6h
    shift2: RosterCell | null; // 2pm-8pm, 6h
    shift3: RosterCell | null; // 8pm-12am, 4h
    manualOverrides: Set<'shift1' | 'shift2' | 'shift3'>;
  };
}
```

**Shift combination rules**: Per doctor per day, only two valid patterns:
- Shift 1 + Shift 2 (same doctor) = 12h daytime block
- Shift 3 only = 4h night block
- A doctor cannot appear in Shift 1 or 2 AND Shift 3 on the same day

### Generator Algorithm

1. **For each day**: assign daytime blocks (S1+S2) and night blocks (S3) separately
2. **Daytime assignment**: pick a doctor using weighted random (weight = `maxMonthHours - currentMonthHours + 1`); assign to both S1 and S2
3. **Night assignment**: from remaining eligible doctors, pick using same weighted logic; assign to S3
4. **Eligibility filters** (in order): not already assigned that day → weekday constraint check → weekly hour cap (48h) → fallback relaxation
5. **Priority within eligible pool**: staff below 45h/week first → lowest monthly hours → weighted random
6. **Top-up pass**: after generation, swap shifts between over/under-assigned doctors to reach 45h minimum per week
7. **Global balance pass**: minimize monthly hour spread via swap iterations

### Weekly Hours & Overtime
- Track hours per doctor per ISO week
- S1+S2 day = 12h; S3 night = 4h
- Regular hours = min(weekHours, 45)
- Overtime = max(weekHours - 45, 0)
- Summary shows both per-week and monthly totals

### Rules Checkboxes
- Max 2 shifts per day (S1+S2 or S3 only)
- Valid shift combinations enforcement
- 45h/week minimum target
- Overtime calculation (>45h)
- Fair distribution

### Roster Table Display
- 3 rows: Shift 1, Shift 2, Shift 3 + Off row + Week header row
- When S1 and S2 have same doctor, highlight cells with a shared background color
- Each cell is a `<Select>` dropdown for manual editing
- Manually changed cells get a colored border/highlight
- Manual changes validate against rules; show toast warning for invalid combos but allow override

### Manual Editing Enhancements
- Track `manualOverrides` per day per shift
- "Reset Manual Changes" button restores original generated values
- "Auto-fill Empty Shifts" button fills any null cells
- Instant recalculation of all metrics on any edit

### Summary Table Columns
Per doctor: Name | Regular Hours (week breakdown) | Overtime Hours | Total Monthly Hours | Daytime Blocks | Night Shifts | Diff from Avg

Footer metrics: Average hours | Highest | Lowest | Fairness gap | Fairness score badge | Total overtime by doctor

### Action Buttons
Generate | Generate Again | Clear | Reset Manual Changes | Auto-fill Empty | Export CSV | Print

### Implementation

**File**: `src/pages/staff/admin/Roster.tsx`

1. Create a new `DoctorRosterPanel` component (separate from existing `RosterPanel` which continues to serve support staff)
2. The `<TabsContent value="doctor">` renders `DoctorRosterPanel` instead of `RosterPanel`
3. Support staff tab remains unchanged with existing `RosterPanel`

**Key sections of `DoctorRosterPanel`**:
- Staff list management (reuse pattern from existing)
- Rules card with 5 checkboxes
- Month picker (reuse pattern)
- `generateDoctorRoster()` function with the 3-shift algorithm
- Roster table with 3 shift rows + off row + week row
- Summary table with overtime breakdown
- Fairness metrics display
- CSV export updated for 3 shifts + overtime data

### No database or routing changes needed
