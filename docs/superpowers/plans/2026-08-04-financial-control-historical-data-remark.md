# Financial Control Historical Data Remark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an accurate historical-data remark whenever Financial Control reports incomplete attribution.

**Architecture:** Extend the existing amber attribution-status area in `FinancialControlTab` with static explanatory copy. Drive visibility from the existing `data.period.attributionComplete` value, so no new API or database contract is required.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- The remark is informational and must not alter financial calculations.
- Show it only when the selected period has incomplete attribution.
- Preserve all existing retry, detail, export, and reconciliation behaviour.
- Keep the content readable on mobile and desktop without adding a card or modal.

---

### Task 1: Add the conditional historical-data remark

**Files:**
- Modify: `src/components/clinic/insight/management/FinancialControlTab.tsx`
- Test: `src/test/financial-control-components.test.tsx`

**Interfaces:**
- Consumes: `FinancialControlSummary.period.attributionComplete: boolean`
- Produces: Conditional explanatory text inside the existing attribution-status area

- [ ] **Step 1: Write the failing component test**

Extend the incomplete-attribution test to expect:

```tsx
expect(screen.getByText(/Historical data note:/)).toHaveTextContent(
  'Older completion and payment dates were inferred from existing queue and transaction timestamps.',
);
```

Add an assertion to a fully attributed render:

```tsx
expect(screen.queryByText(/Historical data note:/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-components.test.tsx
```

Expected: FAIL because the historical-data remark is not rendered.

- [ ] **Step 3: Add the minimal conditional remark**

Inside the existing amber attribution-status area, render this paragraph only when `!data.period.attributionComplete`:

```tsx
<p className="basis-full text-xs leading-5 text-amber-900">
  <span className="font-semibold">Historical data note:</span>{' '}
  Financial Control was introduced after these visits were completed. Older completion and
  payment dates were inferred from existing queue and transaction timestamps. Figures are
  usable for management insights but may not match the exact original completion time.
</p>
```

- [ ] **Step 4: Run focused and production verification**

Run:

```powershell
npx.cmd vitest run --pool=threads --fileParallelism=false --maxWorkers=1 src/test/financial-control-components.test.tsx
npx.cmd tsc --noEmit
npm.cmd run lint:changed
npm.cmd run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Commit and deploy**

```powershell
git add src/components/clinic/insight/management/FinancialControlTab.tsx src/test/financial-control-components.test.tsx
git commit -m "feat: explain inferred financial history"
git push origin HEAD:main
```

Monitor the Security Gate and GitHub Pages workflows until both succeed.
