# Offline Consultation Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operations staff transcribe an existing visit under the actual consulting doctor, continue through dispensary and payment while approval is pending, and require later approval by that doctor or a doctor administrator.

**Architecture:** Add server-owned provenance and approval state to `consultations`, an immutable approval audit table, and narrow RPCs for transcription, resubmission, return, and approval. Reuse the existing consultation editor in an explicit offline-entry mode, with a small access-state helper and provenance panel controlling visible actions while the database independently enforces every transition.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase/Postgres RLS and RPCs, Vitest, Testing Library, Vite.

## Global Constraints

- Pending or returned doctor approval must not block dispensary, payment, or checkout.
- `consultations.doctor_id` remains the consulting doctor; `entered_by` records the operations staff member separately.
- Only `ops_staff` may create or edit offline transcriptions; the selected doctor or `doctor_admin` may approve or return them.
- Operations staff cannot edit approved clinical content or approve it themselves.
- Locum behavior remains unchanged.
- Existing live consultations default to `entry_source = 'live'` and `approval_status = 'not_required'`.
- Audit records are immutable and server-authored.

---

### Task 1: Database State Machine and Authorization

**Files:**
- Create: `supabase/migrations/20260802190000_add_offline_consultation_approval.sql`
- Create: `src/test/offline-consultation-approval-migration.test.ts`

**Interfaces:**
- Produces consultation fields `entry_source`, `entered_by`, `original_consulted_at`, `approval_status`, `approved_by`, `approved_at`, `returned_by`, `returned_at`, `return_reason`, and `approval_revision`.
- Produces RPCs `save_offline_consultation`, `review_offline_consultation`, and `get_offline_consultation_audit`.
- Produces immutable table `consultation_approval_audit`.

- [ ] **Step 1: Write a failing migration contract test**

Create tests that locate the migration by suffix and assert the exact columns, constrained states, foreign keys, indexes, immutable audit trigger, fixed search paths, revoked public/anon privileges, authenticated RPC grants, and postflight checks. Assert that `save_offline_consultation` checks the protected role table for `ops_staff`, derives `entered_by` from `auth.uid()`, validates an active selected doctor, locks the queue visit and consultation, and accepts an expected revision. Assert that `review_offline_consultation` allows the selected doctor's user ID or `doctor_admin`, requires a reason for `returned`, and only transitions from `pending`.

- [ ] **Step 2: Run the contract test and confirm the red state**

Run: `npm.cmd test -- src/test/offline-consultation-approval-migration.test.ts`

Expected: FAIL because the migration and RPC definitions do not exist.

- [ ] **Step 3: Implement the additive migration**

Use check constraints for:

```sql
entry_source IN ('live', 'offline_transcription')
approval_status IN ('not_required', 'pending', 'returned', 'approved')
```

Create RPC signatures:

```sql
save_offline_consultation(
  p_queue_entry_id uuid,
  p_doctor_id uuid,
  p_original_consulted_at timestamptz,
  p_case_note text,
  p_diagnosis_id uuid,
  p_diagnosis_text text,
  p_dispense_note text,
  p_expected_revision integer
) returns public.consultations

review_offline_consultation(
  p_consultation_id uuid,
  p_action text,
  p_reason text default null,
  p_expected_revision integer default null
) returns public.consultations

get_offline_consultation_audit(
  p_consultation_id uuid
) returns table (
  id uuid,
  action text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz,
  reason text
)
```

The save RPC creates only when no active consultation exists for the queue entry; otherwise it updates only an existing offline record in `pending` or `returned`. A returned update transitions to `pending`, clears current return fields without deleting history, increments `approval_revision`, and records `resubmitted`. Doctor reassignment before approval records `doctor_reassigned`. Clinical snapshots in audit JSON contain notes and identifiers but exclude attachment file contents.

- [ ] **Step 4: Preserve checkout independence and direct-write boundaries**

Do not add approval checks to `checkout_visit` or `record_payment_and_complete_visit`. Add trigger/RLS protection preventing authenticated direct changes to provenance and approval columns, while allowing the RPC owners to perform validated transitions. Keep existing doctor-owned live consultation policies unchanged.

- [ ] **Step 5: Run the migration contract test**

