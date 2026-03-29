

## Add "Assign to All" in Calendar + Task Assignment Notifications

### What changes

1. **Calendar TaskDialog**: Add "All Staff" option to the assignment dropdown (currently only shows individual staff). When "All Staff" is selected, `assigned_to` is set to `null` (matching the Kanban convention).

2. **Notification on task assignment**: When a task is created or updated with an assignment, insert a notification into `staff_notifications` for the assigned user(s). If assigned to all, insert a notification for every staff member.

### Technical details

**File: `src/components/staff/calendar/TaskDialog.tsx`**
- Add an "All Staff" option (`value="all"`) to the Select dropdown in the Assign To section
- When submitting, if `assignedTo === 'all'`, pass `null` as `assigned_to` (same as Kanban)
- Show the Assign To field for all users who `canEdit`, not just admins (matching Kanban behavior — or keep admin-only if preferred)

**File: `src/hooks/useStaffTasks.ts`**
- After `createTask` and `updateTask` succeed, insert notification(s) into `staff_notifications`:
  - If `assigned_to` is a specific user: insert one notification for that user
  - If `assigned_to` is null (all staff): fetch all profile IDs and insert a notification for each
  - Notification includes task title, type `'task_assigned'`, and `related_task_id`
- Skip self-notification (don't notify the creator/editor if they assigned to themselves)

### Files
- **Edit**: `src/components/staff/calendar/TaskDialog.tsx` — add "All Staff" option to assignment select
- **Edit**: `src/hooks/useStaffTasks.ts` — add notification insertion after create/update

