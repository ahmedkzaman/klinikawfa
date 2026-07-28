# Cross-Doctor Consultation Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let resident doctors and doctor admins find completed consultations by date and open other doctors' notes read-only, while adding exact-visit links from Patient Visit History and preserving locum isolation.

**Architecture:** Centralize role, ownership, and date-list decisions in a pure permission module. Feed the Consultation page with a selected-date query, but retain the existing live workflow for the current doctor's active patients. The detail route independently derives cross-doctor read-only mode and blocks every mutation path; Supabase SELECT policies enforce locum ownership and completed-history access for the two approved roles.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Vitest, Supabase/Postgres RLS, date-fns, shadcn UI.

## Global Constraints

- Cross-doctor note access is limited to `resident_doctor` and `doctor_admin`.
- Cross-doctor consultations are read-only.
- Other doctors' active consultations are not exposed.
- The date picker defaults to today's Asia/Kuala_Lumpur date.
- The date picker is unavailable to `locum`.
- Patient Visit History links repeat authorization checks at the destination.
- Existing locum access to the locum's own active consultations remains intact.
- Do not broaden consultation INSERT, UPDATE, or DELETE policies.

---

### Task 1: Pure Consultation Access Rules

**Files:**
- Create: `src/lib/clinic/consultationAccess.ts`
- Test: `src/test/consultation-access.test.ts`

**Interfaces:**
- Consumes: `AppRole` from `src/contexts/AuthContext.tsx`
- Produces:
  - `canBrowseConsultationDates(role: AppRole | null): boolean`
  - `canReadCrossDoctorNotes(role: AppRole | null): boolean`
  - `canListConsultationEntry(input: ConsultationListAccessInput): boolean`
  - `getConsultationAccess(input: ConsultationAccessInput): { canView: boolean; canEdit: boolean; isCrossDoctorReadOnly: boolean }`

- [ ] **Step 1: Write failing role and ownership tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  canBrowseConsultationDates,
  canListConsultationEntry,
  canReadCrossDoctorNotes,
  getConsultationAccess,
} from '@/lib/clinic/consultationAccess';

