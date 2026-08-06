# Yezza export → Klinik Awfa import assessment

This assessment is based on the local Yezza CSV exports supplied on 2026-08-06. The source files contain patient and clinical information and must not be committed to GitHub or uploaded from the browser.

## Source coverage

| Source | Rows | Date range | Notes |
| --- | ---: | --- | --- |
| `patients.csv` | 26,578 | 2020-08-04 → 2026-01-25 | Patient master export |
| `consultations.csv` | 50,000 | 2021-09-17 → 2026-03-09 | Exactly 50,000 rows; likely export/page limit |
| `transactions_1.csv` | 50,000 | 2022-02-25 → 2026-03-09 | Financial export part 1 |
| `transactions_2.csv` | 19,832 | 2020-08-04 → 2022-03-31 | Financial export part 2 |

The two transaction files contain **2,390 exact duplicate rows** (same Visit ID and Bill#). They overlap for visits dated 2022-02-25 through 2022-03-31. They must be deduplicated before import.

After removing those exact duplicates, the financial source contains 67,442 unique visits/bills. The current consultation file has 50,000 visits, so 17,442 financial visits have no corresponding consultation export row. Those cannot be silently discarded.

## Klinik Awfa target mapping

### Patients

| Yezza field | Klinik Awfa field | Rule |
| --- | --- | --- |
| Patient Name | `patients.name` | Trim whitespace; retain original spelling |
| IC/Passport | `patients.national_id` or `passport_no` | Detect Malaysian IC vs passport; do not overwrite an existing patient with a conflicting ID |
| Phone | `patients.phone` | Normalize Malaysia prefixes; preserve blank |
| DOB | `patients.date_of_birth` | Parse only valid dates |
| Gender | `patients.gender` | Normalize known values; retain unknown as null |
| Email | `patients.email` | Trim and validate basic format |
| address fields | `patients.address` | Join non-empty address parts with `, ` |
| Yezza PatientID | `patients.reg_no` as `YEZZA-<PatientID>` | Provides an idempotent source key without exposing the numeric source ID as the clinic registration number |

There are 5 repeated IC values in the export. They must be reviewed as separate source patients rather than merged automatically because one pair has different names.

### Visits and consultations

Each unique Yezza `VisitID` becomes one Klinik Awfa `queue_entries` row and one `consultations` row. The source VisitID and source system are retained in the visit remarks/case note for traceability.

| Yezza field | Klinik Awfa field | Rule |
| --- | --- | --- |
| Visit Date | `queue_entries.created_at`, `consultations.original_consulted_at` | Preserve the source timestamp with timezone handling |
| PatientID | `patient_id` | Resolve through the source-key mapping, never by name alone |
| Visit Note | `queue_entries.visit_notes` / `consultations.case_note` | Preserve text |
| Diagnoses | `consultations.diagnosis_text` | Preserve original text; ICD-10 mapping is not inferred |
| Attending Dr | `consultations.doctor_id` | Exact normalized match to current doctor roster only; unresolved names remain unassigned and are reported |
| Service Name | `consultation_items` | Split on new lines and parse `name : amount` |

The service text contains 176,002 parsed line items across 978 distinct names. It does not contain a reliable quantity column, so each parsed line defaults to quantity 1. A line with `: 0.00` is still retained as a historical item.

### Billing and payments

Each unique transaction row maps to the visit's billing total and, where `Paid Amount (RM) > 0`, one payment record. The original bill number, status, method, channel, and raw method string are retained in payment notes/source metadata.

Yezza supplies a combined payment method such as `CASH, PMCARE` but does not supply the amount split between methods. Therefore the safe import is one payment for the recorded paid amount with the original combined method retained as a note. It must not invent a split.

Transactions with `Paid Amount (RM) = 0` remain outstanding; they should not create a zero-value payment row.

The source contains 6,775 rows marked `Due`, 10,281 marked `Paid`, and 52,776 with a blank status. Blank-status rows must be reconciled from paid amount/total instead of being treated as paid.

## Safe implementation sequence

1. Create a local staging copy and validate all CSVs; never commit the source files.
2. Deduplicate the two transaction exports by exact source VisitID + Bill# + financial values.
3. Build a source-key mapping for patients and flag the 5 repeated IC cases for review.
4. Match doctors against the current Klinik Awfa roster and produce an unresolved-doctor report.
5. Parse consultation line items and produce a service/item mapping report. Historical lines should not automatically alter current inventory stock.
6. Run a dry-run import that reports counts, totals, unresolved mappings, duplicate candidates, and orphan financial visits.
7. Take a database backup and import in a transaction through an admin-only server-side job/Edge Function, in batches. Browser-side inserts are unsuitable for this volume and would be constrained by RLS and request limits.
8. Reconcile source totals against Klinik Awfa totals before enabling the imported records for normal reporting.

No production data has been inserted by this assessment.

## Reconciliation baseline and release decision

The financial baseline was recomputed from the supplied local transaction
exports by the read-only `npm run yezza:reconcile` command. It read 69,832
input rows, removed 2,390 exact duplicates, and returned 67,442 unique bills,
RM5,684,929.22 billed, and RM1,099,076.00 paid. The result matched the approved
source baseline exactly.

The source file review remains a release gate, not an automatic merge decision:

- Review every generated patient-review row and all five repeated-IC cases.
  Do not merge a repeated IC automatically, particularly where source names
  differ.
- Review every unresolved doctor before choosing an exact roster mapping or an
  intentionally unassigned historical consultation.
- Treat all 17,442 consultation-missing financial visits as
  `legacy-financial-only`; retain their financial history but do not fabricate
  clinical notes, items, diagnoses, or clinical activity.

The full CSV dry-run parses the complete 352 MB consultation export and may
require an explicitly increased Node heap on the approved local import
workstation. This is an operational resource requirement, not authority to
skip review; the bounded transaction reconciliation above remains the verified
financial source gate.

Production apply is **blocked** until the guarded PostgreSQL integration suite
and the full reconciliation suite have passed in an isolated non-production
environment, the reviews above have documented admin/doctor-admin approval,
and a tested backup is available. No production backup, approval RPC call,
apply request, migration deployment, or production write was performed for
this assessment.
