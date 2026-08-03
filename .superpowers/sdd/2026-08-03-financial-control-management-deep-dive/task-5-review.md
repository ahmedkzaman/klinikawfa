# Task 5 Independent Review: Alerts, Margin Analysis, And Visit-Level Drill-Down

## Findings

### [P2] Reset the detail page when the selected date range changes

`src/components/clinic/insight/management/FinancialControlTab.tsx:116`

The component keeps `page` state across `startDate` and `endDate` prop changes. If a
user is on a later detail page and changes the Insight date range, the detail RPC is
called for that same page in the new range. A smaller result can therefore show an
empty-state message and an impossible indicator such as `Page 3 of 1`, even though
matching rows exist on page 1. Metric, alert, group, and page-size changes reset the
page correctly, but the report date filter does not. Reset `page` to 1 when either
date changes, and cover the range-change case with an interaction test.

### [P2] Restore keyboard focus to the control that opened the detail sheet

`src/components/clinic/insight/management/FinancialDetailSheet.tsx:72`

The non-modal Radix sheet is controlled directly and has no `SheetTrigger` or
explicit close-focus handler. Radix therefore has no trigger reference to focus when
the close button or Escape removes the sheet; its non-modal close handler prevents
the default restoration even when that reference is absent. Keyboard focus falls
back to the document instead of returning to the KPI or alert `View` button, so the
user loses their place in the operational table. Register the launcher as the
trigger or explicitly restore focus, and add a keyboard close/focus-restoration test.

## Spec And Quality Verdict

**Changes requested.** Task 5 is otherwise closely scoped and substantially
compliant, but the pagination and keyboard-focus defects above should be fixed before
acceptance.

Confirmed compliant behavior:

- All ten server alert keys render and are sorted by severity, amount, oldest age,
  and stable key without mutating the response.
- Alert `View` selects the exact alert enum and opens visit-level details while the
  Task 4 summary and reconciliation remain mounted.
- Client metric, grouping, alert, page, and page-size arguments match the exact
  `get_financial_control_details` server enums and limits. Metric, alert, grouping,
  and page-size changes reset to page 1.
- Detail loading, zero-row, and error states stay scoped to the detail sheet.
- Previous and Next have stable dimensions and correct disabled boundaries for a
  valid current page; page size is limited to 25, 50, or 100.
- Visit and bill links use `queueEntryId`, match the required destinations exactly,
  and are omitted when the queue reference is unavailable.
- The new components render typed financial fields only. No clinical-note,
  diagnosis, attachment, or consultation-note fetch was introduced.
- Tables have horizontal overflow containment, controls have accessible names and
  visible focus styles, and severity is not communicated by color alone.
- No Task 6 CSV export, download, multi-page export, retry, or refetch behavior was
  introduced.

## Verification

- `npm.cmd test -- src/test/financial-control-components.test.tsx`: PASS, 16 tests.
- `npm.cmd test -- src/test/use-financial-control.test.tsx`: PASS, 50 tests.
- `npx.cmd eslint src/components/clinic/insight/management src/test/financial-control-components.test.tsx`: PASS.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run build`: PASS, 5,306 modules transformed. Existing dependency,
  Browserslist, dynamic-import, and chunk-size warnings remain.
- `git diff --check 008977eada3e49c0df87e85591133609e8e31f7d e598810f609440b87ca5fbc6bad8e6cf79c22625`: PASS.

Review scope: `008977eada3e49c0df87e85591133609e8e31f7d` through
`e598810f609440b87ca5fbc6bad8e6cf79c22625`.
