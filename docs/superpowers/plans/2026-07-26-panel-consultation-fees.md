# Panel Consultation Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably seed every new consultation with the visit panel's configured consultation fee, falling back to the clinic cash fee when the panel fee is blank.

**Architecture:** Put the pricing decision in a pure TypeScript resolver used by consultation creation, and mirror it in the existing Supabase insert trigger as a database safety net. The queue entry's `panel_id` is authoritative for the visit; `null` and `0` remain distinct.

**Tech Stack:** React 18, TypeScript, React Query, React Hook Form, Zod, Supabase/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Blank panel fee means the clinic's default cash consultation fee.
- `0.00` is a valid panel fee.
- Cash visits remain unchanged.
- Existing consultation items and completed bills are never repriced.
- Use the queue visit's panel, not the patient's saved default panel.
- Follow red-green-refactor: every production behavior starts with a failing test.

## File Map

- Create `src/lib/clinic/resolveConsultationFee.ts`: pure pricing rule.
- Create `src/hooks/clinic/useVisitConsultationFee.ts`: fetch the queue visit's panel fee and resolve the seed value.
- Modify `src/components/clinic/settings/PanelDialog.tsx`: clear field label, copy, and validation.
- Modify `src/pages/clinic/ConsultationDetail.tsx`: wait for fee resolution and seed the resolved amount.
- Create `supabase/migrations/20260726090000_reliable_panel_consultation_fee.sql`: enforce the rule for all insert paths.
- Create focused tests under `src/test/`.

---

### Task 1: Pure consultation-fee resolver

**Files:**
- Create: `src/lib/clinic/resolveConsultationFee.ts`
- Test: `src/test/resolve-consultation-fee.test.ts`

**Interfaces:**
- Produces: `resolveConsultationFee(input: ConsultationFeeInput): ConsultationFeeResolution`
- Input: `{ panelId: string | null; panelFee: number | null; cashFee: number }`
- Output: `{ amount: number; source: 'panel' | 'cash-fallback' | 'cash' }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { resolveConsultationFee } from '@/lib/clinic/resolveConsultationFee';

describe('resolveConsultationFee', () => {
  it('uses a configured panel fee', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: 18, cashFee: 35 }))
      .toEqual({ amount: 18, source: 'panel' });
  });

  it('preserves a zero panel fee', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: 0, cashFee: 35 }))
      .toEqual({ amount: 0, source: 'panel' });
  });

  it('falls back to cash when the panel fee is blank', () => {
    expect(resolveConsultationFee({ panelId: 'panel-1', panelFee: null, cashFee: 35 }))
      .toEqual({ amount: 35, source: 'cash-fallback' });
  });

  it('uses cash pricing for a cash visit even if a panel fee is supplied', () => {
    expect(resolveConsultationFee({ panelId: null, panelFee: 18, cashFee: 35 }))
      .toEqual({ amount: 35, source: 'cash' });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/resolve-consultation-fee.test.ts`

Expected: FAIL because `resolveConsultationFee` does not exist.

- [ ] **Step 3: Implement the minimum resolver**

```ts
export interface ConsultationFeeInput {
  panelId: string | null;
  panelFee: number | null;
  cashFee: number;
}

export interface ConsultationFeeResolution {
  amount: number;
  source: 'panel' | 'cash-fallback' | 'cash';
}

export function resolveConsultationFee(input: ConsultationFeeInput): ConsultationFeeResolution {
  if (!input.panelId) return { amount: input.cashFee, source: 'cash' };
  if (input.panelFee !== null) return { amount: input.panelFee, source: 'panel' };
  return { amount: input.cashFee, source: 'cash-fallback' };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/resolve-consultation-fee.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clinic/resolveConsultationFee.ts src/test/resolve-consultation-fee.test.ts
git commit -m "feat: resolve panel consultation fees"
```

### Task 2: Visit-level fee query

**Files:**
- Create: `src/hooks/clinic/useVisitConsultationFee.ts`
- Test: `src/test/use-visit-consultation-fee.test.tsx`

**Interfaces:**
- Consumes: `resolveConsultationFee`
- Produces: `fetchVisitPanelFee(panelId: string | null): Promise<number | null>`
- Produces: `useVisitConsultationFee(panelId: string | null, cashFee: number)`

