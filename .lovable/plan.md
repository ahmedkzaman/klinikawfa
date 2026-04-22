
## Plan: Per-IP Rate Limit (10 / 10 min) on Appointment Form — Final

Adds advisory-lock concurrency safety and removes the service-role escalation. The RPC's `SECURITY DEFINER` is the only privilege boundary needed.

### 1. Database (already partially done)
Already applied:
- `appointment_submission_log` (`id`, `ip_hash`, `created_at`) with index on `(ip_hash, created_at desc)`, RLS enabled, no public policies.
- `Anyone can submit appointments` policy dropped from `appointments`.

New in this step:
- Enable `pg_cron` only (no `pg_net`).
- `SECURITY DEFINER` function `public.cleanup_appointment_submission_log()` running `DELETE FROM appointment_submission_log WHERE created_at < now() - interval '24 hours'`.
- `cron.schedule('cleanup-appointment-submission-log', '0 3 * * *', $$SELECT public.cleanup_appointment_submission_log()$$)`.
- `SECURITY DEFINER` RPC `public.record_appointment_submission(_ip_hash text, _name text, _phone text, _service text, _preferred_date date, _preferred_time time, _message text)` — `search_path = public`. Body, in order, inside an implicit transaction:
  1. `PERFORM pg_advisory_xact_lock(hashtext(_ip_hash));` — serializes concurrent calls from the same IP for the duration of the transaction. Released automatically on commit/rollback.
  2. `SELECT count(*) INTO v_count FROM appointment_submission_log WHERE ip_hash = _ip_hash AND created_at > now() - interval '10 minutes';`
  3. If `v_count >= 10` → `RAISE EXCEPTION 'RATE_LIMIT' USING ERRCODE = 'P0001';`
  4. `INSERT INTO appointment_submission_log (ip_hash) VALUES (_ip_hash);`
  5. `INSERT INTO appointments (name, phone, service, preferred_date, preferred_time, message) VALUES (...) RETURNING id INTO v_id;`
  6. `RETURN v_id;`
- `GRANT EXECUTE ON FUNCTION public.record_appointment_submission(...) TO anon, authenticated;` — required because the edge function calls it as the anon role. The function body still runs with definer privileges, so it can write to `appointments` and `appointment_submission_log` despite their RLS.
- Both inserts and the rate-limit check are atomic: any failure rolls back both rows together. The advisory lock is held only for that single transaction, so contention is minimal and self-cleaning.

### 2. New edge function `submit-appointment`
- `verify_jwt = false` in `supabase/config.toml`.
- CORS headers on every response (including errors).
- **Anon Supabase client only** — built with `SUPABASE_URL` + `SUPABASE_ANON_KEY`. No service-role key is read or used in this function. The RPC's `SECURITY DEFINER` provides the write privileges; the anon client only needs `EXECUTE` on the function.
- **Zod validation**: `name` (1–100, trimmed), `phone` (regex `^[+0-9 \-()]{8,20}$`), `service` (1–100), `preferred_date` (ISO date, today or later), `preferred_time` (HH:MM), `message` (≤1000, optional).
- **Hardened IP extraction** (no `x-forwarded-for`):
  - Use `cf-connecting-ip`, fall back to `x-real-ip` — both are gateway-set, not client-controllable.
  - If neither is present → return 400 ("Unable to verify request origin"). Refuse rather than silently bypass.
- Hash IP with SHA-256 + `APPT_IP_SALT` before passing to RPC.
- Call `supabase.rpc('record_appointment_submission', { _ip_hash, _name, _phone, _service, _preferred_date, _preferred_time, _message })`.
- Map errors:
  - Error message/code matches `RATE_LIMIT` → return **429** with bilingual `{ error, retryAfterMinutes: 10 }`.
  - Zod failure → 400 with field errors.
  - Other DB errors → 500 generic message; log details server-side.
- Return `{ ok: true, id }` on success.

### 3. Frontend (`src/pages/Appointment.tsx`)
- Replace `supabase.from('appointments').insert(...)` with `supabase.functions.invoke('submit-appointment', { body: {...formData} })`.
- Toast handling (BM/EN):
  - 429 → "Too many requests. Please try again in 10 minutes / Terlalu banyak permintaan. Sila cuba lagi dalam 10 minit"
  - 400 → field-level validation errors
- Keep the post-submit WhatsApp redirect flow untouched.

### 4. Secrets needed
- `APPT_IP_SALT` — random ≥32-char string for privacy-preserving IP hashing (will request after approval). `SUPABASE_URL` and `SUPABASE_ANON_KEY` are already set; service-role key is intentionally not used.

### 5. Security finding
- After deploy, mark `SUPA_rls_policy_always_true` as fixed.

### Files touched
- New: `supabase/functions/submit-appointment/index.ts`
- New migration: enable `pg_cron`, create cleanup function + cron schedule, create `record_appointment_submission()` RPC with advisory lock, grant EXECUTE to anon/authenticated
- Edited: `supabase/config.toml` (add `[functions.submit-appointment] verify_jwt = false`)
- Edited: `src/pages/Appointment.tsx`

### Out of scope
- Captcha.
- Distributed/global rate limiting (would need Redis/Upstash).
- IPv6 /64 prefix bucketing.
