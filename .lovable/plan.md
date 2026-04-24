## Plan

Update the catalog management implementation so edits cannot create invalid pricing ranges or silently drop `status` values.

### Files to update

1. `src/hooks/clinic/useInventoryItems.ts`
- Keep the existing default export intact.
- Update the named hook payload mapping so `selling_price` writes to both `price_to_patient_max` and `price_to_patient_min` on both add and edit.
- This keeps the interim pricing floor and ceiling equal until the later pricing engine is built.

2. `src/hooks/clinic/useServices.ts`
- Keep the existing default export intact.
- Extend the named hook payload mapper to preserve `status` when present.
- Leave existing `name`, `cost`, and `price -> price_to_patient` mapping unchanged.

3. `src/hooks/clinic/usePackages.ts`
- Keep the existing default export intact.
- Extend the named hook payload mapper to preserve `status` when present.
- Leave existing `name`, `cost`, and `price` mapping unchanged.

4. `src/components/clinic/settings/InventoryItemDialog.tsx`
- Refactor from local `useState` to `react-hook-form` + `zod`.
- Use an empty-string-safe number parser so clearing an input does not coerce to `0`.
- Validate: `name`, `cost_price`, `selling_price`, `current_stock`, `status`.
- Keep monetary inputs at `step="0.01"` and stock at `step="1"`.
- Disable submit while pending, show success/error toasts, and close on success.

5. `src/components/clinic/settings/ServiceDialog.tsx`
- Refactor to `react-hook-form` + `zod`.
- Include `status: z.enum(['active', 'inactive']).optional()` so edit payloads can round-trip the existing status safely.
- Keep the dialog UI focused on `name`, `cost`, and `price` while hydrating status from the loaded row for edits.
- Use empty-string-safe parsing for monetary fields.

6. `src/components/clinic/settings/PackageDialog.tsx`
- Refactor to `react-hook-form` + `zod`.
- Include `status: z.enum(['active', 'inactive']).optional()` so edit payloads can round-trip the existing status safely.
- Keep the dialog UI focused on `name`, `cost`, and `price` while hydrating status from the loaded row for edits.
- Use empty-string-safe parsing for monetary fields.

7. `src/pages/clinic/settings/InventorySettings.tsx`
- Pass the existing `status` value into Service and Package edit dialogs so it survives updates.
- Keep the current tabs, table layout, RM formatting, and row actions intact.
- Align the back button icon/text with the current clinic settings pattern if needed.

### Technical details

- Number validation will use `z.preprocess` to convert `''` to `undefined`, so blank monetary fields fail validation instead of becoming `0`.
- Inventory price mapping will be:
  - Add: `selling_price -> price_to_patient_min + price_to_patient_max`
  - Edit: `selling_price -> price_to_patient_min + price_to_patient_max`
- Service price mapping stays `price -> price_to_patient`.
- Status preservation requires all three layers to agree:
  ```text
  InventorySettings row data
      -> Dialog default values / schema
      -> Named update hook payload mapper
  ```
  Without all three, `status` can still be dropped during edit.

### Verification
- Run `npx tsc --noEmit` after the edits.
- Confirm the following behaviors:
  - clearing a money field shows validation instead of saving `0`
  - editing an inventory selling price keeps min/max equal
  - editing a service or package price does not alter existing `status`
  - dialogs disable submit while mutations are pending