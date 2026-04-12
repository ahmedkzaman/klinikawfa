

## Fix: Separate AM/PM Selfie Tracking for Multi-Shift Doctors

### Problem

The `daily_reports` table only has one `briefing_selfie_url` column per user per date. When Ahmed is assigned to both AM and PM shifts, the admin daily task review shows the same selfie checkmark on both rows. He only uploaded the PM evening selfie, but the AM row also shows green.

### Root Cause

1. **Database**: `daily_reports` has no shift distinction — one row per user per date
2. **Admin view** (`DailyTaskReview.tsx`): Creates two entries for the same doctor (AM + PM) but both reference the same report via `userId-date` key
3. **Staff upload** (`DailyReportingCard.tsx`): Uploads to `briefing_selfie_url` regardless of which shift is active

### Fix

**1. Database migration** — Add an `evening_selfie_url` column to `daily_reports`:
```sql
ALTER TABLE daily_reports ADD COLUMN evening_selfie_url text;
```

This keeps the existing `briefing_selfie_url` for AM (morning briefing) and adds `evening_selfie_url` for PM (evening passover).

**2. `DailyReportingCard.tsx`** — When the detected shift is PM, upload to `evening_selfie_url` instead of `briefing_selfie_url`. Display the correct field based on current shift. The label already says "Evening Passover Selfie" for PM — now it maps to the correct column.

**3. `DailyTaskReview.tsx`** — In `buildDayEntries` and the rendering logic:
- AM entries check `briefing_selfie_url`
- PM entries check `evening_selfie_url`
- Update the `Check` component calls to reference the shift-appropriate URL
- Fetch the new `evening_selfie_url` column in the query

### Files Changed

- **Database migration**: Add `evening_selfie_url` column
- `src/components/staff/DailyReportingCard.tsx` — use `evening_selfie_url` for PM shift uploads/display
- `src/pages/staff/admin/DailyTaskReview.tsx` — show correct selfie column per shift row

