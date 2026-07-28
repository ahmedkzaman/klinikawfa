# Doctor Clinical Activity Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable, permission-protected doctor activity report to Clinic Insight that lists performed procedures and issued MC, quarantine, and referral documents.

**Architecture:** A permission-checked Supabase RPC returns one normalised set of procedure and document activity rows for the selected date range. A focused React Query hook calls the RPC, a pure TypeScript module aggregates rows and generates CSV, and a dedicated Scoreboards component renders doctor summaries with on-demand in-place detail expansion.

**Tech Stack:** PostgreSQL/Supabase migrations and RPC, React 18, TypeScript, TanStack React Query, shadcn/ui, Vitest, Testing Library.

## Global Constraints

- Credit all activity to `consultations.doctor_id`, never `consultation_documents.created_by`.
- Include only completed, non-deleted consultations.
- Include only active treatment items linked to a `services` record whose category is exactly `Procedure`.
- Count each qualifying procedure line once, regardless of billing quantity.
- Include document types `mc`, `quarantine`, and `referral` only.
- Filter procedures by clinic-local visit date and documents by clinic-local issue date.
- Preserve records with no doctor under `Unassigned`.
- Do not return IC numbers, addresses, phone numbers, clinical notes, or document contents.
- Enforce the current Clinic Insight access boundary through `public.can_view_insights(auth.uid())` on the server, not only in the UI.
- Keep the existing one-year Insight date-range cap.
- `Total documents = MC + quarantine + referral`.
- Do not add new runtime dependencies.

---

## File map

- `supabase/migrations/*_add_doctor_clinical_activity_report.sql` (the single file created by the required Supabase CLI command in Task 2)
  - Defines and secures `get_doctor_clinical_activity(date, date)`.
  - Adds only indexes justified by the final query plan.
- `src/test/doctor-clinical-activity-migration.test.ts`
  - Guards the RPC signature, permission check, classifications, deleted-record filters, and grants.
- `src/lib/clinic/doctorClinicalActivity.ts`
  - Owns report types, aggregation, document labels, local-date parameter formatting, and CSV generation.
- `src/test/doctor-clinical-activity.test.ts`
  - Unit-tests attribution-preserving aggregation and CSV output.
- `src/hooks/clinic/useDoctorClinicalActivity.ts`
  - Calls the RPC and returns normalised summary/detail data.
- `src/components/clinic/insight/DoctorClinicalActivity.tsx`
  - Owns the expandable table, detail tabs, visit links, loading/error/empty states, and export actions.
- `src/test/doctor-clinical-activity-component.test.tsx`
  - Covers expansion, row isolation, totals, navigation targets, and empty/error states.
- `src/components/clinic/insight/ScoreboardsTab.tsx`
  - Mounts the new component below Doctor Performance.
- `src/pages/clinic/Insight.tsx`
  - Supplies the existing selected date range to Scoreboards; no new date state.
- `src/integrations/supabase/types.ts`
  - Regenerated after the migration so the RPC is strongly typed.

---

### Task 1: Pure activity model, aggregation, and CSV

**Files:**
- Create: `src/lib/clinic/doctorClinicalActivity.ts`
- Create: `src/test/doctor-clinical-activity.test.ts`

**Interfaces:**
- Consumes: raw rows returned by `get_doctor_clinical_activity(date, date)`.
- Produces:

```ts
export type DoctorActivityKind = 'procedure' | 'mc' | 'quarantine' | 'referral';

export interface DoctorActivityRow {
  activityId: string;
  activityKind: DoctorActivityKind;
  activityDate: string;
  activityName: string;
  consultationId: string;
  queueEntryId: string;
  queueCreatedAt: string;
  queueSequence: number;
  doctorId: string | null;
  doctorName: string;
  patientName: string;
}

export interface DoctorActivitySummary {
  doctorId: string | null;
  doctorName: string;
  procedures: number;
  mc: number;
  quarantine: number;
  referral: number;
  totalDocuments: number;
  rows: DoctorActivityRow[];
}

export function aggregateDoctorClinicalActivity(
  rows: DoctorActivityRow[],
): DoctorActivitySummary[];

export function doctorClinicalActivityCsv(
  summaries: DoctorActivitySummary[],
  doctorId?: string | null,
): string;
```

- [ ] **Step 1: Write failing aggregation tests**

Create fixtures that deliberately set a document creator concept aside and assert grouping only by the supplied treating `doctorId`:

