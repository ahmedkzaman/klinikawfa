# Plan — Harden Auth for AI/TTS Edge Functions

Backend-only. No frontend React changes. Three Edge Functions get JWT enforcement, role gating, payload caps, and sanitized errors via a shared helper.

## Role mapping (app_role → allowed sets)

The DB enum has no literal `clinical` or `ops`. Map the requested labels to existing roles in `public.user_roles.role`:

- `clinical` → `doctor`, `doctor_admin`, `resident_doctor`, `locum`
- `ops` → `staff`, `ops_staff`, `operations`
- `admin` → `admin`, `doctor_admin`
- `special_admin` → `special_admin`

The helper expands the friendly labels into the concrete role set before checking.

## Files

### 1. `supabase/config.toml` (edit)
Flip three entries to `verify_jwt = true`:
- `[functions.generate-bio]`
- `[functions.structure-medical-notes]`
- `[functions.generate-tts]` (new block — currently absent)

Leave webhooks/public flows untouched: `video-webhook`, `video-room`, `video-payment`, `submit-appointment`, `publish-scheduled-posts`, `admin-create-user`, `elevenlabs-scribe-token`.

### 2. `supabase/functions/_shared/auth-helpers.ts` (new)
Exports:
- `corsHeaders` — single source of truth (re-export pattern so functions stop duplicating).
- `HttpError` class with `status` and safe `message`.
- `requireRole(req, allowedLabels: Array<'clinical'|'ops'|'admin'|'special_admin'>) → Promise<{ userId, role }>`
  - Reads `Authorization: Bearer <jwt>`; 401 if missing/malformed.
  - Creates a Supabase client with the user JWT, calls `auth.getUser()`; 401 if invalid.
  - Reads `public.user_roles` with the service-role client (single source of truth; ignores any claim that could be spoofed).
  - Expands labels to concrete enum values; 403 if role not in set.
  - Returns `{ userId, role }`.
- `validatePayloadSize(req, maxBytes)` — checks `Content-Length`; 413 if exceeded. For chunked/missing header, also caps by reading body once and returning the parsed text/JSON so handlers don't double-read.
  - Pattern: `readJsonWithLimit<T>(req, maxBytes): Promise<T>` returning the parsed body, throwing `HttpError(413)` if oversize, `HttpError(400)` on invalid JSON.
- `sanitizeError(err) → { status, body }` — converts `HttpError` to its status+message, everything else to `{ status: 500, body: { error: 'Internal error' } }`. Logs server-side with `console.error` but never echoes stack/keys/PHI in the response.
- `withAuth(handler, opts)` — small wrapper that handles `OPTIONS`, method check, role gate, payload parse, try/catch, and final JSON response with `corsHeaders`.

### 3. Refactor functions (edit, body-only)
For each function, replace the top-level `serve(...)` body with a `withAuth` call:

- `supabase/functions/structure-medical-notes/index.ts`
  - Allowed: `['clinical', 'admin', 'special_admin']`
  - `maxBytes: 20 * 1024`
  - Keep existing AI gateway call; never log `transcript` content (only length).

- `supabase/functions/generate-bio/index.ts`
  - Allowed: `['clinical', 'ops', 'admin', 'special_admin']`
  - `maxBytes: 8 * 1024` (small JSON form payload)
  - Drop verbose error text in responses; keep server-side `console.error`.

- `supabase/functions/generate-tts/index.ts`
  - Allowed: `['clinical', 'ops', 'admin', 'special_admin']`
  - `maxBytes: 16 * 1024` (covers 5000-char text + voice metadata)
  - Existing 5000-char and field checks remain.

All three:
- Return only generic safe messages: `{ error: 'Unauthorized' | 'Forbidden' | 'Payload too large' | 'Invalid request' | 'Upstream failed' | 'Internal error' }`.
- Preserve existing CORS headers on every response (including errors).
- No change to request/response JSON shape on success — frontend untouched.

## Out of scope
- Frontend code (none touched; existing `supabase.functions.invoke` already attaches JWT).
- RLS changes, other Edge Functions, test scaffolding (covered by separate plan items).
- DB migrations.

## Risks & rollback
- Risk: a caller invoking these functions via raw `fetch` without a session token will now get 401. Mitigation: all callers in `src/` use `supabase.functions.invoke`, which attaches the session JWT automatically.
- Risk: role label mismatch (e.g. a user has only `staff` and tries to call `structure-medical-notes`). Intended — clinical PHI tooling shouldn't be invoked by non-clinical roles.
- Rollback: revert the three `verify_jwt` flips in `config.toml` and remove the `withAuth` wrapper / shared helper import in each function. Helper file is additive and harmless if unused.

## Verification (post-implementation)
```
npm run lint
npx tsc --noEmit
npm test
npm run build
```
Plus manual edge calls:
- anon `curl -X POST .../generate-bio` → 401
- authed non-clinical user → 403
- authed doctor with 25KB body to `structure-medical-notes` → 413
- authed doctor with valid body → 200
- error path returns no stack/key strings (grep response body)
