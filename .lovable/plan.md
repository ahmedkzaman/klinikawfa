## Problem

When you click **Add Panel** or **Edit** on `/clinic/settings/panels`, the form fails Zod validation with errors like:

```
Expected string, received null  →  panel_code, price_tier, verification_link,
claim_due_date_type, tin_number, company_name, company_reg_number,
person_in_charge, phone, email, address_line_1, address_line_2, postcode, ...
```

### Root cause

In `src/components/clinic/settings/PanelDialog.tsx`, every optional text field uses this Zod helper:

```ts
const optionalString = z.string().trim().max(255).optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));
```

This schema accepts `string | undefined | ""` but **rejects `null`**. The form receives `null` values in two situations:

1. **Editing an existing panel** — Supabase rows return `null` for empty optional columns (`panel_code`, `phone`, etc.). Even though `form.reset()` coerces with `?? ''`, React Hook Form re-runs validation on the `defaultValues` reference, and after the first successful submit the in-memory state holds the transformed `null` values, which then fail the input-side schema check on the next render/submit.
2. **Re-opening the dialog** after a save — same mechanism.

The result: the submit button never reaches the mutation, no row is inserted/updated, and you see no toast (errors are silently captured by RHF and surfaced as the runtime errors you're seeing).

## Fix

Update the optional-string helper(s) to also accept `null` and normalize everything (`null | undefined | ''`) to `null` for the DB:

```ts
const optionalString = z
  .union([z.string().trim().max(255), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));
```

Apply the same pattern to the inline `price_tier` schema (lines 51-57), which has the identical bug.

Also remove the unnecessary `schema.parse(values)` call inside `onSubmit` (line 147) — `zodResolver` has already parsed and transformed the values, so calling `.parse()` again on transformed output is wasted work. Just use `values` directly.

### Additional small fix (visible in console)

The console also shows:

```
Warning: Function components cannot be given refs… Check the render method of `PanelDialog`.
```

This comes from `<DialogFooter>` receiving a ref via `<form>` children context — harmless, but caused by the same component. We won't change `DialogFooter` (it's a shared UI primitive). The Zod fix above is what unblocks panel creation.

## Files to change

- `src/components/clinic/settings/PanelDialog.tsx`
  - Replace `optionalString` definition (lines 38-44).
  - Replace inline `price_tier` schema (lines 51-57) with `optionalString` (max 60 → use a separate helper or inline the same union pattern with `max(60)`).
  - Simplify `onSubmit` to pass `values` directly to mutations instead of re-parsing.

## Verification

After the fix:
1. Open `/clinic/settings/panels` → click **Add Panel** → fill only "Panel Name" (e.g. `Allianz`) → click **Create panel** → row appears in the table with toast "Panel created".
2. Click **Edit** on the new row → no Zod errors in console → change the name → **Save changes** works.
3. Re-open the same row a second time → still works (no `null` rejection on re-validation).