```ts
it('groups procedure and document activity by treating doctor', () => {
  const result = aggregateDoctorClinicalActivity([
    row({ activityId: 'p1', activityKind: 'procedure', doctorId: 'd1', doctorName: 'Dr A' }),
    row({ activityId: 'm1', activityKind: 'mc', doctorId: 'd1', doctorName: 'Dr A' }),
    row({ activityId: 'q1', activityKind: 'quarantine', doctorId: 'd1', doctorName: 'Dr A' }),
    row({ activityId: 'r1', activityKind: 'referral', doctorId: 'd1', doctorName: 'Dr A' }),
  ]);

  expect(result[0]).toMatchObject({
    doctorId: 'd1',
    procedures: 1,
    mc: 1,
    quarantine: 1,
    referral: 1,
    totalDocuments: 3,
  });
  expect(result[0].rows).toHaveLength(4);
});

it('preserves unassigned activity and sorts it after named doctors', () => {
  const result = aggregateDoctorClinicalActivity([
    row({ activityId: 'u1', doctorId: null, doctorName: 'Unassigned' }),
    row({ activityId: 'd1', doctorId: 'doctor-1', doctorName: 'Dr A' }),
  ]);

  expect(result.map((item) => item.doctorName)).toEqual(['Dr A', 'Unassigned']);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity.test.ts
```

Expected: FAIL because `doctorClinicalActivity.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal typed aggregator**

Implement a `Map<string, DoctorActivitySummary>` keyed by `doctorId ?? '__unassigned__'`. Increment `procedures` for `procedure`; increment the matching document counter for `mc`, `quarantine`, or `referral`; compute `totalDocuments` from the three document counters; sort named doctors by `doctorName.localeCompare`, with `Unassigned` last; sort each detail list newest date first.

- [ ] **Step 4: Add failing CSV tests**

```ts
it('exports only the selected doctor when a doctor filter is supplied', () => {
  const csv = doctorClinicalActivityCsv(
    aggregateDoctorClinicalActivity([
      row({ activityId: 'a1', doctorId: 'd1', doctorName: 'Dr A', patientName: 'Patient One' }),
      row({ activityId: 'b1', doctorId: 'd2', doctorName: 'Dr B', patientName: 'Patient Two' }),
    ]),
    'd1',
  );

  expect(csv).toContain('Dr A');
  expect(csv).toContain('Patient One');
  expect(csv).not.toContain('Dr B');
  expect(csv).not.toContain('Patient Two');
});
```

Assert the exact header:

```text
Doctor,Date,Activity Type,Activity Name,Patient,Queue Number
```

- [ ] **Step 5: Implement CSV escaping and filtering**

Escape embedded quotes by doubling them, wrap every field in quotes, produce CRLF rows, and support `doctorId === null` as the explicit Unassigned filter rather than treating it as “all doctors”.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/lib/clinic/doctorClinicalActivity.ts src/test/doctor-clinical-activity.test.ts
git commit -m "feat: add doctor clinical activity model"
```

---

### Task 2: Permission-protected Supabase reporting RPC

**Files:**
- Create via `supabase migration new add_doctor_clinical_activity_report`: the command's single output file matching `supabase/migrations/*_add_doctor_clinical_activity_report.sql`
- Create: `src/test/doctor-clinical-activity-migration.test.ts`
- Modify after migration: `src/integrations/supabase/types.ts`

**Interfaces:**
- Consumes:
  - `public.can_view_insights(auth.uid())`;
  - `consultations`, `queue_entries`, `patients`, `profiles`, `consultation_items`, `services`, and `consultation_documents`.
- Produces:

```sql
public.get_doctor_clinical_activity(
  _start_date date,
  _end_date date
) returns table (
  activity_id uuid,
  activity_kind text,
  activity_date date,
  activity_name text,
  consultation_id uuid,
  queue_entry_id uuid,
  queue_created_at timestamptz,
  queue_sequence integer,
  doctor_id uuid,
  doctor_name text,
  patient_name text
)
```

- [ ] **Step 1: Confirm current Supabase guidance and CLI command**

Read `https://supabase.com/changelog.md`, scan relevant breaking changes, and read the current database-function and RLS documentation. Then run:

```powershell
supabase --version
supabase migration new --help
supabase migration new add_doctor_clinical_activity_report
```

Use the exact migration path printed by the CLI for all remaining Task 2 steps.

- [ ] **Step 2: Write a failing migration contract test**

The test reads the single migration matching `*_add_doctor_clinical_activity_report.sql` and asserts:

