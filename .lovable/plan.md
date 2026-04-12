

## Fix: Doctor Assigned to Multiple Shifts Can't Upload

### Root Cause

Today's doctor roster assigns Ahmed to **both shift1 (AM) and shift2 (PM)**. The code in `DailyReportingCard.tsx` (line 131) finds him in shift1 first and sets `shift = 'AM'`, never checking shift2. After 4pm, the AM upload window (8–16) closes, so the upload button is disabled — even though he's actively on duty for his PM shift.

### Fix

In `DailyReportingCard.tsx`, change the doctor roster detection logic to check **which shift matches the current time**:

1. Collect all shifts the doctor is assigned to (shift1, shift2)
2. Pick the shift whose upload window covers the current hour
3. If currently in PM window and doctor is on shift2, set `shift = 'PM'`
4. If currently in AM window and doctor is on shift1, set `shift = 'AM'`
5. Fallback: if outside all windows but assigned to any shift, pick the nearest/most recent shift (so the card still shows rather than "not on duty")

**Logic change** (lines 120-138):
```typescript
if (todayDoctorRoster) {
  const isLocum = todayDoctorRoster.shift3?.staffId === user!.id;
  if (!isLocum) {
    const onShift1 = todayDoctorRoster.shift1?.staffId === user!.id;
    const onShift2 = todayDoctorRoster.shift2?.staffId === user!.id;
    if (onShift1 || onShift2) {
      detectedType = 'doctor';
      // Pick shift based on current time
      if (onShift2 && currentHour >= 16) {
        shift = 'PM';
      } else if (onShift1) {
        shift = 'AM';
      } else {
        shift = 'PM';
      }
    }
  }
}
```

This ensures:
- Before 4pm → AM shift tasks shown (window 8am–4pm)
- 4pm onwards → PM shift tasks shown (window 4pm–5pm)
- Doctor always sees "on duty" when assigned to any shift

### Files Changed

- `src/components/staff/DailyReportingCard.tsx` — fix multi-shift doctor detection to pick the time-appropriate shift

