Cause found: the Daily Reports summary reads doctor AM/PM shifts only from `DOC_S1`/`DOC_S2`, but the saved doctor roster for today stores Ahmed under legacy keys `shift1` and `shift2`. Because `shift1` is an object for doctor rosters and an array for support rosters, the current summary logic misses the doctor AM row.

Plan:
1. Update `DailyReportsSummary.tsx` to normalize roster shift keys before building AM/PM entries:
   - Support both `shift1`/`shift2` and `S1`/`S2` for support staff.
   - Support both `shift1`/`shift2` and `DOC_S1`/`DOC_S2` for doctors.
2. Fix selfie status selection so PM rows check `evening_selfie_url` and AM rows check `briefing_selfie_url`.
3. Apply the same normalization to `DailyTaskReview.tsx` so the full Daily Task Review matches the dashboard summary.
4. Verify with the current May 2026 roster data that AM shift rows appear for both support and doctor rosters.