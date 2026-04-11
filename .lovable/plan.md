

## Daily Reporting Section on Dashboards

### What We're Building
A daily reporting card on the Staff Dashboard where each staff member submits three items:
1. **Morning Briefing Selfie** — 1 photo upload, open 8am–9am only
2. **Medication Stock Photos** — 2 photo uploads (must show timestamp/date stamp on photo), open 8am–10am only
3. **WhatsApp Blast Count** — staff enters how many blasts they sent; admin sets the daily target

The Admin Dashboard gets a summary card showing which staff have/haven't submitted each item today.

### Database Changes

**Migration: Create `daily_reports` table**
```sql
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  briefing_selfie_url text,
  stock_photo_1_url text,
  stock_photo_2_url text,
  whatsapp_blast_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);
```
- RLS: staff can CRUD own rows, admin full access

**Migration: Create `app_settings` row for WhatsApp blast target**
- Insert a row: `key = 'daily_whatsapp_blast_target'`, `value = '5'` (admin-configurable)

**Storage: Create `daily-reports` bucket** (public) for selfie and stock photo uploads.

### File Changes

**Edit: `src/pages/staff/Dashboard.tsx`**
- Add a "Daily Reporting" card below notifications, above KanbanBoard
- Three sections with upload buttons and status indicators:
  - Briefing Selfie: single file input, disabled outside 8–9am, green check when uploaded
  - Stock Photos: two file inputs, disabled outside 8–10am, green checks when uploaded
  - WhatsApp Blasts: number input showing `X / target` with save button
- Fetch today's `daily_reports` row on load; upsert on submit
- Time-window logic uses `new Date().getHours()` to enable/disable upload buttons

**Edit: `src/pages/staff/admin/Dashboard.tsx`**
- Add a "Today's Daily Reports" summary card showing:
  - Table/list of all staff with checkmarks for each completed item (selfie, stock 1, stock 2, blasts count vs target)
  - Highlight missing submissions in red
- Add a small "Set WhatsApp Target" input that updates `app_settings`

### Technical Details
- Photos uploaded to `daily-reports/{user_id}/{date}/briefing.jpg`, `stock_1.jpg`, `stock_2.jpg`
- Time windows enforced client-side (UI disables outside window) — sufficient since this is an internal staff tool
- WhatsApp blast target stored in `app_settings` table (already exists with admin RLS)
- The `daily_reports` table uses a unique constraint on `(user_id, report_date)` for upsert logic

### Files
- **Migration**: Create `daily_reports` table + storage bucket + insert blast target setting
- **Edit**: `src/pages/staff/Dashboard.tsx` — daily reporting card with uploads and blast count
- **Edit**: `src/pages/staff/admin/Dashboard.tsx` — summary overview + target configuration

