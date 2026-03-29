

## Add Kanban Board to Staff Dashboard

### Overview
Port the Kanban whiteboard from BioInnoTech to the klinikawfa staff dashboard with enhanced features: task visibility control (admin-only vs all), assignment to one staff or all, and edit tracking.

### Database Changes (1 migration)

Add columns to `staff_tasks`:
```sql
ALTER TABLE staff_tasks ADD COLUMN board_column text NOT NULL DEFAULT 'todo';
ALTER TABLE staff_tasks ADD COLUMN visibility text NOT NULL DEFAULT 'all'; -- 'all' or 'admin_only'
ALTER TABLE staff_tasks ADD COLUMN last_edited_by uuid;
```

Update existing tasks to set `board_column` based on `is_completed`:
```sql
UPDATE staff_tasks SET board_column = 'done' WHERE is_completed = true;
```

Update RLS: staff should only see tasks where `visibility = 'all'` OR they are admin. The existing "Staff can view own tasks" policy needs adjustment — staff should see all tasks with `visibility = 'all'`. Add a new SELECT policy:
```sql
-- Drop existing staff select policy, replace with:
-- Staff can view tasks visible to all
CREATE POLICY "Staff can view visible tasks"
ON staff_tasks FOR SELECT TO authenticated
USING (
  is_admin(auth.uid()) 
  OR (is_staff_or_admin(auth.uid()) AND visibility = 'all')
);
```

Also update the staff UPDATE policy so any staff can move tasks (update `board_column`):
```sql
-- Replace existing staff update policy to allow all staff to update any visible task
CREATE POLICY "Staff can update visible tasks"
ON staff_tasks FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid()) 
  OR (is_staff_or_admin(auth.uid()) AND visibility = 'all')
);
```

### New Component: `src/components/staff/KanbanBoard.tsx`

Port from BioInnoTech's `Whiteboard.tsx` with these additions:
- 4 columns: To Do, Not Done Yet, In Progress, Done
- Drag-and-drop via `@hello-pangea/dnd`
- Each task card shows: title, description, creator name, assigned to (one staff name or "All Staff")
- Admins see: "Created by" and "Last edited by" labels on each card
- Admin-only: visibility toggle (eye icon) to mark task as admin-only; admin-only tasks get a subtle badge
- Add Task dialog: title, description, assign to dropdown (list of staff + "All Staff" option), column picker
- Admins can set visibility when creating/editing
- Staff can move tasks between columns (updates `board_column` + `last_edited_by`)
- Delete: admins delete directly, staff submit delete request

### Hook Changes: `src/hooks/useStaffTasks.ts`

- Add `board_column`, `visibility`, `last_edited_by` to `StaffTask` interface
- Update `createTask` to accept `board_column`, `visibility`, `assigned_to` (null = all staff)
- Update `updateTask` to accept `board_column`, `visibility`, and set `last_edited_by` to current user
- Sync `is_completed` with `board_column === 'done'`

### Dashboard Integration: `src/pages/staff/Dashboard.tsx`

- Import and render `<KanbanBoard />` after the notifications card and before the stats grid
- The board is visible to all staff and admins

### Admin Dashboard: `src/pages/staff/admin/Dashboard.tsx`

- Also add `<KanbanBoard />` so admins see it on their dashboard too

### Assignment Logic
- `assigned_to = null` means "All Staff" (everyone sees it)
- `assigned_to = <uuid>` means assigned to one specific staff member
- Both cases respect the visibility rule (admin_only tasks hidden from staff regardless of assignment)

### Package dependency
- `@hello-pangea/dnd` (already used pattern from BioInnoTech)

### Files
- **Migration**: Add `board_column`, `visibility`, `last_edited_by` columns + update RLS policies
- **Create**: `src/components/staff/KanbanBoard.tsx`
- **Edit**: `src/hooks/useStaffTasks.ts` (add new fields)
- **Edit**: `src/pages/staff/Dashboard.tsx` (add KanbanBoard)
- **Edit**: `src/pages/staff/admin/Dashboard.tsx` (add KanbanBoard)