describe('consultation access', () => {
  it.each(['resident_doctor', 'doctor_admin'] as const)(
    '%s can read another doctor completed consultation',
    (role) => {
      expect(canReadCrossDoctorNotes(role)).toBe(true);
      expect(getConsultationAccess({
        role,
        currentDoctorId: 'doctor-a',
        attendingDoctorId: 'doctor-b',
        consultationStatus: 'completed',
        queueStatus: 'completed',
      })).toEqual({ canView: true, canEdit: false, isCrossDoctorReadOnly: true });
    },
  );

  it('blocks resident doctors from another doctor active consultation', () => {
    expect(getConsultationAccess({
      role: 'resident_doctor',
      currentDoctorId: 'doctor-a',
      attendingDoctorId: 'doctor-b',
      consultationStatus: 'in_progress',
      queueStatus: 'with_doctor',
    }).canView).toBe(false);
  });

  it('keeps locums on their own consultations and hides date browsing', () => {
    expect(canBrowseConsultationDates('locum')).toBe(false);
    expect(canListConsultationEntry({
      role: 'locum',
      currentDoctorId: 'doctor-a',
      attendingDoctorId: 'doctor-b',
      queueStatus: 'completed',
      selectedDateIsToday: false,
    })).toBe(false);
  });

  it.each(['ops_staff', 'operations', 'staff_nurse', 'purchaser', 'staff', 'admin', 'special_admin'] as const)(
    '%s cannot read cross-doctor clinical notes',
    (role) => expect(canReadCrossDoctorNotes(role)).toBe(false),
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/consultation-access.test.ts`

Expected: FAIL because `@/lib/clinic/consultationAccess` does not exist.

- [ ] **Step 3: Implement the minimal pure permission module**

```ts
import type { AppRole } from '@/contexts/AuthContext';
import type { ClinicStatus } from '@/types/clinic';

const CROSS_DOCTOR_NOTE_ROLES = new Set<AppRole>(['resident_doctor', 'doctor_admin']);

export function canBrowseConsultationDates(role: AppRole | null) {
  return role !== null && role !== 'guest' && role !== 'locum';
}

export function canReadCrossDoctorNotes(role: AppRole | null) {
  return role !== null && CROSS_DOCTOR_NOTE_ROLES.has(role);
}

export type ConsultationAccessInput = {
  role: AppRole | null;
  currentDoctorId: string | null | undefined;
  attendingDoctorId: string | null | undefined;
  consultationStatus?: string | null;
  queueStatus?: ClinicStatus | null;
};

export function getConsultationAccess(input: ConsultationAccessInput) {
  const own = !!input.currentDoctorId && input.currentDoctorId === input.attendingDoctorId;
  const completed =
    input.consultationStatus === 'completed' || input.queueStatus === 'completed';
  const crossDoctor = !own && !!input.attendingDoctorId;
  const crossDoctorAllowed =
    completed && crossDoctor && canReadCrossDoctorNotes(input.role);
  return {
    canView: own || crossDoctorAllowed,
    canEdit: own,
    isCrossDoctorReadOnly: crossDoctorAllowed,
  };
}
```

Add `ConsultationListAccessInput` and `canListConsultationEntry` so own entries appear in today's live workflow, approved roles receive completed entries for the selected date, and locums receive only own entries.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/test/consultation-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/clinic/consultationAccess.ts src/test/consultation-access.test.ts
git commit -m "feat: define consultation note access rules"
```

### Task 2: Selected-Date Consultation Feed and List UI

**Files:**
- Modify: `src/hooks/clinic/useQueueEntries.ts`
- Modify: `src/pages/clinic/Consultation.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/clinic/ClinicLayout.tsx`
- Test: `src/test/consultation-date-access.test.tsx`

**Interfaces:**
- Consumes: Task 1 permission helpers.
- Produces:
  - `useConsultationQueueEntries(selectedDate?: string)`
  - a date input with `aria-label="Consultation date"`
  - role-filtered rows and actions.

- [ ] **Step 1: Write failing source-level and helper-backed tests**

Test that:

```ts
expect(source).toContain('aria-label="Consultation date"');
expect(source).toContain('useConsultationQueueEntries(selectedDate)');
expect(source).toContain('canBrowseConsultationDates(role)');
expect(routeSource).toContain('requiredRole="any_staff"');
```

Also test `dateRangeForLocalDate` after exporting it: `2026-07-27` produces a one-day local range, and `todayInputValue()` is the initial selected date.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/consultation-date-access.test.tsx`

Expected: FAIL because the Consultation page has no selected-date control and the route is still clinical-only.

- [ ] **Step 3: Implement the selected-date query**

Change `useConsultationQueueEntries` to accept `selectedDate = todayInputValue()`. For today, retain active carry-over entries and today's entries. For earlier dates, query only that local day's queue entries and let the page retain completed rows. Include the selected date in `CONSULT_QUEUE_QUERY_KEY`.

- [ ] **Step 4: Implement the list UI and route behavior**

In `Consultation.tsx`:

```tsx
const { role, isAdmin } = useAuth();
const [selectedDate, setSelectedDate] = useState(todayInputValue);
const selectedDateIsToday = selectedDate === todayInputValue();
const { data: entries = [] } = useConsultationQueueEntries(selectedDate);
```

Render the date input only when `canBrowseConsultationDates(role)` is true. Build `baseEntries` with `canListConsultationEntry`, ensure past dates show completed rows only, and label cross-doctor completed actions `View notes`. Keep locum behavior on today's own assignments.

Change the list route in `App.tsx` to `requiredRole="any_staff"` while retaining `requiredRole="clinical"` on the detail route. Mark the Consultation navigation item as hidden from locums, because locums continue their consultation workflow from Queue and direct own-case links.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/test/consultation-date-access.test.tsx src/test/consultation-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/hooks/clinic/useQueueEntries.ts src/pages/clinic/Consultation.tsx src/App.tsx src/components/clinic/ClinicLayout.tsx src/test/consultation-date-access.test.tsx
git commit -m "feat: browse consultations by date"
```

### Task 3: Read-Only Cross-Doctor Detail

**Files:**
- Modify: `src/pages/clinic/ConsultationDetail.tsx`
- Modify: `src/hooks/clinic/useConsultations.ts`
- Test: `src/test/cross-doctor-consultation-detail.test.tsx`

**Interfaces:**
- Consumes: `getConsultationAccess` from Task 1.
- Produces: explicit access-denied and cross-doctor read-only states.

- [ ] **Step 1: Write failing read-only guard tests**

Assert that the detail source:

```ts
expect(source).toContain('isCrossDoctorReadOnly');
expect(source).toContain('Read-only consultation');
expect(source).toContain('if (!access.canEdit) return');
expect(source).toContain('if (access.isCrossDoctorReadOnly) return');
```

Add pure permission assertions that own completed consultations remain governed by existing completion behavior, while another doctor's completed consultation has `canEdit: false`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/cross-doctor-consultation-detail.test.tsx`

Expected: FAIL because the detail page only derives `isLocked`, not doctor ownership.

- [ ] **Step 3: Add independent destination authorization**

Read `role` from `useAuth`, derive access from the current doctor and loaded consultation/queue entry, and return an access-denied state if `access.canView` is false. Ensure the auto-create effect exits when the destination is cross-doctor or not editable.

- [ ] **Step 4: Enforce read-only behavior**

Display a read-only banner naming the attending doctor. Disable or hide note fields, diagnosis controls, treatment item mutations, vitals form actions, document issue/edit/void/delete controls, status actions, lock actions, and all save buttons. Add the same `access.canEdit` guard at the start of mutation handlers.

Do not alter existing behavior for the attending doctor's own consultation.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/test/cross-doctor-consultation-detail.test.tsx src/test/consultation-access.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/pages/clinic/ConsultationDetail.tsx src/hooks/clinic/useConsultations.ts src/test/cross-doctor-consultation-detail.test.tsx
git commit -m "feat: enforce read-only cross-doctor consultations"
```

### Task 4: Patient Visit History Deep Links

**Files:**
- Modify: `src/components/patients/PatientProfileSheet.tsx`
- Modify: `src/hooks/patients/usePatientVisitHistory.ts`
- Test: `src/test/patient-visit-consultation-link.test.tsx`

**Interfaces:**
- Consumes: `canReadCrossDoctorNotes` from Task 1 and existing `queue_entries.id`.
- Produces: eligible `View consultation` navigation to `/clinic/consultation/:queueEntryId`.

- [ ] **Step 1: Write the failing eligibility tests**

Test that resident doctors and doctor admins receive a consultation link for a visit with a consultation, while `admin`, `special_admin`, staff roles, and locum do not.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/patient-visit-consultation-link.test.tsx`

Expected: FAIL because Visit History only expands inline.

- [ ] **Step 3: Add the exact-visit action**

Pass `canOpenConsultation={canReadCrossDoctorNotes(role)}` into each `VisitRow`. When a consultation exists, render:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  onClick={() => {
    onClose();
    navigate(`/clinic/consultation/${row.id}`);
  }}
>
  View consultation
</Button>
```

Keep the detail page as the authoritative authorization check.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/patient-visit-consultation-link.test.tsx src/test/consultation-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/patients/PatientProfileSheet.tsx src/hooks/patients/usePatientVisitHistory.ts src/test/patient-visit-consultation-link.test.tsx
git commit -m "feat: link patient visits to consultation notes"
```

### Task 5: Supabase Read Boundary

**Files:**
- Create with `supabase migration new cross_doctor_completed_consultation_reads`: `supabase/migrations/<CLI-generated timestamp>_cross_doctor_completed_consultation_reads.sql`
- Test: `src/test/cross-doctor-consultation-policy.test.ts`

**Interfaces:**
- Consumes: `public.user_roles`, `public.doctors.user_id`, `public.consultations.doctor_id/status`.
- Produces:
  - `public.can_read_cross_doctor_consultation(uuid)`
  - `consultations_select` policy with own-doctor and approved completed-history branches.

- [ ] **Step 1: Write the failing migration contract test**

Assert the migration:

```ts
expect(sql).toContain("role::text IN ('resident_doctor', 'doctor_admin')");
expect(sql).toContain("c.status = 'completed'");
expect(sql).toContain('d.user_id = auth.uid()');
expect(sql).toContain('REVOKE ALL ON FUNCTION');
expect(sql).not.toMatch(/consultations_(insert|update|delete)/);
expect(sql).not.toContain("role::text = 'locum'");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- src/test/cross-doctor-consultation-policy.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the focused migration**

Run `npx supabase migration new cross_doctor_completed_consultation_reads` and edit the exact file path printed by the CLI.

Create a stable authorization helper with a fixed `search_path`, revoke execution from `PUBLIC`, and grant only to `authenticated` and `service_role`. Replace only the consultation SELECT policy so:

- the consultation's doctor user may read their own row, including locum;
- `resident_doctor` and `doctor_admin` may read completed rows;
- existing operational roles retain only the consultation-row access required by current dispensary/billing workflows;
- deleted rows stay excluded except where an existing special-admin voided policy explicitly permits them.

Do not alter consultation write policies.

- [ ] **Step 4: Run policy and existing security tests**

Run: `npm test -- src/test/cross-doctor-consultation-policy.test.ts src/test/dispensary-staff-price-permissions.test.ts src/test/auth-guards.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- supabase/migrations/20260728000000_cross_doctor_completed_consultation_reads.sql src/test/cross-doctor-consultation-policy.test.ts
git commit -m "fix: enforce consultation note read boundaries"
```

### Task 6: Verification and Deployment

**Files:**
- Verify all files changed in Tasks 1-5.

**Interfaces:**
- Consumes: completed feature branch.
- Produces: deployed production revision.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- src/test/consultation-access.test.ts src/test/consultation-date-access.test.tsx src/test/cross-doctor-consultation-detail.test.tsx src/test/patient-visit-consultation-link.test.tsx src/test/cross-doctor-consultation-policy.test.ts
```

Expected: PASS with no failed tests.

- [ ] **Step 2: Run broader validation**

Run:

```powershell
npm run lint:changed
npm run build
```

Expected: both exit successfully.

- [ ] **Step 3: Review the final diff and security boundary**

Run:

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short
```

Confirm no unrelated files or `supabase/.temp` artifacts are committed.

- [ ] **Step 4: Push and deploy**

Push the feature commits to the repository's deployment branch using the existing GitHub workflow. Do not overwrite unrelated remote work; integrate with the latest `origin/main` using a clean feature branch and a non-destructive merge or cherry-pick.

- [ ] **Step 5: Verify production**

Confirm the deployment workflow succeeds and verify:

- Consultation date defaults to today.
- A past date shows completed visits.
- Resident doctor and doctor admin can open another doctor's completed notes read-only.
- Locum has no historical date control and cannot open another doctor's notes.
- Patient Visit History opens the exact consultation for eligible doctor roles.
