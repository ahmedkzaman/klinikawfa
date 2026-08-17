# Clinic Insight Metric Definitions

This catalogue defines the primary Klinik Awfa Insight metrics after the four-section redesign: Command Centre, Finance, Performance, and Planning. Unless stated otherwise, dates use Malaysia clinic time and include only active, non-voided, non-cancelled records.

Each metric below names its source, date basis, formula, exclusions, owner, and confidence rule so the UI, CSV exports, and operational discussions use the same language.

## Shared confidence rules

- Reliable: all required sources loaded, attribution is complete, and no missing-cost or missing-doctor condition affects the displayed metric.
- Partial: the metric is usable but a named limitation exists, such as missing doctor attribution, missing item COGS, unreconstructable historical panel receipts, or a cached fallback after a source error.
- Insufficient: the metric cannot be interpreted safely because the authoritative source failed, the viewer is not permitted to see the source, or there is not enough data for the requested calculation.

## Command Centre

### Total patients

- Source: Clinic Health / Command Centre aggregate, `healthMetrics.visits.registered`.
- Date basis: queue registration/arrival date in the selected period.
- Formula: count registered queue entries in the selected period.
- Exclusions: cancelled/deleted queue rows and rows hidden by the viewer's `reports.view` scope.
- Owner: clinic operations.
- Confidence: downgraded when the clinic-health source is cached, partial, or failed.

### Average waiting

- Source: Clinic Health / Command Centre aggregate wait metrics.
- Date basis: queue arrival and called/serving timestamps in the selected period.
- Formula: average minutes from arrival to called/served for visits with both timestamps.
- Exclusions: visits without usable wait timestamps, cancelled/deleted queue rows, and payment-only rows where no clinical wait exists.
- Owner: clinic operations.
- Confidence: downgraded when called timestamps are incomplete or the clinic-health source is cached/failed.

### Patient collections

- Source: Financial Control period summary, physical patient payment rows.
- Date basis: payment created date in the selected period.
- Formula: sum active physical patient collections, excluding panel markers.
- Exclusions: panel allocation rows, voided/deleted payments, rejected/cancelled claim rows.
- Owner: finance / billing operations.
- Confidence: downgraded when payment attribution is incomplete or the financial source is cached/failed.

### Panel receivable

- Source: Financial Control reconciliation panel outstanding.
- Date basis: selected period end.
- Formula: active panel claim billed balance less panel receipts/reversals and eligible patient copay portions.
- Exclusions: rejected/cancelled claims, physical patient payment rows, unreconstructable mixed history where the source suppresses partial totals.
- Owner: finance / panel claims.
- Confidence: downgraded when historical claim history is incomplete or the panel source is cached/failed.

### Critical actions

- Source: Command Centre action builder across clinic health, finance, performance, and planning alerts.
- Date basis: selected period for source alerts, or current state where the alert is inherently live.
- Formula: count actions marked critical by their source-specific severity rules.
- Exclusions: informational and non-critical actions; alerts denied by viewer scope.
- Owner: clinic manager.
- Confidence: each action inherits its source confidence; cached/failed sources mark affected actions partial or insufficient.

### Patient flow cards

- Source: Clinic Health queue-state aggregate.
- Date basis: queue state timestamps in the selected period.
- Formula: count queue entries by registered, waiting, serving, dispensary, completed, and comparable active states.
- Exclusions: cancelled/deleted queues and payment-only rows where excluded by the source.
- Owner: clinic operations.
- Confidence: downgraded when queue-state data is partial or cached.

## Finance

### Visit billing / consultation revenue

- Source: Financial Control and Finance ledger helpers.
- Date basis: visit completion date.
- Formula: saved charged consultation item/service/package/document rows + tax - discount, grouped by visit.
- Exclusions: cancelled/deleted items, cancelled visits, rejected/cancelled claims, voided payments, and payment-only tickets unless shown explicitly as collections.
- Owner: finance / billing operations.
- Confidence: downgraded for incomplete attribution, missing COGS, or unreconstructable historical claim history.

