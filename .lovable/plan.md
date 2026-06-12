# Plan: Test Coverage for Auth & Edge Functions

Scope: add focused unit tests around the new security boundaries (Edge Function auth helpers + frontend route guard). No production code is changed; no real Supabase keys are used in tests.

## 1. Edge Function tests (Deno)

**New file:** `supabase/functions/tests/ai.test.ts`

Targets the pure logic in `supabase/functions/_shared/auth-helpers.ts`:
- `validatePayloadSize` / `readJsonWithLimit` — byte-cap enforcement
- `requireRole` — JWT presence + role allow-list
- `withAuth` / `sanitizeError` — preflight, method, and error sanitization paths

Test cases:

1. **401 — missing Authorization header**
   - Build a `Request` with no `Authorization` header.
   - Call `requireRole(req, ['clinical'])` and assert it throws `HttpError` with `status === 401` and `safeMessage === 'Unauthorized'`.

2. **403 — authenticated user with disallowed role**
   - Stub `Deno.env` for `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` with dummy values (`http://localhost`, `test-anon`, `test-service`) — never real keys.
   - Monkey-patch `globalThis.fetch` to:
     - return `{ id: 'u1', ... }` for the `/auth/v1/user` call (simulates a valid JWT),
     - return `[{ role: 'patient' }]` for the `user_roles` PostgREST query.
   - Build a `Request` with `Authorization: Bearer fake.jwt.token`.
   - Assert `requireRole(req, ['clinical','admin','special_admin'])` throws `HttpError` with `status === 403` and `safeMessage === 'Forbidden'`.
   - Restore `fetch` in a `finally`.

3. **413 — payload over the cap**
   - Build a `Request` with `Content-Length: 30000` header and a 30 KB body.
   - Call `readJsonWithLimit(req, 20 * 1024)` and assert it throws `HttpError` with `status === 413`.
   - Also assert the streaming path: a request with no `Content-Length` but body bytes exceeding the cap still throws 413 (validates the in-loop accumulator, not just the header check).

4. **`sanitizeError` does not leak internals**
   - Pass an `Error("OPENAI_API_KEY=sk-live-XYZ stacktrace at /home/...")` through the public response path (call `withAuth` with a handler that throws it, using a mocked allowed role).
   - Assert response status is `500`, body is generic (`{ error: 'Internal Server Error' }` or equivalent), and the body string does not contain `sk-live`, `OPENAI`, or any file path fragment.

Run with `supabase--test_edge_functions` (`functions: ["tests"]` or pattern filter). All env reads use stubbed values; no network egress.

## 2. Frontend route-guard tests (Vitest)

**Delete:** `src/test/example.test.ts`
**New file:** `src/test/auth-guards.test.tsx`

Mocks `@/contexts/AuthContext` so `useAuth()` returns controlled values; mocks `react-router-dom`'s `Navigate` to a sentinel component that records the `to` prop. Renders `<ProtectedRoute>` inside a `MemoryRouter`.

Test cases:

1. **Unauthenticated → redirects to `/auth`**
   - `useAuth` mock: `{ user: null, loading: false, rolesLoading: false, role: null, isAdmin: false, isStaffOrAdmin: false }`.
   - Render `<ProtectedRoute requireStaffOrAdmin><div>secret</div></ProtectedRoute>`.
   - Assert children are not in the DOM and the `Navigate` sentinel reports `to === '/auth'`.

2. **Authenticated non-admin → forbidden from admin-only route**
   - `useAuth` mock: `{ user: { id: 'u1' }, loading: false, rolesLoading: false, role: 'ops_staff', isAdmin: false, isStaffOrAdmin: true }` (closest analogue to spec's `role: 'ops'`; project has no standalone `ops` enum value).
   - Render `<ProtectedRoute requireAdmin><div>doctor-only</div></ProtectedRoute>`.
   - Assert children are not rendered and `Navigate` reports `to === '/'`.

3. **Guest firewall** (bonus, same file, very cheap)
   - `useAuth` mock with `role: 'guest'`, `requireStaffOrAdmin`.
   - Assert redirect to `/`.

4. **Happy path** — admin user with `requireAdmin` renders children.

No network calls. `@/integrations/supabase/client` is not imported by `ProtectedRoute`, so no Supabase mock is required; if a transitive import appears at test time we will `vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))`.

## Notes on the literal spec

- Spec asks for `role: 'patient'` and `role: 'ops'` JWTs. This codebase stores roles in `public.user_roles` (enum `app_role`), not in the JWT, and has no `patient` or `ops` enum values. The Deno test simulates `patient` as the `user_roles` row value (the actual code path), and the Vitest test uses `ops_staff` (the real enum) — both faithfully exercise the "disallowed role" branch.
- No real keys: all `Deno.env.get` calls are backed by `Deno.env.set` with throwaway strings inside `try/finally`. Vitest never imports `@/integrations/supabase/client` for these tests.

## Verification after implementation

- `npm run lint`
- `npx tsc --noEmit`
- `npm test` (runs `vitest run`)
- `npm run build`
- Edge function tests via `supabase--test_edge_functions` with `pattern: "auth-helpers"` (or run the `tests` folder).

## Risks / rollback

- Risk: `withAuth` may import modules that touch `Deno.env` at import time — if so, env stubs must be set before the dynamic import. Mitigation: use `await import("../_shared/auth-helpers.ts")` inside each test after `Deno.env.set`.
- Risk: `Navigate` mock could break other suites if module-scoped. Mitigation: `vi.mock` scoped to this test file only.
- Rollback: tests are additive — delete the two new files and restore `example.test.ts` (one line) to revert.
