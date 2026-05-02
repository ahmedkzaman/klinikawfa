# Restrict Inventory Cost Visibility (Locums)

## Goal
Stop locum (and guest) accounts from reading `cost_price`, `standard_panel_price`, and tier prices on `public.inventory_items`, while keeping the consultation item picker functional for them via a non-cost view.

## 1. Database migration

Create `supabase/migrations/<ts>_inventory_rls_view.sql`:

- `DROP POLICY` the current permissive `USING (true)` SELECT on `public.inventory_items`.
- Create helper:
  ```sql
  create or replace function public.can_view_inventory_costs(_user_id uuid)
  returns boolean language sql stable security definer set search_path=public as $$
    select exists (
      select 1 from public.user_roles
      where user_id = _user_id
        and role in ('admin','special_admin','doctor_admin','operations','staff')
    )
  $$;
  ```
- New SELECT policy on `inventory_items`:
  ```sql
  create policy "Cost-aware roles can read inventory"
  on public.inventory_items for select to authenticated
  using (public.can_view_inventory_costs(auth.uid()));
  ```
- Create the safe view (definer default — no `security_invoker`):
  ```sql
  create or replace view public.inventory_items_safe as
  select id, name, item_code, brand, uom, category, groups, is_otc, status,
         stock, allocated_quantity, stock_amount_warning, nearest_expiry_date,
         price_to_patient_max, price_to_patient_min,
         default_indication, default_dosage_qty, default_dosage_unit,
         default_frequency, default_instruction, default_duration,
         default_duration_unit, default_precaution,
         archived_at, created_at, updated_at
  from public.inventory_items;

  grant select on public.inventory_items_safe to authenticated;
  ```
  Because the view runs with definer rights, locums bypass the base table RLS but only see non-cost columns.

Existing INSERT/UPDATE/DELETE policies (already restricted to admin/staff) remain untouched, as do the inventory triggers (they run as definer).

## 2. Regenerated types
`src/integrations/supabase/types.ts` will auto-regenerate to include `inventory_items_safe`.

## 3. New frontend hook
In `src/hooks/clinic/useInventoryItems.ts`, add alongside the existing hook:
```ts
export function useInventoryItemsSafe() {
  return useQuery({
    queryKey: ['inventory_items_safe'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items_safe')
        .select('*')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

## 4. Consultation picker swap
In `src/pages/clinic/ConsultationDetail.tsx` (line 134), replace `useInventoryItems()` with `useInventoryItemsSafe()` and adapt the destructure: `const { data: inventoryItems = [] } = useInventoryItemsSafe();`. The picker only reads `id`, `name`, `category`, `price_to_patient_max`, etc. — no cost field is required there (consultation pricing is resolved server-side by `trg_resolve_selling_price`).

Other surfaces (`Inventory.tsx`, `InventorySettings.tsx`, `Procurement`, `POLineItemsTable`, `ItemEditSheet`, `InventoryItemDialog`, `StockTakePanel`) continue using the base table and remain accessible only to admin/ops/staff via existing route guards.

## 5. Security finding cleanup
- Mark `supabase_lov / inventory_items_cost_price_readable` as fixed.
- Append a note to `@security-memory` recording the cost-visibility rule and the safe-view pattern.

## Verification (after switch back to default mode)
1. Apply migration.
2. As a locum: query `inventory_items` → expect 0 rows; query `inventory_items_safe` → expect full list without cost columns.
3. Open a consultation as a locum and confirm the item picker populates and lets them add items.
4. As admin: confirm Inventory dashboard, Procurement, and Settings still show cost data.

## Out of scope
The other findings in the panel (markdown XSS, publish-scheduled-posts, charge-additional role check, public bucket listing, definer-executable warnings) — handled separately.
