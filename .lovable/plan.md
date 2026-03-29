

## Add Read-Only Roster Views for Staff + Admin-Only Editing

### What changes

1. **Two new nav items** in the Staff section of the sidebar: "Dr Roster" and "Staff Roster" — visible to all staff/admin users
2. **Two new read-only pages** (`/staff/dr-roster` and `/staff/staff-roster`) that load saved rosters from the database and display them without editing controls
3. **Admin-only editing** on the existing `/staff/admin/roster` page remains as-is (already behind admin nav)

### Implementation

#### 1. New pages: `src/pages/staff/DrRosterView.tsx` and `src/pages/staff/StaffRosterView.tsx`

Each page will:
- Fetch saved roster from `saved_rosters` table filtered by `roster_type` ('doctor' or 'support') and selected month/year
- Display the roster table in read-only mode (no Select dropdowns, no generate/edit/save buttons)
- Include month/year navigation to browse different months
- Show the summary section (hours, fairness metrics) as read-only
- Show a message if no roster has been saved for that month yet

#### 2. Navigation update: `src/components/staff/StaffLayout.tsx`

Add two items to the `staffNavItems` array:
- `{ href: '/staff/dr-roster', label: 'Dr Roster', icon: Stethoscope }`
- `{ href: '/staff/staff-roster', label: 'Staff Roster', icon: Users }`

#### 3. Routes: `src/App.tsx`

Add two routes inside the `/staff` layout:
- `<Route path="dr-roster" element={<DrRosterView />} />`
- `<Route path="staff-roster" element={<StaffRosterView />} />`

#### 4. Admin roster page unchanged

The existing `/staff/admin/roster` route (with full editing) stays admin-only since it's already within the admin nav section.

### Technical details

- The read-only views reuse the same table/summary rendering logic but strip out all interactive elements (dropdowns, buttons, staff management)
- Data comes from the existing `saved_rosters` table which already has RLS allowing all staff/admin to SELECT
- Doctor view renders 3 shift rows (S1, S2, S3) + off row; Staff view renders 2 shift rows (S1, S2) + off row
- No database changes needed

### Files
- Create: `src/pages/staff/DrRosterView.tsx`
- Create: `src/pages/staff/StaffRosterView.tsx`
- Edit: `src/components/staff/StaffLayout.tsx` (add nav items)
- Edit: `src/App.tsx` (add routes)

