
Fix the support roster generator so permanent off days become a hard rule and can never be bypassed.

- Problem found
  - Siti’s Sunday off setting is being saved correctly.
  - The actual bug is in `src/pages/staff/admin/Roster.tsx`: when the generator runs out of legal candidates, its fallback logic still assigns someone anyway.
  - A later balancing pass can also reshuffle staff onto blocked days.
  - That is why Siti can still appear in Shift 2 on Sunday.

- What I will change
  1. Refactor the support roster generator to use one shared assignment check for every pass.
     - These must always stay blocked:
       - permanent off day
       - already assigned that day
       - hybrid staff in normal shifts
       - over 6 consecutive working days
       - weekday shift restriction
  2. Remove the unsafe fallback in `pickStaff()`.
     - Right now it can ignore off days just to fill the slot.
     - Instead, if no legal staff exist, the slot stays unfilled and the generator adds a warning.
  3. Apply the same hard-rule check to the top-up and global balancing passes.
     - This stops later balancing from undoing off-day/rest rules.
  4. Clean up the duplicated off-day helper so the same logic is used everywhere.
  5. Add clearer warnings for impossible coverage days.
     - Example: not enough eligible non-hybrid staff to fill Shift 2 without breaking rules.

- Expected result
  - If Siti is marked off on Sunday, she will never be auto-assigned on Sunday.
  - If coverage is impossible, the roster will show a warning instead of breaking the off-day rule.
  - Balancing will no longer put staff back onto blocked days.

- Scope
  - No database changes needed.
  - Main file: `src/pages/staff/admin/Roster.tsx`
  - Optional follow-up: apply the same hard-rule protection to `src/components/staff/roster/DoctorRosterPanel.tsx` because it has a similar rebalance pattern.
