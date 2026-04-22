
## Plan: Per-IP Rate Limit (3 / 10 min) on Appointment Form

Add a per-IP rate limit to the public appointment form. No captcha. Drop the open public `INSERT` RLS policy and route submissions through an edge function.

> Note: Per platform guidance, the backend has no shared rate-limit primitives. This is an ad-hoc DB-backed implementation — sufficient for a public lead form, not hardened DDoS protection.

### 1. Database migration
- New table `appointment_submission_log`:
  - `id uuid pk`, `ip_hash text not null`, `created_at timestamptz default now()`
  - Index on `(ip_hash, created_at desc)` for fast lookups
  - RLS enabled, no public policies (service role only)
- Drop policy `Anyone can submit appointments` on `public.appointments`. Staff/admin policies stay.

### 2. New edge function `submit-appointment`
- `verify_jwt = false` (public form) — added to `supabase/config.toml`.
- Standard CORS headers on every response.
- **Zod validation** on body:
  - `name` (1–100, trimmed)
  - `phone` (regex `^[+0-9 \-()]{8,20}$`)
  - `service` (1–100)
  - `preferred_date` (ISO date, today or later)
  - `preferred_time` (HH:MM)
  - `message` (≤1000, optional)
- **Rate limit (3 / 10 min per IP)**:
  - Extract IP from `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` (first entry).
  - Hash IP with SHA-256 + `APPT_IP_SALT` for privacy before storing/querying.
  - Query: `select count(*) from appointment_submission_log where ip_hash=$1 and created_at > now() - interval '10 minutes'`.
  - If `>= 3` → return **429** with bilingual `{ error, retryAfterMinutes: 10 }`.
- **On success**: insert into `appointments` (service role) + insert log row. Return `{ ok: true, id }`.

### 3. Frontend changes (`src/pages/Appointment.tsx`)
- Replace direct `supabase.from('appointments').insert(...)` with `supabase.functions.invoke('submit-appointment', { body: {...formData} })`.
- Toast handling (BM/EN):
  - 429 → "Too many requests. Please try again in 10 minutes / Terlalu banyak permintaan. Sila cuba lagi dalam 10 minit"
  - 400 → field-level validation errors
- Keep the post-submit WhatsApp redirect flow untouched.

### 4. Secrets needed
- `APPT_IP_SALT` — random ≥32-char string for privacy-preserving IP hashing (will request after approval).

### 5. Security finding
- After deploy, mark `SUPA_rls_policy_always_true` as fixed (offending policy removed).

### Files touched
- New: `supabase/functions/submit-appointment/index.ts`
- New: migration (drop policy + create `appointment_submission_log`)
- Edited: `supabase/config.toml` (add `[functions.submit-appointment] verify_jwt = false`)
- Edited: `src/pages/Appointment.tsx`

### Out of scope
- Captcha (removed per request).
- Distributed/global rate limiting (would need Redis/Upstash).
- Auto-purge of old log rows (manual cleanup or future cron).