### Patient collected

- Source: sales/payment rows and shared dual-ledger helpers.
- Date basis: payment created date for collection reports; visit completion date for visit ledger context.
- Formula: sum active physical payment rows where method is cash, card, QR pay, e-wallet, transfer, or other non-panel method.
- Exclusions: payment method/type panel markers, voided/deleted payments, rejected claim rows.
- Owner: finance / billing operations.
- Confidence: downgraded for stale payment source or unmatched payment-to-visit relationship.

### Panel billed

- Source: panel claim summary/receipt RPCs and shared dual-ledger helpers.
- Date basis: visit completion date for billed amount.
- Formula: terminal panel visit bill less patient co-payment.
- Exclusions: rejected/cancelled claims and physical patient payment rows.
- Owner: panel claims.
- Confidence: downgraded for unreconstructable historical panel claim history or materialized claim ambiguity.

### Panel received

- Source: `get_panel_receipt_summary` and immutable financial panel claim event rows.
- Date basis: receipt/reversal event date.
- Formula: panel receipt events minus reversal events.
- Exclusions: physical patient payments, pending claim markers, rejected/cancelled claim history.
- Owner: panel claims.
- Confidence: downgraded for incomplete historical event reconstruction.

### Outstanding

- Source: shared dual-ledger helpers used by Billings, visit details, receipts, and Insight.
- Date basis: visit completion date for cohort outstanding; payment/receipt event date for later settlements.
- Formula: patient outstanding plus panel receivable/outstanding, calculated separately.
- Exclusions: voided payments, rejected/cancelled claims, cancelled visits, deleted rows.
- Owner: finance / billing operations.
- Confidence: downgraded for incomplete attribution or mixed historical claim history.

### COGS

- Source: Financial Control / Performance RPC item-cost logic.
- Date basis: visit completion date.
- Formula: saved item cost multiplied by saved charged quantity where known.
- Exclusions: cancelled/deleted items, payment-only rows, non-clinical administrative rows.
- Owner: finance / procurement.
- Confidence: downgraded when any included item has missing cost.

### Gross profit and margin

- Source: Financial Control / Finance ledger helpers.
- Date basis: visit completion date.
- Formula: gross profit = consultation revenue - COGS; gross margin = gross profit / consultation revenue.
- Exclusions: same exclusions as consultation revenue and COGS.
- Owner: finance / management.
- Confidence: downgraded when revenue attribution or COGS is partial.

## Performance

### Completed visits by doctor

- Source: `get_insight_performance_report` and secured filtered/detail wrappers.
- Date basis: visit completion date.
- Formula: count completed clinical visits attributed to treating doctor.
- Exclusions: payment-only tickets, cancelled visits, deleted consultations.
- Owner: clinical governance.
- Confidence: downgraded for missing/null doctor attribution.

### Unique patients

- Source: secured Performance report.
- Date basis: visit completion date.
- Formula: distinct patients among completed clinical visits in the selected period.
- Exclusions: payment-only tickets, cancelled/deleted visits, denied doctor scopes.
- Owner: clinical governance.
- Confidence: downgraded when patient/visit linkage is incomplete.

### Revenue / hour

- Source: secured Performance report plus saved doctor roster shifts.
- Date basis: completed visit date and roster date/shift.
- Formula: attributed clinical revenue divided by valid rostered doctor hours.
- Exclusions: cancelled/deleted items, payment-only tickets, malformed/cancelled/unmapped roster assignments.
- Owner: clinic management.
- Confidence: downgraded when roster hours are unavailable, zero, or partially invalid.

### Procedures

- Source: secured Performance report/detail RPCs and Doctor Clinical Activity.
- Date basis: procedure visit completion date.
- Formula: count completed billable procedure/service rows classified as procedures.
- Exclusions: cancelled/deleted items, medicines when not part of the service cohort, payment-only tickets.
- Owner: clinical governance.
- Confidence: downgraded for missing doctor attribution, unknown procedure mapping, or missing cost where margin is shown.

