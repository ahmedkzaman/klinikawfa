## Sprint 5 Patch — Daily Reporting Unification & Midnight Ticker

Goal: eliminate brittle inline JSON parsing in `DailyReportingCard`, centralize shift detection on `getUserShiftsForMonth`, and prevent stale renders past midnight. Respects the helper's existing 0-indexed-month contract — no double-offset.

### Task 1 — Fix `getUserShiftForDate` (`src/lib/rosterUtils.ts`)

The helper currently builds `dayKey = String(dayOfMonth)`, which fails when rosters are keyed by `yyyy-MM-dd`. Mirror the robust logic already used by `getUserShiftsForMonth`:

- Iterate `Object.entries(rosterData)` instead of indexing by a guessed key.
- For each `dayKey`, accept it if it matches `/^\d{4}-\d{2}-\d{2}$/` and equals `format(date,'yyyy-MM-dd')`, else fall back to padded day-of-month (`String(dayOfMonth).padStart(2,'0')` and unpadded).
- Then run the existing per-shift cell scan unchanged.

### Task 2 — Refactor shift detection (`src/components/staff/DailyReportingCard.tsx`)

Replace the inline support+doctor block (lines ~104–152) with a single call to `getUserShiftsForMonth`. Pass `now.getMonth()` as-is (helper adds `+1` internally).

```ts
const shifts = await getUserShiftsForMonth(user!.id, now.getMonth(), now.getFullYear());
const todayShift = shifts[todayStr];

let shift: 'AM' | 'PM' | null = null;
let detectedType: UserType = 'staff';

if (todayShift) {
  const k = todayShift.shiftKey;
  if (k === 'DOC_S1') { shift = 'AM'; detectedType = 'doctor'; }
  else if (k === 'DOC_S2') { shift = currentHour >= 16 ? 'PM' : 'AM'; detectedType = 'doctor'; }
  else if (k === 'DOC_S3') { shift = 'PM'; detectedType = 'doctor'; }
  else if (k === 'Hybrid') { shift = 'AM'; detectedType = 'hybrid'; }
  else if (k === 'S1') { shift = 'AM'; detectedType = 'staff'; }
  else if (k === 'S2') { shift = 'PM'; detectedType = 'staff'; }
  else if (k === 'S3') { shift = 'PM'; detectedType = 'staff'; }
  else if (k === 'Daytime') { shift = currentHour >= 16 ? 'PM' : 'AM'; detectedType = 'doctor'; }
}

console.debug('[DailyReportingCard] detection', {
  uid: user?.id, todayStr, todayShiftKey: todayShift?.shiftKey ?? null,
  resolvedShift: shift, resolvedType: detectedType,
});
```

Note: `normalizeShiftKey` already canonicalizes `shift1`→`S1`, `hybrid`→`Hybrid`, etc., so only canonical keys are needed in the switch. The two parallel roster fetches (lines 98–99) are dropped; the helper covers both roster types.

### Task 3 — Midnight ticker (`src/components/staff/DailyReportingCard.tsx`)

Add a `useEffect` that polls every 60s and refetches when the wall-clock day rolls over:

```ts
useEffect(() => {
  const id = setInterval(() => {
    const newToday = format(new Date(), 'yyyy-MM-dd');
    if (newToday !== todayStr && user) fetchRosterAndReport();
  }, 60_000);
  return () => clearInterval(id);
}, [user, todayStr]);
```

### Files touched
- `src/lib/rosterUtils.ts` — `getUserShiftForDate` only.
- `src/components/staff/DailyReportingCard.tsx` — import helper, replace detection block, add ticker effect.

No DB migrations, no admin UI changes, no roster-save changes.
