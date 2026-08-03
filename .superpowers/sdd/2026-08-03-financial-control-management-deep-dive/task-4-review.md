# Task 4 Review: Management Shell, Summary, And Reconciliation

Reviewed range: `0ee3f08ddc653c79aa0a0d6a49dfdcc82ae367be..ed397f4b9adedc13a97a72c9d1bf34b7e800deac`

## Findings

### Critical

None.

### Important

1. **Comparison-period attribution and cost incompleteness is not surfaced.**
   The warning gate reads only `data.period.attributionComplete` and
   `data.period.costComplete` (`src/components/clinic/insight/management/FinancialControlTab.tsx:113`),
   while every KPI consumes the comparison period's numeric value and renders a
   directional percentage (`src/components/clinic/insight/management/FinancialSummaryStrip.tsx:167`).
   A comparison can have `costComplete: false` with non-null COGS, gross profit,
   and margin because the server preserves known subtotals when some costs are
   missing. In that valid response, the page presents precise up/down comparisons
   against a partial baseline without telling the manager that comparison-period
   attribution or cost is incomplete. Surface the comparison flags with the
   preceding-period label, and add a fixture where the selected period is complete
   but the comparison is not.

### Minor

1. **Attribution-only incompleteness produces a contradictory cost message.**
   When `costComplete` is false, the UI always says `Cost data incomplete for N
   items` (`src/components/clinic/insight/management/FinancialControlTab.tsx:119`).
   The server also sets `costComplete` false whenever visit attribution is
   incomplete, so a valid response can contain `costComplete: false` and
   `missingCostItems: 0`. The resulting `Cost data incomplete for 0 items` does not
   explain that cost completeness cannot be established for unattributed visits.
   Distinguish known missing-cost items from cost status that is unknown because of
   incomplete attribution.

2. **The comparison tests omit negative baselines and boundary date labels.**
   The edge-case test covers null and zero values only
   (`src/test/financial-control-components.test.tsx:194`), despite comparison
   direction also accepting negative accounting values and labels that can cross
   month or year boundaries. Static inspection found the absolute-denominator math
   finite and directionally consistent, and the equal-period calculation is
   correct, but focused regression fixtures should pin those cases down. The
   submitted evidence also contains no rendered desktop/mobile screenshot, leaving
   responsive behavior supported by class inspection rather than a visual check.

## Verdict

**Changes requested.** The Management shell preserves the six existing Insight
tabs and their content, passes the selected dates directly, renders only Financial
Control, and keeps loading, empty, and error states local. Billed revenue and period
cash are distinct, reconciliation uses separate billed-cohort, period-cash, and
outstanding rails, null values remain `Unavailable`, and selectable KPI buttons emit
the correct metric enums with button semantics, visible focus styling, and
`aria-pressed` state. No Task 5 or Task 6 behavior leaked into the patch.

The Important finding prevents approval because incomplete comparison data can be
presented as a precise financial trend without its server-provided quality warning.
The new layouts otherwise use stable responsive grids, wrapping/min-width guards,
8px-or-smaller radii, and the existing Insight palette without an evident overlap
defect in static inspection.

## Tests

- `npm.cmd test -- src/test/insight-management-tab.test.tsx src/test/financial-control-components.test.tsx`
  - Exit 0: 2 files passed, 10 tests passed.
- `npm.cmd test -- src/test/financial-control-lib.test.ts src/test/use-financial-control.test.tsx`
  - Exit 0: 2 files passed, 52 tests passed.
- `npx.cmd eslint src/pages/clinic/Insight.tsx src/components/clinic/insight/management src/test/insight-management-tab.test.tsx src/test/financial-control-components.test.tsx`
  - Exit 0: no lint errors or warnings.
- `npx.cmd tsc --noEmit`
  - Exit 0: no TypeScript errors.
- `npm.cmd run build`
  - Exit 0: 5,303 modules transformed; existing Browserslist, browser externalization,
    CommonJS, large-chunk, and ineffective dynamic-import warnings remain.
- `git diff --check 0ee3f08ddc653c79aa0a0d6a49dfdcc82ae367be..ed397f4b9adedc13a97a72c9d1bf34b7e800deac`
  - Exit 0: no whitespace errors.

## Reviewed Commits

- Base: `0ee3f08ddc653c79aa0a0d6a49dfdcc82ae367be`
- Head: `ed397f4b9adedc13a97a72c9d1bf34b7e800deac`
