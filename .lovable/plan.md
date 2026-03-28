

## Remove `/admin` Dashboard — Consolidate into `/staff` Portal

### What changes

The standalone `/admin` dashboard (with its own layout, sidebar, and routes) will be removed. All its content management pages (Leads, Team, Blog, Gallery, Reviews, Settings, Video Calls) will be moved under the `/staff` route tree, nested inside the existing `StaffLayout`. The "Website" section in the staff sidebar already links to these pages — we just need to re-route them.

### Route changes

| Current route | New route |
|---|---|
| `/admin/leads` | `/staff/website/leads` |
| `/admin/team` | `/staff/website/team` |
| `/admin/team/:id` | `/staff/website/team/:id` |
| `/admin/video-calls` | `/staff/website/video-calls` |
| `/admin/blog` | `/staff/website/blog` |
| `/admin/blog/:id` | `/staff/website/blog/:id` |
| `/admin/gallery` | `/staff/website/gallery` |
| `/admin/reviews` | `/staff/website/reviews` |
| `/admin/settings` | `/staff/website/settings` |
| `/admin` (dashboard) | **Removed** |

A redirect from `/admin/*` to `/staff/admin` will catch any old bookmarks.

### Files to modify

1. **`src/App.tsx`**
   - Remove the entire `/admin` route block (lines 84-96) and its imports (`AdminLayout`, all admin page imports)
   - Add new routes under the `/staff` element for `website/*` paths
   - Add a catch-all redirect: `/admin/*` → `/staff/admin`

2. **`src/components/staff/StaffLayout.tsx`**
   - Update `contentNavItems` hrefs from `/admin/*` to `/staff/website/*`

3. **`src/pages/admin/BlogEditor.tsx`** — Change all `navigate('/admin/blog')` → `navigate('/staff/website/blog')`

4. **`src/pages/admin/BlogManagement.tsx`** — Change `navigate('/admin/blog/new')` and `navigate('/admin/blog/:id')` paths

5. **`src/pages/admin/TeamManagement.tsx`** — Change `navigate('/admin/team/new')` and `navigate('/admin/team/:id')` paths

6. **`src/pages/admin/TeamEditor.tsx`** — Change all `navigate('/admin/team')` paths

7. **`src/pages/admin/Dashboard.tsx`** — Update all internal links or remove file entirely (no longer needed)

8. **`src/pages/VideoCallStaff.tsx`** — Change `navigate('/admin/video-calls')` paths

9. **Delete files** (no longer needed):
   - `src/components/admin/AdminLayout.tsx`
   - `src/components/admin/AdminSidebar.tsx`
   - `src/components/admin/index.ts`
   - `src/pages/admin/Dashboard.tsx`
   - `src/pages/admin/index.ts` (update to remove Dashboard export)

### No database changes needed