- [ ] **Step 1: Write a failing fetch-contract test**

Mock the Supabase fluent query and assert that a non-null panel ID reads exactly `consultation_fee_override` from `insurance_providers`, while a null panel ID returns `null` without querying.

```ts
expect(await fetchVisitPanelFee(null)).toBeNull();
expect(from).not.toHaveBeenCalled();

expect(await fetchVisitPanelFee('panel-1')).toBe(18);
expect(from).toHaveBeenCalledWith('insurance_providers');
expect(select).toHaveBeenCalledWith('consultation_fee_override');
expect(eq).toHaveBeenCalledWith('id', 'panel-1');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/use-visit-consultation-fee.test.tsx`

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: Implement the fetcher and hook**

```ts
export async function fetchVisitPanelFee(panelId: string | null): Promise<number | null> {
  if (!panelId) return null;
  const { data, error } = await supabase
    .from('insurance_providers')
    .select('consultation_fee_override')
    .eq('id', panelId)
    .single();
  if (error) throw error;
  return data.consultation_fee_override === null
    ? null
    : Number(data.consultation_fee_override);
}

export function useVisitConsultationFee(panelId: string | null, cashFee: number) {
  return useQuery({
    queryKey: ['visit-consultation-fee', panelId, cashFee],
    queryFn: async () =>
      resolveConsultationFee({
        panelId,
        panelFee: await fetchVisitPanelFee(panelId),
        cashFee,
      }),
    enabled: Number.isFinite(cashFee),
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/use-visit-consultation-fee.test.tsx`

