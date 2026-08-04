# Financial Control Historical Data Remark

## Purpose

Explain why some Financial Control figures use inferred historical timestamps without hiding otherwise usable management insights.

## Placement

Show the remark inside the existing amber attribution-status area in `FinancialControlTab`. It appears only when the selected period reports incomplete attribution, keeping fully exact future reports uncluttered.

## Copy

**Historical data note:** Financial Control was introduced after these visits were completed. Older completion and payment dates were inferred from existing queue and transaction timestamps. Figures are usable for management insights but may not match the exact original completion time.

## Behaviour

- The remark is informational and does not change calculations.
- It is shown alongside the existing incomplete-visit and cost-completeness messages.
- It remains readable on mobile and desktop without introducing a new card or modal.
- Existing retry, detail, export, and reconciliation behaviour remains unchanged.

## Verification

Add a component test that confirms the remark appears for incomplete attribution and is absent for fully attributed periods. Run the focused Financial Control component tests, TypeScript checking, changed-file linting, and the production build.
