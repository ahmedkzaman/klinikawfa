# Task 3 report — consultation and billing transformations

## Delivered files

- `scripts/yezza-import/transformTransactions.ts`
- `scripts/yezza-import/transformVisits.ts`
- `src/test/yezza-import-transform.test.ts`

The modules only transform supplied in-memory source rows into payloads. They make
no database calls, do not read or write production data, and do not modify or
commit any source CSV.

## Transformation rules implemented

### Consultation service lines

- `parseServiceLines` accepts newline-separated `name : amount` entries.
- It uses the final colon as the amount delimiter, preserving colons in names.
- Every accepted source line has `quantity: 1`; no quantity is inferred.
- Explicit zero-priced lines are retained.
- Blank, missing-name, nonnumeric, and negative-amount lines are omitted rather
  than turned into guessed clinical charges.
- Items retain the one-based original source line and source visit ID. No
  inventory item/service matching, stock deduction, dosage, or ICD-10 code is
  inferred.

### Transactions and payments

- `deduplicateTransactions` applies the approved tuple: Visit ID, bill number,
  total amount, paid amount, method, and channel.
- `mapLegacyPayment` maps a positive recorded paid amount to exactly one
  `LegacyPayment`; zero or invalid paid amounts produce no payment row.
- Composite methods (for example `CASH, PMCARE`) map to `other`, while the raw
  method, channel, status, bill ID, and visit ID remain in auditable notes. No
  split allocation is invented.
- `reconcileTransactions` reports source bill count, billed total, and paid
  total without adjustments. `YEZZA_EXPECTED_RECONCILIATION` and
  `matchesExpectedYezzaReconciliation` enforce the approved baseline:

| Measure | Expected value |
| --- | ---: |
| Unique bills | 67,442 |
| Source billed total | RM5,684,929.22 |
| Source paid total | RM1,099,076.00 |

### Visits and traceability

- `transformVisit` creates linked queue-entry, consultation, and consultation
  item payloads using importer-supplied database IDs, with source visit/patient
  identifiers recorded in traceable remarks/case notes.
- Doctors are assigned only on an exact normalized roster-name match. Unknown
  doctors stay unassigned and are reported through `unresolvedDoctor`.
- A transaction without a consultation creates only a `registered`,
  `legacy-financial-only` queue payload with `legacy_financial_only=true` and
  `clinical_activity_excluded=true` trace markers. It creates no consultation,
  clinical note, or clinical item, so it remains outside clinical activity
  metrics until staff explicitly complete it later.

## Focused verification

TDD red phase was observed first: the focused suite failed because the two
requested modules did not yet exist. After implementation and a small trace
format correction, the focused suite passed:

```text
npm.cmd test -- src/test/yezza-import-transform.test.ts
1 test file passed; 11 tests passed.
```

The direct TypeScript check for both new transformation modules also passed:

```text
npx.cmd tsc --noEmit --target ES2021 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck scripts/yezza-import/transformTransactions.ts scripts/yezza-import/transformVisits.ts
```

The full project TypeScript check is currently not clean due to existing errors
outside this task (including generated type drift and existing component/test
type mismatches). `npm run lint:changed` also cannot determine an
`origin/main...HEAD` merge base in this clone. Neither issue is caused by these
three Task 3 files.

## Review-fix round: source consistency and live reconciliation

`transformVisit` now rejects a request that supplies both clinical and
financial source rows with different `sourceVisitId` values. This prevents a
transaction from being linked to the wrong clinical visit before any payload is
returned. The focused suite includes this rejection case.

`scripts/yezza-import/reconcileTransactions.ts` is a read-only command that
parses the source transaction CSV headers, maps the transaction fields,
deduplicates the two exports, reconciles monetary values in integer sen, and
returns only aggregate counts/totals. It does not write production data or alter
the source files. It is available as `npm run yezza:reconcile`.

Executed on 2026-08-06 against the supplied local files:

```text
npm.cmd run yezza:reconcile -- \
  --transactions-one C:\Users\USER\Downloads\klinikawfa\klinikawfa\transactions_1.csv \
  --transactions-two C:\Users\USER\Downloads\klinikawfa\klinikawfa\transactions_2.csv

inputRows: 69,832
duplicateRowsRemoved: 2,390
uniqueBills: 67,442
sourceTotal: RM5,684,929.22
paidTotal: RM1,099,076.00
matchesExpectedBaseline: true
```

This proves the required source reconciliation against the supplied files.
The command rounds each source amount to the recorded currency precision before
aggregating, avoiding floating-point display drift while preserving the source
amounts. The focused test suite also verifies source fixed-scale decimal input
and sen-precise output.