```ts
expect(sql).toMatch(/get_doctor_clinical_activity\s*\(\s*_start_date date,\s*_end_date date/i);
expect(sql).toContain('can_view_insights');
expect(sql).toMatch(/c\.doctor_id/i);
expect(sql).not.toMatch(/cd\.created_by\s+as\s+doctor_id/i);
expect(sql).toMatch(/s\.category\s*=\s*'Procedure'/i);
expect(sql).toMatch(/ci\.deleted_at\s+is\s+null/i);
expect(sql).toMatch(/c\.status\s*=\s*'completed'/i);
expect(sql).toMatch(/lower\(coalesce\(cd\.type,\s*''\)\)\s+in\s*\('mc',\s*'quarantine',\s*'referral'\)/i);
expect(sql).toMatch(/revoke all on function[\s\S]*from public/i);
expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated/i);
```

- [ ] **Step 3: Run the contract test and verify it fails**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity-migration.test.ts
```

Expected: FAIL because the generated migration is empty.

- [ ] **Step 4: Implement the RPC**

Create a `SECURITY DEFINER` function with `SET search_path = public, pg_temp`. Start with:

```sql
if auth.uid() is null
   or not public.can_view_insights(auth.uid()) then
  raise exception 'NOT_AUTHORIZED' using errcode = '42501';
end if;

if _start_date is null or _end_date is null or _start_date > _end_date then
  raise exception 'INVALID_DATE_RANGE' using errcode = '22007';
end if;

if (_end_date - _start_date) > 366 then
  raise exception 'DATE_RANGE_TOO_LARGE' using errcode = '22023';
