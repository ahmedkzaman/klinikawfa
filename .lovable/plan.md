
## Plan: hCaptcha + Per-IP Rate Limit (3 / 10 min) on Appointment Form

Lock down the public `appointments` insert by routing through an edge function that:
1. Verifies an hCaptcha token
2. Enforces a per-IP rate limit (3 submissions / 10 minutes) via a DB log table
3. Inserts via service role

Then drop the open public `INSERT` RLS policy.

> Note: Per platform guidance, the backend has no shared rate-limit primitives. This implementation is ad-hoc (DB-backed log + best-effort in-memory cache) — sufficient for a public lead form, not hardened DDoS protection.

### 1. Database migration
- New table `appointment_submission_log`:
  - `id uuid pk`, `ip_hash text not null`, `created_at timestamptz default now()`
  - Index on `(ip_hash, created_at desc)` for fast rate-limit lookups
  - RLS enabled, **no public policies** (only service role accesses it)
- Drop policy `Anyone can submit appointments` on `public.appointments`. Staff/admin policies stay.
- Optional retention: a comment noting rows older than 1 day can be cleaned up later (not auto-purged for now).

### 2. New edge function `submit-appointment`
- `verify_jwt = false` (public form) — added to `supabase/config.toml`.
- Standard CORS headers on every response (including errors).
- **Zod validation** on body:
  - `name` (1–100, trimmed)
  - `phone` (regex `^[+0-9 \-()]{8,20}$`)
  - `service` (string, 1–100)
  - `preferred_date` (ISO date, today or later)
  - `preferred_time` (HH:MM)
  - `message` (≤1000, optional)
  - `hcaptchaToken` (string)
- **Captcha verify**: POST form-urlencoded `response` + `secret` to `https://api.hcaptcha.com/siteverify`. Reject 403 on `success: false`.
- **Rate limit (3 / 10 min per IP)**:
  - Extract IP from `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for` (first entry).
  - Hash IP with SHA-256 + `APPT_IP_SALT` for privacy before storing/querying.
  - Query: `select count(*) from appointment_submission_log where ip_hash=$1 and created_at > now() - interval '10 minutes'`.
  - If `>= 3` → return **429** with bilingual message `{ error: "Too many requests / Terlalu banyak permintaan", retryAfterMinutes: 10 }`.
- **On success**: insert into `appointments` (service role bypasses RLS) + insert log row. Return `{ ok: true, id }`.

### 3. Frontend changes (`src/pages/Appointment.tsx`)
- Install and add `@hcaptcha/react-hcaptcha` widget above the submit button.
- Site key as `VITE_HCAPTCHA_SITE_KEY` in `.env` (publishable, safe).
- Disable submit button until captcha token is captured.
- Replace direct `supabase.from('appointments').insert(...)` with `supabase.functions.invoke('submit-appointment', { body: {...formData, hcaptchaToken} })`.
- Toast handling (BM/EN):
  - 429 → "Too many requests. Please try again in 10 minutes / Terlalu banyak permintaan. Sila cuba lagi dalam 10 minit"
  - 403 → "Captcha verification failed. Please retry / Pengesahan captcha gagal. Sila cuba lagi"
  - 400 → field-level validation errors
- Reset captcha widget after every submit (success or fail).
- Keep the existing post-submit WhatsApp redirect flow untouched.

### 4. Secrets needed (will request after approval)
- `HCAPTCHA_SECRET_KEY` — from https://dashboard.hcaptcha.com → Sites → Settings → Secret Key (free, ~2 min signup)
- `VITE_HCAPTCHA_SITE_KEY` — public site key from same page (committed in `.env`, safe)
- `APPT_IP_SALT` — any random ≥32-char string (I'll suggest one) for privacy-preserving IP hashing
- For local testing, hCaptcha provides always-pass test keys: site `10000000-ffff-ffff-ffff-000000000001`, secret `0x0000000000000000000000000000000000000000`

### 5. Security finding
- After deploy, mark `SUPA_rls_policy_always_true` as fixed (offending policy removed).

### Files touched
- New: `supabase/functions/submit-appointment/index.ts`
- New: migration (drop policy + create `appointment_submission_log`)
- Edited: `supabase/config.toml` (add `[functions.submit-appointment] verify_jwt = false`)
- Edited: `src/pages/Appointment.tsx`
- Edited: `package.json` (add `@hcaptcha/react-hcaptcha`)

### Out of scope
- Distributed/global rate limiting (would need Redis/Upstash).
- Auto-purge of old log rows (manual cleanup or future cron).
- Captcha on other public forms — can extend later.