Expected: PASS for null, positive, and zero database values.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/clinic/useVisitConsultationFee.ts src/test/use-visit-consultation-fee.test.tsx
git commit -m "feat: load visit panel consultation fee"
```

### Task 3: Clarify and validate the panel field

**Files:**
- Modify: `src/components/clinic/settings/PanelDialog.tsx`
- Test: `src/test/panel-dialog-consultation-fee.test.tsx`

**Interfaces:**
- Persists blank as `null`
- Persists `"0"` as numeric `0`

- [ ] **Step 1: Write failing UI tests**

Render the dialog with providers for React Query and assert:

```ts
expect(screen.getByLabelText('Default Panel Consultation Fee (RM)')).toBeInTheDocument();
expect(screen.getByText(/Leave this blank to use the clinic's default cash consultation fee/i))
  .toBeInTheDocument();
```

Submit once with an empty field and once with `0.00`; assert the update mutation receives `null` and `0`, respectively.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/panel-dialog-consultation-fee.test.tsx`

Expected: FAIL because the current label and help text do not match.

- [ ] **Step 3: Make the minimal UI change**

Change the field label to `Default Panel Consultation Fee (RM)`, placeholder to `Leave blank to use default cash fee`, and help text to:

```text
Automatically used for new consultations under this panel. Leave this blank to use the clinic's default cash consultation fee. RM 0.00 is allowed.
```

Add a non-negative constraint to the transformed schema:

```ts
consultation_fee_override: optionalNumber.pipe(z.number().min(0).nullable()),
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/panel-dialog-consultation-fee.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/clinic/settings/PanelDialog.tsx src/test/panel-dialog-consultation-fee.test.tsx
git commit -m "feat: clarify default panel consultation fee"
```

### Task 4: Seed the resolved fee during consultation creation

**Files:**
- Modify: `src/pages/clinic/ConsultationDetail.tsx`
- Test: `src/test/consultation-panel-fee-seeding.test.tsx`

**Interfaces:**
- Consumes: `useVisitConsultationFee(entry.panel_id, cashFee)`
- The automatic row retains the configured clinic fee name.

- [ ] **Step 1: Write failing integration tests**

Extract the automatic seed decision into:

```ts
export function buildConsultationFeeSeed(
  feeName: string,
  resolution: ConsultationFeeResolution,
): { item_name: string; quantity: 1; price: number } | null
```

Assert positive and zero fees create rows, while a blank fee name returns `null`:

```ts
expect(buildConsultationFeeSeed('Consultation Fee', { amount: 0, source: 'panel' }))
  .toEqual({ item_name: 'Consultation Fee', quantity: 1, price: 0 });
expect(buildConsultationFeeSeed('', { amount: 35, source: 'cash' })).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/consultation-panel-fee-seeding.test.tsx`

Expected: FAIL because `buildConsultationFeeSeed` does not exist.

- [ ] **Step 3: Implement and integrate**

Parse the cash preference once:

```ts
const cashFee = Number.parseFloat(getPreference('default_consultation_fee_price', '0'));
const visitPanelId = (entry as { panel_id?: string | null } | undefined)?.panel_id ?? null;
const visitFee = useVisitConsultationFee(visitPanelId, Number.isFinite(cashFee) ? cashFee : 0);
```

Do not create the consultation until preferences, consultation lookup, and visit-fee lookup have finished. In `onSuccess`, seed whenever the fee name is non-empty and the amount is `>= 0`; do not use `feePrice > 0`, because zero is valid.

- [ ] **Step 4: Verify GREEN and regression tests**

Run:

```bash
npm test -- src/test/consultation-panel-fee-seeding.test.tsx
npm test
```

Expected: focused and full suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/clinic/ConsultationDetail.tsx src/test/consultation-panel-fee-seeding.test.tsx
git commit -m "feat: seed panel consultation fee on visit"
```

### Task 5: Database safety net

**Files:**
- Create: `supabase/migrations/20260726090000_reliable_panel_consultation_fee.sql`
- Test: `src/test/panel-consultation-fee-migration.test.ts`

**Interfaces:**
- Replaces `public.trg_resolve_selling_price()`
- Preserves all existing inventory, service, package, tier, override, and medication-discount behavior.

- [ ] **Step 1: Write a failing migration contract test**

Read the migration file and assert it contains:

```ts
expect(sql).toContain('consultation_fee_override');
expect(sql).toContain('v_panel_id IS NOT NULL');
expect(sql).toContain('v_fee_override IS NOT NULL');
expect(sql).toContain('NEW.price := v_fee_override');
expect(sql).toContain('NEW.price := COALESCE(NEW.price, 0)');
```

Also assert the function still includes the three existing override lookups for `item_id`, `service_id`, and `package_id`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/test/panel-consultation-fee-migration.test.ts`

Expected: FAIL because the new migration does not exist.

- [ ] **Step 3: Add the migration**

Copy the current full `trg_resolve_selling_price()` definition from the latest migration. Preserve every existing branch. In the free-text branch, resolve the configured fee name and replace `NEW.price` only when:

```sql
v_panel_id IS NOT NULL
AND v_fee_override IS NOT NULL
AND (
  lower(trim(NEW.item_name)) = lower(trim(v_default_fee_name))
  OR lower(NEW.item_name) LIKE '%consultation fee%'
)
```

Do not use `COALESCE(v_fee_override, cash_fee)` in the trigger: the caller already supplies the cash fallback, and the trigger must not overwrite manual free-text prices when the panel fee is blank.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/test/panel-consultation-fee-migration.test.ts`

If a local Supabase stack is configured, also run `supabase db reset` and execute inserts for positive, zero, blank, and cash cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726090000_reliable_panel_consultation_fee.sql src/test/panel-consultation-fee-migration.test.ts
git commit -m "fix: enforce panel consultation fee pricing"
```

### Task 6: Final verification and deployment

**Files:**
- Modify generated types only if the Supabase schema generator produces a diff.

- [ ] **Step 1: Run quality gates**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0 with no new warnings attributable to this feature.

- [ ] **Step 2: Apply the migration to the linked production project**

Run: `supabase db push`

Expected: `20260726090000_reliable_panel_consultation_fee.sql` is applied successfully.

- [ ] **Step 3: Commit generated types if needed**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: refresh Supabase types"
```

Skip this commit when the file is unchanged.

- [ ] **Step 4: Push and monitor deployment**

```bash
git push origin main
gh run list --limit 5
gh run watch <deployment-run-id> --exit-status
```

- [ ] **Step 5: Production smoke test**

Verify four new consultations:

1. Panel fee `RM 18.00` produces `RM 18.00`.
2. Panel fee `RM 0.00` produces `RM 0.00`.
3. Blank panel fee uses the configured cash fee.
4. Cash registration uses the configured cash fee.

Confirm existing completed bills remain unchanged.

