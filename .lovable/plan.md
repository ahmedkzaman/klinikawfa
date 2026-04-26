
# Step 30 — Drug Label Settings

Build a configuration page where Ops/Admin can toggle which fields appear on printed medicine labels, backed by a singleton DB row, with a live preview that mimics a 60×50mm thermal label.

## A. Database Migration (`<ts>_drug_label_settings.sql`)

Create `public.drug_label_settings` as a singleton table:
- Columns: `id uuid PK`, eight `show_*` booleans (default `true`, `NOT NULL`), `singleton boolean NOT NULL DEFAULT true UNIQUE` (locks the table to exactly one row), `updated_at timestamptz NOT NULL DEFAULT now()`.
- Enable RLS:
  - **SELECT**: any authenticated user (so future print-time reads work for all clinic staff).
  - **INSERT / UPDATE**: `public.is_ops_or_admin(auth.uid())`.
  - **DELETE**: not granted (singleton must always exist).
- Seed: `INSERT INTO public.drug_label_settings (singleton) VALUES (true);`
- Trigger: `BEFORE UPDATE ... EXECUTE FUNCTION public.update_updated_at_column();` to keep `updated_at` fresh.

## B. Data Hook — `src/hooks/clinic/useDrugLabelSettings.ts`

- `useDrugLabelSettings()` — `useQuery(['drug-label-settings'])`, fetches the singleton via `.eq('singleton', true).maybeSingle()`.
- `useUpdateDrugLabelSettings()` — `useMutation` that updates the row by `singleton = true`. Uses **optimistic update** against the `['drug-label-settings']` cache so the preview reacts instantly; rolls back + toasts on error.

## C. Settings UI — `src/pages/clinic/settings/DrugLabelSettings.tsx`

Two-column responsive grid: `grid-cols-1 lg:grid-cols-2 gap-6`.

### Left pane — Properties
Card titled **"Label Properties"** with two sections:

- **Required (always on)** — render as checked + disabled `Checkbox` with a small `Badge` reading "Required":
  - Clinic Name, Medication, Patient Details, Instruction.
- **Toggleable** — `Checkbox` rows that map 1:1 to columns:
  - `show_address` → Address
  - `show_tel_number` → Tel Number
  - `show_precaution` → Precaution
  - `show_quantity` → Quantity
  - `show_date` → Date
  - `show_expiry_date` → Expiry Date
  - `show_duration` → Duration
  - `show_indication` → Indication
- Each toggle calls the optimistic mutation immediately on `onCheckedChange`.
- Skeleton state while the singleton row is loading.

### Right pane — Live Preview
- Sticky white card, `aspect-ratio: 60 / 50`, max width ~`360px`, thin border, mono/Inter blend to feel like thermal output.
- Placeholder data:
  - Clinic = "Klinik Awfa", Tel = "+60 18-252 3531", Address = "B2 & B4, Jalan IM 16/1, Kota SAS, 25200 Kuantan, Pahang"
  - Patient = "Ali Bin Abu", Age/Gender = "34 / M"
  - Med = "PARACETAMOL 500MG TABLET"
  - Qty = "10 Tab/s", Expiry = "12/2027", Duration = "5 Days"
  - Indication = "FEVER", Precaution = "TAKE AFTER MEALS"
  - Instruction = "1 TABLET, 3X DAILY"
- Sections (each conditional piece uses `{settings.show_xxx && (...)}` for instant reactivity):
  1. **Header** (centered): bold Clinic Name. Optional Tel line. Optional Address line.
  2. Divider (`border-t`).
  3. **Mid**: Bold ~11pt medication name. Right-aligned row with `QTY: 10 Tab/s` (if `show_quantity`) and `EXP: 12/2027` (if `show_expiry_date`).
  4. **Instructions**: centered dosage line (always). Optional small "For: FEVER" line (`show_indication`). Optional italic precaution line (`show_precaution`).
  5. **Footer**: Patient + Age/Gender (always). Optional date stamp (`show_date`). Optional duration chip (`show_duration`).

## D. Navigation & Routing

- **`src/App.tsx`** — import `DrugLabelSettings` and add inside the `/clinic` block:
  ```tsx
  <Route
    path="settings/drug-label"
    element={
      <ClinicProtectedRoute requiredRole="ops_or_admin">
        <DrugLabelSettings />
      </ClinicProtectedRoute>
    }
  />
  ```
- **`src/pages/clinic/settings/SettingsPage.tsx`** — append to the `cards` array (using `Tag` from `lucide-react`):
  ```ts
  {
    href: '/clinic/settings/drug-label',
    title: 'Drug Label',
    description: 'Choose which fields appear on printed medicine labels.',
    icon: Tag,
    visible: isOpsOrAdmin,
  }
  ```

## Files Touched
- **New**: `supabase/migrations/<ts>_drug_label_settings.sql`
- **New**: `src/hooks/clinic/useDrugLabelSettings.ts`
- **New**: `src/pages/clinic/settings/DrugLabelSettings.tsx`
- **Edited**: `src/App.tsx` (route + import)
- **Edited**: `src/pages/clinic/settings/SettingsPage.tsx` (nav card + `Tag` icon import)

## Out of Scope (intentionally deferred)
Wiring these toggles into the actual `print:block` label markup inside `VisitDetailsColumn.tsx` — this step ships only the configuration surface + live preview so the existing Yezza-style print flow from Step 29 stays untouched. Print-template integration will be a follow-up step.
