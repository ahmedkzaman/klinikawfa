

## Roster-Based Attendance + Lateness Color Tiers + Employment Act 1955 Compliance

### Problem
1. Attendance review uses hardcoded `defaultShiftStart = '09:00'` instead of each staff's actual roster shift time
2. Lateness is binary (>15min = late) — needs yellow (1-5 min) and red (≥15 min) color tiers
3. Working hours calculation is a simple punch diff — needs to comply with Akta Buruh 1955

### What Changes

#### 1. Roster-Aware Shift Lookup (shared utility)

**New file: `src/lib/rosterUtils.ts`**

A helper that, given a user ID and date, looks up the `saved_rosters` data to find the staff's scheduled shift start/end time for that day. Returns the shift label and times (e.g., S1: 08:00-14:00, S2: 14:00-20:00). Falls back to `09:00` if no roster found.

Both `AttendanceReview.tsx` (staff) and `admin/AttendanceReview.tsx` will use this to replace the hardcoded `defaultShiftStart`.

#### 2. Punch Page — Show Current Shift Info

**Edit: `src/pages/staff/Punch.tsx`**

- Fetch current user's roster for today from `saved_rosters`
- Display "Your shift today: S1 (8:00am - 2:00pm)" on the punch card
- Validate punch-in is only allowed during or near (±30 min buffer) the assigned shift window

#### 3. Lateness Color Tiers

**Edit: `src/pages/staff/History.tsx`**

In the daily records view, color-code each punch-in row:
- **Green** dot: on time (≤0 min late)
- **Yellow** dot: 1-5 min late
- **Red** dot: ≥15 min late (or no roster match)

Calculate lateness by comparing actual clock-in vs roster scheduled start.

**Edit: `src/pages/staff/AttendanceReview.tsx`** and **`src/pages/staff/admin/AttendanceReview.tsx`**

- Replace `defaultShiftStart` with roster-based shift lookup
- Add lateness severity to detail records: `'on_time' | 'minor_late' | 'late'`
- Color the status badge: green (on time), yellow (1-14 min), red (≥15 min)
- "Expected Clock-In" column now shows actual roster shift start, not hardcoded 09:00

#### 4. Employment Act 1955 (Akta Buruh 1955) Compliant Working Hours

**Edit: `src/lib/rosterUtils.ts`** — add calculation helpers:

Key rules from Akta Buruh 1955:
- **Normal working hours**: Max 8 hours/day, 45 hours/week
- **Overtime**: Any hours beyond 8h/day or 45h/week = OT
- **OT rate**: 1.5x on normal days, 2.0x on rest days, 3.0x on public holidays
- **Rest day**: At least 1 day off per week
- **Break**: If work exceeds 5 consecutive hours, must have 30-min break (deducted from total)

Calculation functions:
```
calculateDailyWorkHours(clockIn, clockOut):
  - Raw hours = clockOut - clockIn
  - Deduct 30-min break if raw > 5h (or 60-min if raw > 8h, depending on shift structure)
  - Normal hours = min(8, adjusted hours)
  - OT hours = max(0, adjusted hours - 8)
  - Return { normalHours, overtimeHours, totalWorked, breakDeducted }
```

**Edit: `src/pages/staff/History.tsx`**

- Update `calculateWorkHours` to use the new compliant calculation
- Show breakdown: "7h 30m (30m break)" instead of just "8h 0m"

**Edit: `src/pages/staff/AttendanceReview.tsx`** and **`src/pages/staff/admin/AttendanceReview.tsx`**

- Add OT hours column to drill-down tables
- Working hours shown are net of mandatory breaks

### Files Summary

**New (1):** `src/lib/rosterUtils.ts` — roster shift lookup + Akta Buruh 1955 calculation helpers

**Edited (4):**
- `src/pages/staff/Punch.tsx` — show shift info, validate punch window
- `src/pages/staff/History.tsx` — lateness colors, compliant work hours
- `src/pages/staff/AttendanceReview.tsx` — roster-based shift, lateness tiers, OT column
- `src/pages/staff/admin/AttendanceReview.tsx` — same as above for admin view

### Akta Buruh 1955 Reference Summary
- Max 8h/day normal work, 45h/week
- Mandatory 30-min break after 5 consecutive hours
- OT = 1.5x (normal day), 2.0x (rest day), 3.0x (public holiday)
- At least 1 rest day per week
- These rules apply to employees earning ≤RM4,000/month (First Schedule)

