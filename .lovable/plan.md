## Extend Appointments calendar to 11 PM

The Appointments calendar is a **custom grid** (not FullCalendar) in `src/pages/clinic/Appointments.tsx`. The visible time range is controlled by two constants at the top of the file:

```ts
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;  // currently 8 PM
```

### Change

Update `DAY_END_HOUR` from `20` → `23` so the grid renders rows up to 11 PM. `TOTAL_SLOTS` is derived from these constants, so the rest of the grid (slot indexing, hour marks, click-to-create time mapping) updates automatically — no other edits needed.

### Notes / stress test

- **Booking logic**: backend has no time-of-day restriction; appointments at 22:30 will save fine.
- **Default new-appointment time** (line ~178) is `09:00` — still valid, no change needed.
- **Vertical height**: each slot is a fixed-height row, so the grid will get ~30% taller. The page already scrolls, so no layout breakage.
- No business-hours overlay exists to update.

### File touched

- `src/pages/clinic/Appointments.tsx` — single constant change.