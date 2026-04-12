

## Plan: Admin Circular Notices + Selfie Image Preview

### 1. Admin Circular Notice/Announcement Management

**New page**: `src/pages/staff/admin/CircularNotices.tsx`
- CRUD interface for creating, editing, deactivating circular notices
- Form fields: title, content (textarea/markdown), priority (normal/urgent), is_active toggle
- List view showing all notices with status, date, acknowledgement count
- Ability to view which staff have acknowledged each notice

**Database migration**:
- Create `circular_notices` table (id, title, content, priority, is_active, created_by, published_at, created_at, updated_at)
- Create `circular_notice_acknowledgements` table (id, notice_id FK, user_id, acknowledged_at) with unique(notice_id, user_id)
- RLS: Admin can CRUD notices; all authenticated staff/admin can SELECT active notices
- RLS: Staff can INSERT/SELECT own acknowledgements; Admin can SELECT all
- Enable realtime on both tables

**Navigation & routing**:
- Add `{ href: '/staff/admin/notices', label: 'Circular Notices', icon: Megaphone }` to `adminNavItems` in `StaffLayout.tsx`
- Add route `<Route path="admin/notices" element={<CircularNotices />} />` in `App.tsx`

**Staff-facing inbox + blocking** (from previously approved plan):
- New `src/pages/staff/Inbox.tsx` — view notices, acknowledge with "I've read & understood" button
- Add inbox nav item with unread badge to `staffNavItems`
- Add route `/staff/inbox` in `App.tsx`
- In `StaffLayout.tsx`: fetch unacknowledged active notices; if any exist, show full-screen blocking modal before allowing navigation. Admin users are exempt.

### 2. Selfie Image Preview in Admin Daily Tasks

**In `DailyTaskReview.tsx`**:
- Make the selfie check/cross icon clickable when a URL exists
- On click, open a Dialog/modal showing the selfie image full-size using an `<img>` tag (no download required)
- Show staff name, date, and shift in the modal header
- Same treatment for stock photos (clickable preview)

### Technical Details

**Files to create**:
- `src/pages/staff/admin/CircularNotices.tsx` — admin CRUD for notices
- `src/pages/staff/Inbox.tsx` — staff inbox with acknowledgement
- Migration SQL for `circular_notices` and `circular_notice_acknowledgements`

**Files to modify**:
- `src/components/staff/StaffLayout.tsx` — add nav items (Inbox for staff, Circular Notices for admin), add blocking modal logic
- `src/App.tsx` — add routes for `/staff/inbox` and `/staff/admin/notices`
- `src/pages/staff/admin/DailyTaskReview.tsx` — add image preview dialog for selfie/stock photo columns
- `src/pages/staff/Dashboard.tsx` — show banner for unacknowledged notices

