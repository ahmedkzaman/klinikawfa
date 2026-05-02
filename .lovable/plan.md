## Why AM (Shift 1) only opens 1 slot for support staff

In `src/pages/staff/admin/Roster.tsx` (line 366), the generator forces the AM slot count to **1** whenever you have **4 or fewer support staff**, no matter what you pick in the "Shift 1 staff" rule:

```ts
const effectiveS1Count = staffList.length <= 4 ? 1 : staffPerShift1;
const effectiveS2Count = staffList.length <= 4 ? 2 : staffPerShift2;
```

A small "(Auto-adjusted: S1=1, S2=2 due to ≤4 staff)" hint is shown next to the selectors, but it silently overrides the admin's choice — so picking "2" for Shift 1 has no effect when the team is small. That's why only one staff is being assigned to AM.

## Fix

Respect the admin's chosen value. The hard floors (`minS1=1`, `minS2=2`) and the per-day eligibility checks already prevent over-assignment when too few people are available — the auto-cap is therefore unnecessary and misleading.

**Change 1 — Roster.tsx generator (around line 365–370):**

```ts
// Use admin-selected counts directly; daily eligibility checks will leave
// slots empty if not enough staff are available that day.
const effectiveS1Count = staffPerShift1;
const effectiveS2Count = staffPerShift2;
const minS1 = 1;
const minS2 = Math.min(2, staffPerShift2);  // don't enforce 2 if admin picked 1
```

**Change 2 — Hint copy (around line 1008–1010):**

Replace the "Auto-adjusted" hint with a softer note that just warns about head-count, e.g. _"Tip: with ≤4 staff, days may be under-filled if people overlap on rest/leave."_ No more silent override.

That's the whole change — one file, ~5 lines. After this, selecting "Shift 1 staff: 2" in the rules will actually open two AM slots per day for support staff.
