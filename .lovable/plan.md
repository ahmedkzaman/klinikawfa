
## Step 3 — Frontend Foundation (RBAC + Soft-Delete Helper + Protected Route)

Scope: Wire the new database primitives into the React app so subsequent clinic UI steps can rely on them. No clinic UI yet, no edge functions, no inventory screens.

---

### 3.1 — Extend `AuthContext` for new roles

File: `src/contexts/AuthContext.tsx`

- Extend the role union type to include `'special_admin' | 'operations'` alongside the existing `'admin' | 'staff' | 'user'`.
- Add derived booleans exposed via context value:
  - `isSpecialAdmin` — `role === 'special_admin'`
  - `isOperations` — `role === 'operations'`
  - `isOpsOrAdmin` — `['operations','admin','special_admin'].includes(role)`
- Keep existing `isAdmin`, `isStaff`, `rolesLoading` semantics unchanged. No change to tab-switch persistence (`mem://tech/app-stability/tab-switch-persistence`).
- No change to the `user_roles` query — single-role-per-user model already enforced (`mem://auth/role-system`).

---

### 3.2 — `ClinicProtectedRoute` component

New file: `src/components/ClinicProtectedRoute.tsx`

- Mirror the structure of existing `ProtectedRoute.tsx` (loading state, redirect to `/auth`).
- Accept prop `requiredRole?: 'ops_or_admin' | 'special_admin'` (default `'ops_or_admin'`).
- While `rolesLoading`, render a centered spinner (no flicker, no premature redirect).
- If unauthenticated → redirect `/auth?redirect=<current-path>`.
- If role check fails → redirect `/staff/dashboard` (graceful fallback inside the portal, not a hard 403 page).
- No clinic routes are wired yet — this component is created but not yet used in `App.tsx`. That wiring happens in Step 4 alongside the actual clinic pages.

---

### 3.3 — Soft-delete helper module

New file: `src/lib/clinic/softDelete.ts`

- Export `softDelete(table, id)` — a typed wrapper that performs `update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq('id', id)`.
- Restrict the `table` argument to a string-literal union of the four soft-deletable tables: `'consultations' | 'consultation_items' | 'payments' | 'queue_entries'`.
- Resolve `user.id` from the current Supabase session (`supabase.auth.getUser()`); throw a typed error if no session — RLS would reject anyway, but failing fast gives better DX.
- Return `{ data, error }` matching Supabase client conventions so callers can `if (error) toast(...)` uniformly.
- Add JSDoc noting that this is the **only** sanctioned way to delete from these four tables — DB-level DELETE is now blocked by RLS (Migration 3).

---

### 3.4 — Voided records query helper

Same file: `src/lib/clinic/softDelete.ts`

- Export `fetchVoided(table)` — gated query that returns soft-deleted rows. Will return empty array for non-`special_admin` users due to RLS; no client-side role check needed (DB is the source of truth).
- Used in Step 5 by the voided-records admin page.

---

### Out of scope for Step 3

- `App.tsx` route additions (clinic routes don't exist yet — added in Step 4 with the pages).
- Any clinic page (`PatientsList`, `QueueBoard`, `ConsultationEditor`, etc.).
- Inventory UI (Stock / Allocated / Available columns).
- Edge functions (`intake-bridge`, `einvoice-submit`, etc.).
- `package.json` additions.
- Voided-records admin page UI (the data-layer helper is here; the page is Step 5).

### Verification after Step 3

1. TypeScript compiles cleanly.
2. `useAuth()` exposes `isOpsOrAdmin` / `isSpecialAdmin` booleans.
3. `ClinicProtectedRoute` renders a spinner while `rolesLoading`, then routes correctly.
4. `softDelete('consultations', '<id>')` produces a network call with the expected `update` payload (manual smoke test only — no clinic UI to call it from yet).

**Stop after these three files. Do not begin Step 4 (clinic page port).**
