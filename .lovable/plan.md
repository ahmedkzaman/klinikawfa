# Sprint Patch: Decouple Shift State (Option C)

Decouple S1/S2/S3 in the doctor roster admin so admins have granular control. Auto-generator still prefers 12-hour blocks but writes each slot independently.

## Scope
Single file: `src/components/staff/roster/DoctorRosterPanel.tsx`. No DB schema or save-format changes — the storage already holds shift1/2/3 as independent cells, so the wire format stays compatible.

## Changes

### 1. `updateCell` — remove all mirroring (lines ~660–745)
- When `shift === 'shift1'`, set only `dd.shift1`. Do not touch `dd.shift2`.
- When `shift === 'shift2'`, set only `dd.shift2`. Do not touch `dd.shift1`.
- "None" / `__none__` clear path: only clear the targeted slot.
- `manualOverrides` set: only add the targeted shift key (no S1↔S2 propagation).
- Drop the daytime-vs-night `ruleValidCombos` warning toasts in this function (kept-warning behavior is no longer meaningful for combos that are now allowed).

### 2. Remove the `ruleValidCombos` rule entirely
- Delete `useState(true)` for `ruleValidCombos` (line 90).
- Remove the checkbox UI block at lines ~913–919 ("Valid shift combinations only").
- Remove every remaining `ruleValidCombos` reference (search confirms they live only inside `updateCell` after the UI removal).

### 3. Auto-generator — explicit independent assignments (lines ~458–462)
Replace the object literal that assigns `daytimeDoc` to both slots with two explicit, independent assignments so the side-effect-style mirroring is gone:

```text
newRoster[dateKey] = { shift1: null, shift2: null, shift3: null };
if (daytimeDoc) {
  newRoster[dateKey].shift1 = daytimeDoc;
  newRoster[dateKey].shift2 = daytimeDoc; // generator preference: pair daytime block
}
if (nightDoc) {
  newRoster[dateKey].shift3 = nightDoc;
}
```

Behaviorally identical for the auto-run, but the intent ("pairing is a generator preference, not a state invariant") is now explicit. The night-shift swap pass (lines ~496+) already operates on slots independently and needs no change.

### 4. Sanity sweep
After the edits, grep the file for `ruleValidCombos` and any remaining `dd.shift2 = cell` / `dd.shift1 = cell` cross-writes and remove leftovers. Also verify the "None" branch (lines 664–693) only clears the targeted shift.

## Out of scope
- Support-staff roster (different panel, S1/S2 are already independent there).
- Database schema, save/load format, payroll hour calculations — all unchanged.
- Other rule toggles (`ruleMaxShifts`, `ruleMinHours`, `ruleNoSplitDuty`) — untouched.

## Memory update
Update `mem://features/hr-portal/roster-generator`:
> S1, S2, S3 are functionally independent slots in the doctor roster. The auto-generator *prefers* placing the same doctor in S1+S2 to form a 12-hour daytime block, but admins can manually edit any single slot without affecting the others. There is no UI rule that hard-mirrors S1↔S2.

## Verification
1. Open `/staff/admin/roster`, generate a roster, confirm S1 and S2 still get the same doctor by default.
2. Manually change S2 on any day → S1 must remain untouched.
3. Manually clear S1 (None) → S2 must remain untouched.
4. Confirm the "Valid shift combinations only" checkbox is gone from the Rules panel.
