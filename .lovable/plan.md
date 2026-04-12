## Fix: Extend Selfie Upload Window for Staff

### Issues Identified

1. **"Why couldn't I click on the selfie?"** — On the staff dashboard, the Upload button is **disabled** because the upload time window has passed. There is no way to view a previously uploaded selfie either — the card only shows "Done" badge or the disabled Upload button.
2. **"It's 4:27 PM, I'm on duty, why can't I upload?"** — You are detected as **Doctor AM Shift**. The AM selfie window is hardcoded to **8:00–9:00 AM only**. By 4:27 PM it's long closed. The upload windows are too restrictive:
  - AM Selfie: 8:00–9:00 AM (1 hour only)
  - PM Selfie: 2:00–3:00 PM (1 hour only)

### Proposed Fix

**1. Widen upload windows** — Allow uploads throughout the entire shift duration:

- AM Shift: **8:00 AM – 2:00 PM** (selfie + stock photos)
- PM Shift: **4:00 PM – 5:00 PM** (selfie + stock photos)
- Doctor AM: **8:00 AM – 4:00 PM**
- Doctor PM: **4:00 PM – 5:00 PM**

**2. Allow viewing uploaded selfie** — When a selfie is already uploaded, make the "Done" badge or a thumbnail clickable to preview the image in a dialog (same pattern as admin daily task review).

### Files Changed

- `src/components/staff/DailyReportingCard.tsx` — widen `isSelfieWindow` / `isStockWindow` time ranges, add image preview dialog for uploaded photos