end if;
```

Return a `UNION ALL` of:

1. procedure rows joined through `consultation_items.item_id = services.id`, filtered to `services.category = 'Procedure'`, active items, completed/non-deleted consultations, and `queue_entries.created_at AT TIME ZONE 'Asia/Kuala_Lumpur'` within the inclusive dates;
2. document rows filtered by `lower(coalesce(cd.type, '')) IN ('mc','quarantine','referral')`, completed/non-deleted consultations, and `cd.created_at AT TIME ZONE 'Asia/Kuala_Lumpur'` within the inclusive dates.

For both branches:

- use `c.doctor_id`;
- use `coalesce(profile.full_name, 'Unassigned')`;
- use `coalesce(patient.name, 'Unknown patient')`;
- return the queue fields required by `formatQueueNo`;
- return no clinical notes, document bodies, IC numbers, phone numbers, or addresses.

Finish with:

```sql
revoke all on function public.get_doctor_clinical_activity(date, date) from public;
revoke all on function public.get_doctor_clinical_activity(date, date) from anon;
grant execute on function public.get_doctor_clinical_activity(date, date) to authenticated;
```

- [ ] **Step 5: Add only query-plan-justified indexes**

Inspect production index coverage with `pg_indexes` and `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` using aggregate-safe dates. Add `IF NOT EXISTS` indexes only when the query plan shows a missing useful path. Candidate columns:

```sql
consultations (status, queue_entry_id) WHERE deleted_at IS NULL;
consultation_documents (created_at, consultation_id);
consultation_items (consultation_id, item_id) WHERE deleted_at IS NULL;
```

Do not add duplicates of existing indexes.

- [ ] **Step 6: Run migration tests**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Apply to a test/local database and execute behaviour checks**

Use the Supabase MCP or local CLI to verify:

```sql
select * from public.get_doctor_clinical_activity(current_date - 30, current_date);
```

Verify aggregate counts only—do not paste patient-identifying rows into logs. Then test:

- supported document types return;
- unsupported types do not return;
- deleted procedure items do not return;
- a document is attributed to `consultations.doctor_id`;
- an unauthorised user receives `NOT_AUTHORIZED`;
- a range over 366 days receives `DATE_RANGE_TOO_LARGE`.

- [ ] **Step 8: Run Supabase advisors**

Run security and performance advisors. Fix any new warning caused by this migration, especially a callable `SECURITY DEFINER` function with an unintended grant.

- [ ] **Step 9: Regenerate database types**

Use the repository's established Supabase type-generation command and confirm the generated RPC signature contains:

```ts
get_doctor_clinical_activity: {
  Args: { _start_date: string; _end_date: string };
  Returns: Array<{
    activity_id: string;
    activity_kind: string;
    activity_date: string;
    activity_name: string;
    consultation_id: string;
    queue_entry_id: string;
    queue_created_at: string;
    queue_sequence: number;
    doctor_id: string | null;
    doctor_name: string;
    patient_name: string;
  }>;
};
```

- [ ] **Step 10: Commit**

```powershell
git add -- supabase/migrations/*_add_doctor_clinical_activity_report.sql src/test/doctor-clinical-activity-migration.test.ts src/integrations/supabase/types.ts
git commit -m "feat: add secured doctor activity report"
```

---

### Task 3: React Query data hook

**Files:**
- Create: `src/hooks/clinic/useDoctorClinicalActivity.ts`
- Create: `src/test/use-doctor-clinical-activity.test.tsx`

**Interfaces:**
- Consumes: `get_doctor_clinical_activity(_start_date, _end_date)` and `aggregateDoctorClinicalActivity(rows)`.
- Produces:

```ts
export function useDoctorClinicalActivity(
  startDate: Date,
  endDate: Date,
): UseQueryResult<DoctorActivitySummary[], Error>;
```

- [ ] **Step 1: Write the failing hook test**

Mock the typed Supabase RPC and assert:

```ts
expect(rpc).toHaveBeenCalledWith('get_doctor_clinical_activity', {
  _start_date: '2026-07-01',
  _end_date: '2026-07-31',
});
```

Return one snake_case RPC row and assert the hook maps it to the camelCase `DoctorActivityRow` contract before aggregation.

- [ ] **Step 2: Run the hook test and verify it fails**

Run:

```powershell
npm.cmd test -- --run src/test/use-doctor-clinical-activity.test.tsx
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the hook**

Use a query key containing both `yyyy-MM-dd` date keys:

```ts
['doctor-clinical-activity', startKey, endKey]
```

Call the RPC, throw its error unchanged, map snake_case fields explicitly, normalise unknown `activity_kind` values by rejecting them, and pass valid rows to `aggregateDoctorClinicalActivity`.

- [ ] **Step 4: Add error and empty-result tests**

Assert RPC errors place the query in error state and an empty response returns `[]`.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd test -- --run src/test/use-doctor-clinical-activity.test.tsx src/test/doctor-clinical-activity.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/hooks/clinic/useDoctorClinicalActivity.ts src/test/use-doctor-clinical-activity.test.tsx
git commit -m "feat: load doctor clinical activity"
```

---

### Task 4: Expandable Doctor Clinical Activity component

**Files:**
- Create: `src/components/clinic/insight/DoctorClinicalActivity.tsx`
- Create: `src/test/doctor-clinical-activity-component.test.tsx`
- Modify: `src/components/clinic/insight/ScoreboardsTab.tsx`

**Interfaces:**
- Consumes:

```ts
interface DoctorClinicalActivityProps {
  startDate: Date;
  endDate: Date;
}
```

- Produces: a self-contained card mounted by `ScoreboardsTab`, with summary rows, one expanded doctor, Procedures/Documents tabs, visit links, and CSV actions.

- [ ] **Step 1: Write failing summary-render tests**

Mock `useDoctorClinicalActivity` with two doctors and assert the table headings:

```text
Doctor | Procedures | MC | Quarantine | Referral | Total Documents
```

Assert each summary count and verify no patient name is visible while all rows are collapsed.

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity-component.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement summary, loading, error, and empty states**

Use existing `bento`, `bentoHeader`, table, skeleton, alert, and button patterns. Copy exactly:

- heading: `Doctor Clinical Activity`;
- helper text: `Procedures and selected documents credited to the treating doctor.`;
- empty state: `No doctor clinical activity in this period.`;
- error prefix: `Failed to load doctor clinical activity:`.

Use a button spanning the doctor cell to make row expansion keyboard accessible.

- [ ] **Step 4: Write failing expansion tests**

Click `Dr A` and assert:

- Dr A's patient rows become visible;
- Dr B's patient rows remain hidden;
- clicking Dr B closes Dr A and opens Dr B;
- Procedures and Documents tabs filter the expanded rows correctly;
- each visit link is `/clinic/visit/{queueEntryId}`;
- Unassigned can be expanded using the null doctor key.

- [ ] **Step 5: Implement one-row-at-a-time expansion**

Store:

```ts
const [expandedDoctorKey, setExpandedDoctorKey] = useState<string | null>(null);
const doctorKey = summary.doctorId ?? '__unassigned__';
```

Render Procedures from `activityKind === 'procedure'`; render Documents from the other three kinds. Format queue numbers through the existing `formatQueueNo(queueCreatedAt, queueSequence)` helper.

- [ ] **Step 6: Write failing export tests**

Mock `URL.createObjectURL`, click:

- `Export all`;
- `Export Dr A`.

Assert the first call contains both doctors and the second contains Dr A only.

- [ ] **Step 7: Implement exports**

Generate CSV through `doctorClinicalActivityCsv`, create a UTF-8 BOM blob, and use filenames:

```text
doctor-clinical-activity-YYYY-MM-DD-to-YYYY-MM-DD.csv
doctor-clinical-activity-{safe-doctor-name}-YYYY-MM-DD-to-YYYY-MM-DD.csv
```

Disable export buttons during loading and when the applicable dataset is empty.

- [ ] **Step 8: Mount below Doctor Performance**

In `ScoreboardsTab.tsx`, render:

```tsx
<DoctorClinicalActivity startDate={startDate} endDate={endDate} />
```

immediately after the existing Doctor Performance card and before Top Diagnoses.

- [ ] **Step 9: Run component and Scoreboards tests**

Run:

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity-component.test.tsx src/test/scoreboard-procedure-classification.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add -- src/components/clinic/insight/DoctorClinicalActivity.tsx src/components/clinic/insight/ScoreboardsTab.tsx src/test/doctor-clinical-activity-component.test.tsx
git commit -m "feat: show doctor activity in insight"
```

---

### Task 5: Integrated verification and deployment

**Files:**
- Modify only if verification exposes a defect in a file from Tasks 1–4.

**Interfaces:**
- Consumes: completed feature from Tasks 1–4.
- Produces: verified migration, production build, production-safe data comparison, and deployed GitHub main commit.

- [ ] **Step 1: Run all focused tests**

```powershell
npm.cmd test -- --run src/test/doctor-clinical-activity.test.ts src/test/doctor-clinical-activity-migration.test.ts src/test/use-doctor-clinical-activity.test.tsx src/test/doctor-clinical-activity-component.test.tsx
```

Expected: all pass.

- [ ] **Step 2: Run the complete test suite**

```powershell
npm.cmd test
```

Expected: all tests pass. Record unrelated pre-existing failures separately; do not silently ignore failures related to Insight, permissions, consultations, documents, or procedure classification.

- [ ] **Step 3: Run lint checks on changed files**

```powershell
npm.cmd run lint:changed
```

Expected: no new lint errors.

- [ ] **Step 4: Run the production build**

```powershell
npm.cmd run build
```

Expected: exit code 0.

- [ ] **Step 5: Apply the reviewed migration**

Apply the exact committed migration to Supabase project `nhjbqdiyptjqherdfbqk` using the approved migration workflow. Do not paste patient-identifying output into the conversation.

- [ ] **Step 6: Verify live aggregate accuracy**

For the same selected period, compare:

- procedure count by doctor from the RPC against a direct aggregate query;
- MC, quarantine, and referral counts by doctor against a direct aggregate query;
- total documents against the sum of the three types;
- missing/unassigned doctor counts;
- deleted-item exclusion.

All differences must be zero.

- [ ] **Step 7: Verify permissions**

Confirm:

- admin, special admin, and doctor admin users accepted by `can_view_insights` can load the RPC;
- resident doctor, locum, operations, and staff users receive `NOT_AUTHORIZED`;
- anonymous calls receive `NOT_AUTHORIZED`.

- [ ] **Step 8: Browser QA**

Using a permitted clinic account:

- open `/clinic/insight`;
- select Today, This month, and a custom range;
- open Scoreboards;
- expand a doctor with both procedures and documents;
- switch Procedures/Documents tabs;
- follow one completed-visit link;
- test all-doctor and one-doctor CSV exports;
- verify only one doctor remains expanded;
- verify responsive behaviour at the front-PC viewport width.

- [ ] **Step 9: Run Supabase advisors after deployment**

Run security and performance advisors again. The new RPC must not introduce an unintended PUBLIC/anon grant or an unindexed high-cost query.

- [ ] **Step 10: Rebase and push without overwriting remote work**

```powershell
git fetch origin main
git rebase origin/main
git push origin HEAD:main
```

Expected: fast-forward update of GitHub main.

- [ ] **Step 11: Final production smoke check**

Reload `https://klinikawfa.com/clinic/insight`, confirm the deployment contains Doctor Clinical Activity, and re-run one live aggregate comparison after the deployment completes.
