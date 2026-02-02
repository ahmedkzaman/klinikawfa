

# Plan: Schedule Blog Posts for Future Publishing

## Overview

Add the ability to schedule blog posts to be published at a specific date and time in the future. This feature will allow you to write content in advance and have it automatically become visible to readers at the scheduled time.

## How It Will Work

1. **In the Blog Editor**: A new "Schedule Publication" option will appear in the Settings panel
2. **Date/Time Picker**: Select the exact date and time you want the post to go live
3. **Status Indicators**: Posts will show "Scheduled" status with the scheduled date in the admin panel
4. **Automatic Publishing**: A background process will automatically publish posts when their scheduled time arrives

## User Interface Changes

### Blog Editor (Settings Panel)
- New toggle: "Schedule for later" (appears when post is not yet published)
- Date picker: Select the publication date
- Time picker: Select the publication time
- Visual indicator showing scheduled date/time when set

### Blog Management Table
- New "Scheduled" badge for scheduled posts
- Display scheduled date in the status column
- Distinguish between Draft, Scheduled, and Published states

## Technical Implementation

### 1. Database Change
Add a new column to store the scheduled publication date:

```sql
ALTER TABLE blog_posts 
ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE;
```

### 2. Blog Editor Updates
- Add `scheduled_at` to form state
- Add schedule toggle and date/time picker UI
- Update save logic to handle scheduled posts

### 3. Blog Management Updates
- Show "Scheduled" badge with date for scheduled posts
- Update status display logic

### 4. Frontend Query Updates
- Modify `useBlogPosts.ts` to only show posts where:
  - `published = true` AND
  - (`scheduled_at` IS NULL OR `scheduled_at` <= now())

### 5. Automatic Publishing (Cron Job)
Create a scheduled task that runs every minute to:
- Find posts where `published = true` AND `scheduled_at <= now()` AND `scheduled_at IS NOT NULL`
- Clear the `scheduled_at` field (making them permanently published)

## Files to Modify

| File | Changes |
|------|---------|
| Database Migration | Add `scheduled_at` column to `blog_posts` table |
| `src/pages/admin/BlogEditor.tsx` | Add schedule toggle, date picker, time picker; update form state and save logic |
| `src/pages/admin/BlogManagement.tsx` | Add "Scheduled" badge, show scheduled date in table |
| `src/hooks/useBlogPosts.ts` | Update queries to filter by scheduled date |
| `supabase/functions/publish-scheduled-posts/index.ts` | New edge function for auto-publishing |
| `supabase/config.toml` | Register new edge function |

## Visual Mockup of Editor Changes

```text
Settings Card (Blog Editor)
+----------------------------------+
| Settings                         |
+----------------------------------+
| Publish            [Toggle: OFF] |
|                                  |
| Schedule for later [Toggle: ON ] |
|                                  |
| Scheduled Date                   |
| [Feb 15, 2026    ] [14:00]       |
|                                  |
| Category                         |
| [Select category     v]          |
+----------------------------------+
```

## Status Badge Logic

| Condition | Badge |
|-----------|-------|
| `published = false` | Draft |
| `published = true` AND `scheduled_at > now()` | Scheduled (with date) |
| `published = true` AND (`scheduled_at` IS NULL OR `scheduled_at <= now()`) | Published |