### Documents issued

- Source: secured Performance report/detail RPCs and issued document rows.
- Date basis: document issue date.
- Formula: count issued MC, quarantine, referral, prescription slip, and other official documents credited to the treating doctor where attributable.
- Exclusions: payment-only documents, cancelled visits, deleted documents/items.
- Owner: clinical governance.
- Confidence: downgraded for missing doctor attribution or null consultation linkage.

### Payment mix

- Source: secured Performance report payment classification.
- Date basis: visit completion date for clinical cohort.
- Formula: percentage split of completed clinical visit counts by self-pay and panel classification.
- Exclusions: panel marker rows counted as remittance/allocation rather than physical collection, voided payments, cancelled/rejected claims.
- Owner: finance / clinical governance.
- Confidence: downgraded when payment classification is incomplete or denied by role scope.

### Rostered hours and patients per hour

- Source: Performance RPC roster helper.
- Date basis: roster date and shift.
- Formula: rostered hours from saved doctor roster shifts; patients per hour = completed visits / rostered hours.
- Exclusions: cancelled, malformed, duplicate, or unmapped roster assignments.
- Owner: clinic management.
- Confidence: downgraded when roster data is unavailable or zero.

### Service/procedure volume, price, COGS, margin

- Source: secured performance report/detail RPCs and catalog/item history.
- Date basis: visit completion date for procedures/services; issue date for issued documents.
- Formula: volume count, unique patients, saved charged revenue, saved/known COGS, gross profit, and margin percentage by service/procedure.
- Exclusions: cancelled/deleted items, medicines when not part of the service cohort, payment-only tickets.
- Owner: finance / clinical governance.
- Confidence: downgraded for missing cost, unknown service mapping, or missing doctor attribution.

### Doctor clinical activity detail

- Source: Doctor Clinical Activity and secured performance detail wrappers.
- Date basis: procedure visit date and document issue date.
- Formula: count and list procedures, MC, quarantine, referral, and other issued documents tied to treating doctor.
- Exclusions: payment-only documents, cancelled visits, deleted documents/items.
- Owner: clinical governance.
- Confidence: downgraded for missing doctor attribution or null consultation linkage.

## Planning

### Attendance period heatmap

- Source: `get_clinical_attendance_heatmap`.
- Date basis: clinical queue attendance timestamp in Malaysia time.
- Formula: completed clinical visits grouped into 08:00-12:00, 12:00-16:00, 16:00-20:00, and 20:00-00:00 periods.
- Exclusions: payment-only tickets, cancelled visits, deleted consultations, denied doctor scopes.
- Owner: clinic operations / roster planning.
- Confidence: downgraded for uncovered roster period, insufficient operating occurrences, or source error.

### Regression recommendation

- Source: attendance regression and period-analysis client modules over the secured heatmap RPC.
- Date basis: latest eligible observation window, capped to the most recent 52 weeks where available.
- Formula: bounded Poisson-style regression over recent attendance, with safety vetoes for peak-hour risk, insufficient coverage, roster gaps, and high-uncertainty intervals.
- Exclusions: non-operating/uncovered periods from recommendation decisions.
- Owner: clinic management.
- Confidence: downgraded for low usable weeks, rank-deficient predictors, non-finite inputs, or wide uncertainty.

### Management Dashboard boundary

- Source: standalone `/clinic/dashboard` management records and automatic dashboard metrics.
- Date basis: selected management month plus daily operational metrics where defined.
- Formula: not duplicated in Insight. Planning links to the standalone Management Dashboard for manual targets, Google review counts, marketing cadence, governance, stock purchases, locum pay, and OT.
- Exclusions: Insight does not create/edit these monthly management records.
- Owner: clinic management.
- Confidence: downgraded when the management dashboard source/RPC reports partial or failed data.
