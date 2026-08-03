# Final Independent Review: Financial Control Management Deep Dive

Reviewed `692690a6b203eff122c8ec098c1a765d89c60a8d..67620d06089e489d816992058fda9bd16ad33c1c` against the approved design, implementation plan, ledger, and prior task reviews. Previously approved findings are not repeated.

## Findings

### [P1] Cash-collected drill-downs and CSVs present lifetime paid value instead of period cash

`supabase/migrations/20260803100000_add_financial_control_reports.sql:319`

The `cash_collected` filter and hidden `amount` correctly use `paid_in_period`, but detail totals and the visible `paid` field use `paid_to_date` (`:384`, `:409`, `:537`, `:874`). `FinancialMarginTable` renders `row.paid` and the CSV serializer exports it (`src/components/clinic/insight/management/FinancialMarginTable.tsx:164`, `src/lib/clinic/financialControl.ts:537`). A bill with RM50 collected before the selected range and RM10 in-range therefore contributes RM10 to the KPI while its drill-down and CSV show RM60, so neither the visible rows nor exported values reconcile to the selected metric. The PostgreSQL test avoids this by asserting the hidden `amount` field rather than the visible/exported `paid` field (`src/test/financial-control-report-migration.test.ts:835`). Use the metric-period value for the displayed/exported Paid column and detail totals when the selected metric is `cash_collected`, with a regression fixture where lifetime and in-period paid differ.

### [P1] Historical as-of reports still depend on current visit status and deletion state

`supabase/migrations/20260803100000_add_financial_control_reports.sql:1402`

The canonical query joins the immutable completion event back to current `consultations` and `queue_entries`, then requires both current rows to be undeleted and currently `completed` (`:1402-1417`). If a completed visit is reopened, cancelled, or soft-deleted after the requested as-of date, that bill disappears from earlier summaries, comparisons, outstanding totals, and details even though its immutable completion event predates the as-of boundary. This defeats the migration's as-of reconstruction and can retroactively rewrite previously reported periods. Preserve completion/void lifecycle state as immutable events and resolve eligibility at `_as_of_date`; add post-as-of status-change and deletion regressions.

### [P2] Reassigning a payment or panel claim does not transfer its immutable financial state

`supabase/migrations/20260803100000_add_financial_control_reports.sql:1113`

For a payment update that changes `queue_entry_id` or `consultation_id` without changing the amount, the trigger records a zero delta using only the new association (`:1131-1158`). The original positive receipt event remains attached to the old visit, while the new visit receives no value; fact aggregation later sums by the stored association (`:1491-1503`). Panel-claim updates have the symmetric problem: the new queue receives the latest snapshot while the old queue retains its prior latest snapshot (`:1200-1224`, `:1506-1519`), allowing one claim to remain represented against both visits. Model association changes as an explicit removal from the old key plus addition to the new key, and cover reassignment before and after completion.

### [P2] Section and export errors expose raw backend messages

`src/components/clinic/insight/management/FinancialControlTab.tsx:203`

Summary, stale-summary, detail, stale-detail, and export error states render `error.message` directly (`FinancialControlTab.tsx:203-232`, `FinancialDetailSheet.tsx:129-130`, `:149-180`). Supabase/PostgreSQL errors can contain RPC names, database details, and internal diagnostics, contrary to the approved requirement for bounded errors that do not reveal database internals. Existing component tests explicitly expect raw error text (`src/test/financial-control-components.test.tsx:829`). Log diagnostic detail through the established internal path and show a stable user-facing message with section-scoped retry behavior.

## Verdict

**Changes required; not release-ready.** Authorization gates, RPC grants/private-function isolation, one-year/page-size bounds, formula-safe CSV encoding, section failure isolation, filter keys, focus restoration, and generated RPC declarations were verified in the reviewed implementation. The two P1 findings break the canonical metric and immutable as-of contracts, while the P2 findings leave correction and error-handling risks.

## Fresh Verification

- Focused suite with `REQUIRE_POSTGRES_TEST=1`: **PASS**, 5 files and 85 tests, including the disposable PostgreSQL contract.
- `npx.cmd tsc --noEmit`: **PASS**.
- `npm.cmd run lint:changed`: **PASS**, 16 changed JS/TS files.
- `npm.cmd run build`: **PASS**, 5,306 modules transformed; existing dependency, browser-externalization, dynamic-import, and chunk-size warnings remain.
- `git diff --check 692690a6b203eff122c8ec098c1a765d89c60a8d..HEAD`: **PASS**.
- Authenticated desktop/mobile visual verification and production Supabase advisors were not run in this local review.

The focused suite ran with the pre-existing uncommitted `src/test/insight-management-tab.test.tsx` mock change present; this report does not include or modify that change.
