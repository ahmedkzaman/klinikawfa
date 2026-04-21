
## Plan: Captcha + Rate Limit for Appointment Submissions

Lock down the public `appointments` insert by routing it through an edge function that verifies a Cloudflare Turnstile captcha and enforces a per-IP rate limit (3 per 10 min). Then revoke the public `INSERT` policy.

> Note: per Lovable guidance, the backend has no shared rate-limit primitives — this will be an ad-hoc in-memory + DB-fallback implementation, good enough for this lead form but not a hardened solution.

### 1. Database migration
- New table `appointment_submission_log` (`id`, `ip_hash` text, `created_at` timestamptz default now()). Index on `(ip_hash, created_at)`. RLS enabled, no public policies (only service role writes/reads).
- Drop policy `Anyone can submit appointments` on `appointments` so direct anon inserts are blocked. Staff/admin policies stay.
- (No new policy needed — edge function uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS.)

### 2. New edge function `submit-appointment`
- `verify_jwt = false` (public form).
- CORS handled.
- Zod validation on body: `name` (1–100), `phone` (regex, 8–20), `service` (whitelist), `preferred_date` (ISO date, not in past), `preferred_time` (HH:MM), `message` (≤500, optional), `turnstileToken` (string).
- Extract client IP from `x-forwarded-for` / `cf-connecting-ip`. Hash with SHA-256 + a server-side salt before storing (privacy).
- **Captcha verify**: POST `turnstileToken` + `TURNSTILE_SECRET_KEY` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Reject on failure with 403.
- **Rate limit**: 
  - In-memory `Map<ipHash, timestamps[]>` for hot-path (per-instance).
  - DB check: `select count(*) from appointment_submission_log where ip_hash=$1 and created_at > now() - interval '10 minutes'`. If `>= 3` → return 429 with bilingual message.
- On success: insert into `appointments` (service role) + insert log row. Return `{ ok: true, id }`.

### 3. Frontend changes (`src/pages/Appointment.tsx`)
- Add `@marsidev/react-turnstile` widget above the submit button. Use `VITE_TURNSTILE_SITE_KEY` (public, safe in code/env).
- Block submit until token present.
- Replace direct `supabase.from('appointments').insert(...)` with `supabase.functions.invoke('submit-appointment', { body: {...formData, turnstileToken} })`.
- Handle 429 → toast "Too many requests, try again in a few minutes" (BM/EN). Handle 403 → toast "Captcha failed, please retry".
- Keep the existing post-submit WhatsApp redirect flow.

### 4. Secrets needed
- `TURNSTILE_SECRET_KEY` (Cloudflare dashboard → Turnstile widget → secret key) — request via add_secret after approval.
- `TURNSTILE_SITE_KEY` (public site key) — added to code as a constant or `VITE_TURNSTILE_SITE_KEY` in `.env` (publishable, fine to commit).
- `APPT_IP_SALT` — random string for hashing IPs. Will be requested.

### 5. Security finding
- After deploy, mark `SUPA_rls_policy_always_true` as fixed (the offending policy is removed).

### Files touched
- New: `supabase/functions/submit-appointment/index.ts`
- New: migration (drop policy + create log table)
- New: `supabase/config.toml` block for the function
- Edited: `src/pages/Appointment.tsx`
- Edited: `package.json` (add `@marsidev/react-turnstile`)

### Out of scope
- Distributed rate limiting (would need Redis/Upstash).
- Captcha on other public forms (lead capture etc.) — can extend later.
