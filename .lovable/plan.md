

## Separate Roster into Doctor vs Support Staff

### What changes
Split the roster page into two independent rosters using tabs:
1. **Doctor Roster** — only staff with position "Doctor"
2. **Support Staff Roster** — only staff with positions "Clinic Assistant", "Staff Nurse", "Medical Assistant"

Each tab has its own staff list, rules, constraints, generation, and summary — completely independent. Managers are excluded from both rosters (they don't do shifts).

### Implementation — `src/pages/staff/admin/Roster.tsx`

1. **Add Tabs** at the top of the page using `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from the existing UI components.

2. **Filter staff by position** on load:
   - `doctorStaff` = profiles where `position === 'Doctor'`
   - `supportStaff` = profiles where position is `'Clinic Assistant'`, `'Staff Nurse'`, or `'Medical Assistant'`

3. **Duplicate state per roster type**: Each tab maintains its own independent state (staff list, rules, constraints, roster data, warnings, staffPerShift). Extract the current roster logic into a reusable `RosterPanel` component that accepts a filtered staff list and a label (e.g. "Doctor" or "Support Staff").

4. **RosterPanel component** (extracted inline or as a sub-component):
   - Receives `initialStaff`, `title`, `rosterType` props
   - Contains all existing logic: staff list management, rules checkboxes, constraint setup, generator, roster table, summary, export/CSV/print
   - Staff list is seeded from filtered profiles, not the full list

5. **CSV export** includes roster type in filename (e.g. `roster-doctor-2026-03-30.csv`, `roster-support-2026-03-30.csv`)

### File changes
- 1 file edit: `src/pages/staff/admin/Roster.tsx` — refactor into tabbed layout with `RosterPanel` sub-component

### No database or routing changes needed

