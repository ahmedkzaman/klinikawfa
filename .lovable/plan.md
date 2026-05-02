# Cost Confidentiality for Services + Packages, and Guest Route Firewall

## Context
- `services` and `packages` both have `USING (true)` SELECT, leaking cost columns to locums/guests.
- Mirror the inventory pattern: lock base table to cost-aware roles, expose a definer-mode safe view that omits cost columns.
- Add an explicit guest-eject in the staff/clinic route guards. Guests stay quarantined to public marketing pages and `/video-call*`.

Verified columns:
- **services**: `id, name, type, description, cost, price_to_patient, status, created_at, standard_panel_price, category, item_code` → safe view omits `cost`, `standard_panel_price`.
- **packages**: `id, name, stock, price, items, status, created_at, cost, standard_panel_price` → safe view omits `cost`, `standard_panel_price`.

## 1. Migration: `sprint4_financials_rls_view.sql`

```sql
-- SERVICES
drop policy if exists "Services are viewable by everyone" on public.services; -- adjust name to actual policy
create policy "Cost-aware roles can read services"
on public.services for select to authenticated
using (public.can_view_inventory_costs(auth.uid()));

create or replace view public.services_safe as
select id, name, type, description, price_to_patient,
       status, category, item_code, created_at
from public.services;
grant select on public.services_safe to authenticated;

-- PACKAGES
drop policy if exists "Packages are viewable by everyone" on public.packages; -- adjust name to actual policy
create policy "Cost-aware roles can read packages"
on public.packages for select to authenticated
using (public.can_view_inventory_costs(auth.uid()));

create or replace view public.packages_safe as
select id, name, stock, price, items, status, created_at
from public.packages;
grant select on public.packages_safe to authenticated;
```

The actual current SELECT policy names will be looked up at apply time and dropped accordingly. INSERT/UPDATE/DELETE policies (already restricted to ops/admin/staff) remain untouched. Both views run with definer rights (no `security_invoker`) so locums bypass base-table RLS but only see non-cost columns.

## 2. New read-only hooks

### `src/hooks/clinic/useServices.ts`
Add alongside existing exports:
```ts
export function useServicesSafe() {
  return useQuery({
    queryKey: ['services_safe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services_safe').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

### `src/hooks/clinic/usePackages.ts`
```ts
export function usePackagesSafe() {
  return useQuery({
    queryKey: ['packages_safe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packages_safe').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

Existing `useServices()` / `usePackages()` and admin mutation hooks remain — they're only used from admin/ops settings screens already gated by route guards.

## 3. Consultation picker swap (`src/pages/clinic/ConsultationDetail.tsx`)
Lines 138–139:
```ts
const { data: services = [] } = useServicesSafe();
const { data: packages = [] } = usePackagesSafe();
```
Picker only reads `id, name, category, price_to_patient`/`price` — selling price is resolved server-side by `trg_resolve_selling_price`, so cost columns aren't needed.

## 4. Guest firewall

### `src/components/ClinicProtectedRoute.tsx`
Pull `role` from `useAuth()` and add right after the unauth redirect:
```tsx
if (role === 'guest') {
  return <Navigate to="/" replace />;
}
```

### `src/components/ProtectedRoute.tsx`
Same explicit eject in both `requireAdmin` and `requireStaffOrAdmin` branches:
```tsx
if (role === 'guest') {
  return <Navigate to="/" replace />;
}
```

`/video-call` and `/video-call/staff` in `App.tsx` are NOT wrapped in these guards (verified), so guests retain teleconsultation access.

## 5. Type regeneration
`src/integrations/supabase/types.ts` regenerates automatically once the migration is applied — both new views become typed.

## 6. Security finding cleanup
- Mark `services_cost_open_read` and `packages_cost_open_read` as fixed.
- Update `@security-memory` to record:
  - Safe-view pattern now also covers `services` and `packages`.
  - Guest quarantine rule: guests may only access public marketing routes and `/video-call*`.

Out of scope this pass: `inventory_adjustments_open_read`, `stock_takes_open_read`, `inventory_item_prices_open_read`, markdown XSS, publish-scheduled-posts auth, charge-additional role check, blog-gen role check, public bucket listing, definer-executable warnings.

## Verification
1. Apply migration.
2. As a locum: `select * from services` and `select * from packages` → 0 rows; `_safe` views → full list without cost columns.
3. Open a consultation as a locum: service and package pickers populate and items can be added.
4. As a guest: `/clinic/...` redirects to `/`; `/video-call?room=...` still works.
5. As admin: Inventory Settings still shows full cost / standard panel prices for both services and packages.
