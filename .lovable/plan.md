

## Manual Migration Plan: Lovable Cloud to Your Own Supabase Project

This plan gives you everything needed to recreate the backend on your own Supabase instance and point the app at it.

---

### 1. Complete Inventory

**Tables (25):**
app_settings, appointments, appraisal_responses, attendance_payroll_records, attendance_records, blog_categories, blog_posts, circular_notice_acknowledgements, circular_notices, consultation_transcripts, daily_reports, gallery_images, geofence_zones, leave_requests, monthly_payroll_summaries, performance_appraisals, profiles, reviews, saved_rosters, staff_notifications, staff_onboarding, staff_payroll_profiles, staff_profile_submissions, staff_roster_settings, staff_tasks, staff_zone_assignments, task_delete_requests, team_members, user_roles, video_payments, video_rooms

**Enum:** `app_role` ('admin', 'staff', 'guest')

**Database Functions (5):** `update_updated_at_column`, `handle_new_user`, `has_role`, `is_admin`, `is_staff_or_admin`

**Auth Trigger:** `on_auth_user_created` (on `auth.users` INSERT -> `handle_new_user()`)

**Storage Buckets (4):** `gallery` (public), `team-photos` (public), `videos` (public), `daily-reports` (public)

**Edge Functions (8):** `elevenlabs-scribe-token`, `generate-bio`, `generate-blog-content`, `publish-scheduled-posts`, `structure-medical-notes`, `video-payment`, `video-room`, `video-webhook`

**Secrets Required:** `STRIPE_SECRET_KEY`, `ELEVENLABS_API_KEY`, `LOVABLE_API_KEY` (for AI gateway -- see breakage notes)

**Realtime:** `video_rooms` table uses realtime for WebRTC signaling

---

### 2. What I Will Prepare (as downloadable SQL files)

I will generate a single consolidated SQL migration file that includes:
- Enum creation
- All 25+ table definitions with columns, defaults, and constraints
- All RLS policies (every policy listed in the schema above)
- All security-definer functions
- The `handle_new_user` trigger on `auth.users`
- `updated_at` triggers
- Realtime publication for `video_rooms`

You run this against your new Supabase project via the SQL Editor in your Supabase dashboard.

---

### 3. Config/Environment Changes

**Files to update (2):**

| File | Change |
|------|--------|
| `.env` | Replace `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with your own project's URL and anon key |
| `src/integrations/supabase/client.ts` | No code change needed -- it reads from `.env` already |

You will also need to:
- Create the 4 storage buckets manually in your Supabase dashboard (gallery, team-photos, videos, daily-reports) and set them to public
- Add secrets (`STRIPE_SECRET_KEY`, `ELEVENLABS_API_KEY`) in your Supabase dashboard under Edge Function secrets
- Deploy edge functions using `supabase functions deploy` from the CLI

---

### 4. Data Export/Import

Tables with data you need to export from Lovable Cloud (via Cloud tab -> Database -> Tables -> Export CSV):
- **Critical:** `profiles`, `user_roles`, `team_members`, `app_settings`, `saved_rosters`, `staff_payroll_profiles`, `geofence_zones`, `staff_roster_settings`, `staff_zone_assignments`
- **Content:** `blog_posts`, `blog_categories`, `reviews`, `gallery_images`
- **Operational:** `attendance_records`, `attendance_payroll_records`, `daily_reports`, `leave_requests`, `staff_tasks`, `staff_notifications`, `circular_notices`, etc.

**Auth users cannot be exported via CSV.** You will need to either:
- Have users re-register on the new project, OR
- Use the Supabase Management API to bulk-import users (requires the old project's auth export)

---

### 5. App Code Changes

**No code changes are needed** to switch the app to a different Supabase project. The entire app already uses `@/integrations/supabase/client` which reads from env vars. Simply changing `.env` values points everything (reads, writes, auth, storage, realtime) to your new project.

The `types.ts` file should be regenerated from your new project using `supabase gen types typescript`.

---

### 6. Features That May Break

| Feature | Risk | Reason |
|---------|------|--------|
| **AI features** (blog generation, bio generation, medical notes structuring) | **HIGH** | These edge functions use `LOVABLE_API_KEY` to call the Lovable AI gateway. This gateway only works within Lovable Cloud. You will need to replace it with direct OpenAI/Gemini API calls and your own API key. |
| **Stripe payments** | LOW | Works if you set `STRIPE_SECRET_KEY` in your new project's secrets. Webhook URL must be updated in your Stripe dashboard to point to your new edge function URL. |
| **ElevenLabs transcription** | LOW | Works if you set `ELEVENLABS_API_KEY` in your new project's secrets. |
| **Video calls (WebRTC)** | LOW | Uses Supabase Realtime for signaling -- works as long as realtime is enabled on `video_rooms`. |
| **Auth users** | **HIGH** | Existing users and passwords cannot be trivially migrated. Users may need to re-register. |
| **Storage files** | MEDIUM | Images/videos stored in Lovable Cloud buckets need to be re-uploaded to new buckets. Old URLs will break. |
| **Notifications (realtime)** | LOW | Uses Supabase Realtime channels -- works on any Supabase project. |

---

### 7. Step-by-Step Execution Order

1. I generate the consolidated SQL migration file and output it to `/mnt/documents/`
2. You create a new Supabase project at supabase.com
3. You run the SQL migration in your Supabase SQL Editor
4. You create the 4 storage buckets (gallery, team-photos, videos, daily-reports) as public
5. You export data CSVs from Lovable Cloud and import them into your new project
6. You add secrets (STRIPE_SECRET_KEY, ELEVENLABS_API_KEY) in your new Supabase dashboard
7. You update the Stripe webhook URL to your new edge function URL
8. You deploy edge functions using `supabase functions deploy` from CLI
9. You update `.env` with your new project URL and anon key
10. You replace Lovable AI gateway calls in edge functions with direct API provider calls
11. You regenerate `types.ts` using `supabase gen types typescript`

**UI remains completely unchanged.**

