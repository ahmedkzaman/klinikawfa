
-- Add new columns to staff_tasks
ALTER TABLE staff_tasks ADD COLUMN board_column text NOT NULL DEFAULT 'todo';
ALTER TABLE staff_tasks ADD COLUMN visibility text NOT NULL DEFAULT 'all';
ALTER TABLE staff_tasks ADD COLUMN last_edited_by uuid;

-- Set existing completed tasks to 'done'
UPDATE staff_tasks SET board_column = 'done' WHERE is_completed = true;

-- Make assigned_to nullable (for "All Staff" assignment)
ALTER TABLE staff_tasks ALTER COLUMN assigned_to DROP NOT NULL;

-- Drop old staff SELECT/UPDATE policies that are too restrictive
DROP POLICY IF EXISTS "Staff can view own tasks" ON staff_tasks;
DROP POLICY IF EXISTS "Staff can update own tasks" ON staff_tasks;

-- Staff can view all tasks with visibility='all'
CREATE POLICY "Staff can view visible tasks"
ON staff_tasks FOR SELECT TO authenticated
USING (
  is_admin(auth.uid()) 
  OR (is_staff_or_admin(auth.uid()) AND visibility = 'all')
);

-- Staff can update any visible task (move on board)
CREATE POLICY "Staff can update visible tasks"
ON staff_tasks FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid()) 
  OR (is_staff_or_admin(auth.uid()) AND visibility = 'all')
);