Run: `npm.cmd test -- src/test/offline-consultation-approval-migration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the database contract**

```powershell
git add supabase/migrations/20260802190000_add_offline_consultation_approval.sql src/test/offline-consultation-approval-migration.test.ts
git commit -m "feat: add offline consultation approval state"
```

### Task 2: Typed Access State and Data Hooks

**Files:**
- Modify: `src/lib/clinic/consultationAccess.ts`
- Modify: `src/hooks/clinic/useConsultations.ts`
- Create: `src/hooks/clinic/useOfflineConsultationApproval.ts`
- Create: `src/test/offline-consultation-access.test.ts`
- Create: `src/test/use-offline-consultation-approval.test.tsx`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Consumes Task 1 RPCs and consultation fields.
- Produces `getOfflineConsultationAccess(input)` with `canEnter`, `canEditTranscription`, `canReview`, `isLockedForStaff`, and `canContinueOperationalFlow`.
- Produces hooks `useSaveOfflineConsultation`, `useReviewOfflineConsultation`, and `useOfflineConsultationAudit`.

- [ ] **Step 1: Write failing access-helper tests**

Cover `ops_staff` creation and pending/returned editing, approved lockout, selected-doctor review, doctor-admin fallback review, ordinary doctor denial for another doctor's record, unchanged locum behavior, and `canContinueOperationalFlow === true` for pending and returned states.

- [ ] **Step 2: Run the helper test and confirm failure**

Run: `npm.cmd test -- src/test/offline-consultation-access.test.ts`

Expected: FAIL because `getOfflineConsultationAccess` is absent.

- [ ] **Step 3: Add the pure access helper**

Define inputs using `AppRole`, current doctor ID, attending doctor ID, entry source, and approval status. Keep this helper advisory for UI state; document that RPC checks remain authoritative.

- [ ] **Step 4: Write failing hook tests**

Mock Supabase RPC calls and assert exact payload mapping, query invalidation for `consultation`, `consultation_history`, and `offline_consultation_audit`, safe error propagation, and no client-supplied `entered_by`, `approved_by`, or `returned_by` fields.

- [ ] **Step 5: Implement hooks and refresh generated types**

Map camel-case application inputs to Task 1 RPC parameters. Extend consultation selects to include the new provenance fields and related staff/approver display data through authorized RPC output where direct profile joins are unavailable.

- [ ] **Step 6: Run focused tests and type checking**

Run: `npm.cmd test -- src/test/offline-consultation-access.test.ts src/test/use-offline-consultation-approval.test.tsx`

Run: `npm.cmd run typecheck`

Expected: all pass.

- [ ] **Step 7: Commit the access layer**

```powershell
git add src/lib/clinic/consultationAccess.ts src/hooks/clinic/useConsultations.ts src/hooks/clinic/useOfflineConsultationApproval.ts src/test/offline-consultation-access.test.ts src/test/use-offline-consultation-approval.test.tsx src/integrations/supabase/types.ts
git commit -m "feat: add offline consultation access hooks"
```

### Task 3: Operations Staff Entry Experience

**Files:**
- Modify: `src/pages/clinic/Consultation.tsx`
- Modify: `src/pages/clinic/ConsultationDetail.tsx`
- Create: `src/components/clinic/consultation/OfflineConsultationProvenance.tsx`
- Create: `src/test/offline-consultation-entry.test.tsx`

**Interfaces:**
- Consumes Task 2 access helper and save hook.
- Produces the `Enter offline consultation` action and pending/returned editor states.

- [ ] **Step 1: Write failing UI tests**

Assert that only `ops_staff` sees `Enter offline consultation`; selecting it requires an existing visit, active doctor, and original consultation date/time; the form labels the selected doctor separately from the entering staff member; save text is `Save for doctor approval`; returned records show the reason and `Resubmit for approval`; approved records disable staff clinical edits.

- [ ] **Step 2: Run UI tests and confirm failure**

Run: `npm.cmd test -- src/test/offline-consultation-entry.test.tsx`

Expected: FAIL because the action and provenance component do not exist.

- [ ] **Step 3: Add the list action and explicit entry route state**

Use the existing Consultation page rows and date selection. Pass explicit navigation state or a query flag identifying offline-entry mode and the chosen queue entry; reject direct entry mode when the current role is not `ops_staff`.

- [ ] **Step 4: Build the provenance panel**

Use existing select, date/time input, badge, alert, and button components. Display consulting doctor, original consultation time, entering staff, current approval state, return reason, and approved-by line without nesting cards. Use active doctors from `useDoctors()`.

- [ ] **Step 5: Reuse the consultation editor under offline permissions**

Route clinical-note saves through `useSaveOfflineConsultation`. Apply `canEditTranscription` to notes, multi-diagnosis controls, treatment mutations, dispense notes, and attachments. Preserve existing live-doctor save handlers for normal records. Prompt before changing the selected doctor on an existing pending record.

- [ ] **Step 6: Keep operational navigation enabled**

Ensure `Proceed to dispensary` remains available after a successful pending or returned save when existing billing/workflow rules allow it. Do not map approval state onto consultation or queue completion status.

- [ ] **Step 7: Run focused tests**

Run: `npm.cmd test -- src/test/offline-consultation-entry.test.tsx src/test/consultation-readonly.test.tsx src/test/consultation-diagnosis-display.test.tsx`

Expected: all pass.

- [ ] **Step 8: Commit the staff entry experience**

```powershell
git add src/pages/clinic/Consultation.tsx src/pages/clinic/ConsultationDetail.tsx src/components/clinic/consultation/OfflineConsultationProvenance.tsx src/test/offline-consultation-entry.test.tsx
git commit -m "feat: add operations offline consultation entry"
```

### Task 4: Doctor Review, Attachments, and Audit Display

**Files:**
- Modify: `src/pages/clinic/ConsultationDetail.tsx`
- Modify: `src/components/clinic/consultation/SessionAttachmentsStrip.tsx`
- Create: `src/components/clinic/consultation/OfflineConsultationReview.tsx`
- Create: `src/test/offline-consultation-review.test.tsx`

**Interfaces:**
- Consumes Task 2 review and audit hooks.
- Produces doctor approval/return controls and read-only audit history.

- [ ] **Step 1: Write failing review tests**

Cover selected-doctor and doctor-admin controls, mandatory return reason, stale revision handling, successful approval metadata, staff attachment mutation only in pending/returned states, approved attachment lockout, and audit rendering with actor, action, reason, and timestamp.

- [ ] **Step 2: Run review tests and confirm failure**

Run: `npm.cmd test -- src/test/offline-consultation-review.test.tsx`

Expected: FAIL because review controls are absent.

- [ ] **Step 3: Build the review panel**

Render `Approve` and `Return for correction` only when `canReview` and status is `pending`. Use an alert dialog with a required textarea for return reason. Send the displayed `approval_revision`; on conflict, invalidate and show `This consultation changed. Reload and review the latest version.`

- [ ] **Step 4: Enforce attachment UI boundaries**

Add an explicit `canMutate` prop to `SessionAttachmentsStrip`. Existing callers default to their current behavior; offline callers pass `canEditTranscription`. Render existing files read-only when false.

- [ ] **Step 5: Display immutable audit events**

Show a compact chronological section for created, edited, doctor reassigned, returned, resubmitted, and approved events. Do not expose raw clinical snapshots in the browser.

- [ ] **Step 6: Run focused review and attachment tests**

Run: `npm.cmd test -- src/test/offline-consultation-review.test.tsx src/test/session-attachments-strip.test.tsx`

Expected: all pass.

- [ ] **Step 7: Commit review workflow**

```powershell
git add src/pages/clinic/ConsultationDetail.tsx src/components/clinic/consultation/SessionAttachmentsStrip.tsx src/components/clinic/consultation/OfflineConsultationReview.tsx src/test/offline-consultation-review.test.tsx
git commit -m "feat: add doctor approval for offline notes"
```

### Task 5: Reporting Regression, Production Verification, and Deployment

**Files:**
- Modify: `src/hooks/patients/usePatientVisitHistory.ts`
- Modify: `src/hooks/clinic/useQueueEntries.ts`
- Modify: `src/hooks/clinic/useDoctorClinicalActivity.ts`
- Create: `src/test/offline-consultation-reporting.test.ts`

**Interfaces:**
- Consumes Task 1 attribution fields.
- Confirms every display and report continues to use `consultations.doctor_id`.

- [ ] **Step 1: Write failing or characterization reporting tests**

Assert patient history, Completed Today, consultation history, and doctor clinical activity identify the consulting doctor and never substitute `entered_by`. Assert pending approval does not exclude a financially completed visit from existing reports.

- [ ] **Step 2: Run reporting tests**

Run: `npm.cmd test -- src/test/offline-consultation-reporting.test.ts src/test/doctor-clinical-activity-migration.test.ts`

Expected: characterization tests pass; any failing attribution path identifies the minimal query correction required.

- [ ] **Step 3: Correct only evidence-backed reporting gaps**

Keep joins on `consultations.doctor_id`. Add the offline indicator to detail views only; do not alter financial aggregation or approval filtering.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run lint:changed
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: zero test failures, zero lint/type errors, successful production build, and no whitespace errors.

- [ ] **Step 5: Apply and verify the production migration**

Use the Supabase migration tool for project `nhjbqdiyptjqherdfbqk`. Verify migration history, RPC definitions, RLS/security advisors, and safe transaction-based role checks for `ops_staff`, selected doctor, doctor admin, unrelated doctor, and locum. Do not create or alter real patient, payment, or consultation data during authorization probes.

- [ ] **Step 6: Commit any reporting corrections and push**

```powershell
git add src/hooks/patients/usePatientVisitHistory.ts src/hooks/clinic/useQueueEntries.ts src/hooks/clinic/useDoctorClinicalActivity.ts src/test/offline-consultation-reporting.test.ts
git commit -m "test: protect offline consultation attribution"
git push origin HEAD:main
```

Skip the reporting commit when characterization tests require no source changes, but include the test in the preceding feature commit.

- [ ] **Step 7: Monitor deployment and perform live smoke checks**

Require successful Security Gate and Deploy GitHub Pages runs for the pushed SHA. Then verify the live UI using authorized test accounts where available: operations staff can save pending notes and proceed operationally; the selected doctor can return and approve; approved notes are locked for staff; locum cannot enter or review; checkout remains successful while approval is pending.
