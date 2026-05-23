## Goal
On the Billings page, collapse multiple unpaid visits by the same patient into a single accumulated row in the **Outstanding Panel** and **Outstanding Self-Pay** tabs. The **Paid** tab and method totals stay row-by-row.

## Scope
Single file: `src/pages/clinic/Billings.tsx`. No hook, no schema, no data-fetch changes.

## Changes

### 1. Expose `patient_id` on entries
- Add `patientId: string` to the `LedgerEntry` interface.
- Populate it in the existing `entries` reducer from `qe.patient_id` (already returned by `usePaymentsLedger`).

### 2. New `groupedOutstanding` memo
Add a memo that runs after `entries`:

```ts
type GroupedEntry = LedgerEntry & {
  accumulatedOutstanding: number;
  accumulatedPaid: number;
  accumulatedSubtotal: number;
  visitCount: number;
  groupedQueueIds: string[];
};

const groupOutstandingByPatient = (rows: LedgerEntry[]): GroupedEntry[] => {
  const map = new Map<string, GroupedEntry>();
  // Iterate newest-first so the "representative" row is the most recent visit
  const sorted = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const e of sorted) {
    const key = e.patientId;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        ...e,
        accumulatedOutstanding: e.outstanding,
        accumulatedPaid: e.paid,
        accumulatedSubtotal: e.subtotal,
        visitCount: 1,
        groupedQueueIds: [e.queueEntryId],
      });
    } else {
      g.accumulatedOutstanding += e.outstanding;
      g.accumulatedPaid += e.paid;
      g.accumulatedSubtotal += e.subtotal;
      g.visitCount += 1;
      g.groupedQueueIds.push(e.queueEntryId);
    }
  }
  return Array.from(map.values());
};
```

### 3. Use grouped data in `filtered` and `counts`
- `paid` tab: unchanged (raw `entries`).
- `panel` tab: apply panel/insurance + outstanding filter to raw entries first, then `groupOutstandingByPatient(...)`.
- `self_pay` tab: same idea with self_pay filter.
- `counts.panel` / `counts.self_pay` reflect grouped lengths (number of distinct patients), `counts.paid` unchanged.

### 4. Render
For Outstanding tabs, the row map iterates the grouped list and shows:
- **Patient** cell: name + `{visitCount > 1 && <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1.5 h-5">{visitCount} Visits</Badge>}`.
- **Subtotal / Paid / Outstanding**: use `accumulatedSubtotal`, `accumulatedPaid`, `accumulatedOutstanding`.
- **Queue / Date / Method**: keep the representative (most recent) visit's values; when `visitCount > 1`, append a faint "+N earlier" hint under the date.
- **Print** button hidden for grouped rows with `visitCount > 1` (no single payment id to print); **Open** still links to the most recent `queueEntryId`.

Paid tab keeps the existing row template untouched. Implementation cleanly branches on `activeTab === 'paid'` for the map.

### 5. Out of scope
- `usePaymentsLedger`, `consultation_items` aggregation hook.
- Daily method totals card grid.
- Receipt dialog, panel claims tables outside Billings.
- Schema, migrations, RLS.

## What to expect
- Outstanding Panel / Self-Pay collapse to one row per patient with a `N Visits` badge and an accumulated balance.
- Paid tab and shift report numbers unchanged.
