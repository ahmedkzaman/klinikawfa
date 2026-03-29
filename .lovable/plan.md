

## Fix: End Date Not Syncing with Deadline on Task Load

### Problem
When opening an existing task for editing, if the task has a deadline but no `end_date` saved in the database, the End Date shows "Optional" instead of matching the deadline. The sync logic only runs when you **pick** a new deadline (line 151), but not when the dialog **loads** an existing task (line 60-62).

### Fix: `src/components/staff/calendar/TaskDialog.tsx`

In the `useEffect` that loads task data (around line 60-62), add a fallback: if `task.end_date` is null but `task.deadline` exists, set `endDate` to the deadline value.

**Change line 60-61 from:**
```ts
if (task.end_date) { ... setEndDate(ed); ... }
else { setEndDate(undefined); setEndTime('10:00'); }
```

**To:**
```ts
if (task.end_date) { ... setEndDate(ed); ... }
else if (task.deadline) { setEndDate(new Date(task.deadline)); setEndTime('10:00'); }
else { setEndDate(undefined); setEndTime('10:00'); }
```

### Single file change
- **Edit**: `src/components/staff/calendar/TaskDialog.tsx` (line 60-61 only)

