

## Fix: Show Deadline in Calendar Task Dialog for All Users

### Problem
The deadline field in `TaskDialog.tsx` (line 148-158) is wrapped inside `{isAdmin && (...)}`, making it invisible to non-admin staff. Staff cannot see when a task is due.

### Fix: `src/components/staff/calendar/TaskDialog.tsx`

**Move the Deadline field outside the admin-only block** and make it visible to everyone:
- For **admins**: deadline remains editable (date picker)
- For **non-admin staff**: deadline is shown as **read-only text** (e.g., "Due: Mar 30, 2026") — no picker, just a label

**Specifically:**
1. Extract the deadline section from the `{isAdmin && (...)}` block (lines 148-158)
2. Place it after the End Date row (after line 147), available to all users
3. If `canEdit` is true (admin or task owner), show the date picker as before
4. If `canEdit` is false, show the deadline as plain text
5. Keep the "Assign To" field admin-only

### Single file change
- **Edit**: `src/components/staff/calendar/TaskDialog.tsx`

