# Offline Consultation Final Fix Report

## Final Fix Wave

**Status:** Complete. All six findings in `final-review.md` are addressed in one cohesive implementation commit.

**Implementation SHA:** `4f29faf` (`fix: close offline consultation final review gaps`)

### Findings Closed

1. `NULL` is now explicit create intent for `save_offline_consultation`; integer revisions are update intent. Queue locking plus a partial unique index enforce one active consultation per queue entry, and a concurrent duplicate creator loses without overwriting the winner.
2. Related-write guards resolve, deterministically lock, and validate both `OLD` and `NEW` parents for items, vitals, attachments, documents, and sourced follow-ups.
3. Approved items permit only authorized `dispensed_qty` and `partial_reason` updates through the established dispensary permission boundary; clinical, pricing, deletion, and reparenting changes remain blocked.
4. Historical doctor eligibility now requires an active profile with exactly the protected `resident_doctor` or `doctor_admin` role and no longer requires `on_duty`.
5. Existing offline editor mode is restored from the exact-ops-only server entry-state response after refresh or direct navigation; ordinary cross-doctor access is unchanged.
6. Offline attachment upload now reserves a private path before Storage upload, finalizes metadata under a consultation lock, blocks approval while an upload is active, and durably marks failed objects inaccessible and collectable.

### TDD Evidence

RED:

- `$env:REQUIRE_POSTGRES_TEST='1'; npm.cmd test -- src/test/offline-consultation-final-review.test.ts`
  - Failed before implementation because the final migration and reservation RPC/state contract did not exist.
- `npm.cmd test -- src/test/offline-consultation-pages.test.tsx src/test/use-offline-consultation-approval.test.tsx src/test/session-attachments-strip.test.tsx src/test/offline-attachment-upload.test.tsx`
  - Failed on the ambiguous revision-0 create payload, direct reopen without router state, missing offline upload boundary, and the old Storage-first metadata flow.

GREEN:

- `$env:REQUIRE_POSTGRES_TEST='1'; npm.cmd test -- src/test/offline-consultation-final-review.test.ts`
  - PASS: 1 file, 2 tests; executable PostgreSQL duplicate-create, uniqueness, OLD/NEW reparent, approved dispensary, eligibility, reservation, cleanup, and approval/finalization race assertions.
- `$env:REQUIRE_POSTGRES_TEST='1'; npm.cmd test -- src/test/offline-consultation-final-review.test.ts src/test/offline-consultation-pages.test.tsx src/test/use-offline-consultation-approval.test.tsx src/test/session-attachments-strip.test.tsx src/test/offline-attachment-upload.test.tsx`
  - PASS: 5 files, 24 tests; duration 46.17s.
- `$env:REQUIRE_POSTGRES_TEST='1'; npm.cmd test -- src/test/offline-consultation-final-review.test.ts src/test/offline-consultation-approval-migration.test.ts src/test/offline-consultation-entry-security.test.ts src/test/offline-consultation-reporting.test.ts`
  - PASS: 4 files, 20 tests; all required PostgreSQL suites executed.
- Broad offline feature verification completed before the hard checkpoint.
  - PASS: 15 files, 79 tests.

### Repository Checks

- `npx.cmd tsc --noEmit`
  - PASS, exit 0.
- `npm.cmd run lint:changed`
  - PASS, exit 0.
- `npx.cmd eslint src/components/clinic/consultation/SessionAttachmentsStrip.tsx src/hooks/clinic/useAttachments.ts src/hooks/clinic/useOfflineConsultationApproval.ts src/integrations/supabase/types.ts src/pages/clinic/ConsultationDetail.tsx src/test/offline-attachment-upload.test.tsx src/test/offline-consultation-final-review.test.ts src/test/offline-consultation-pages.test.tsx src/test/session-attachments-strip.test.tsx src/test/use-offline-consultation-approval.test.tsx`
  - PASS, exit 0.
- `npm.cmd run build`
  - PASS: 5,297 modules transformed, production build completed in 11.28s. Existing dependency/browser-list and chunk-size warnings remain non-blocking.
- `git diff --check` and `git diff --cached --check`
  - PASS with no whitespace errors. Git emitted only repository line-ending notices.

### Files

- `supabase/migrations/20260803010100_close_offline_consultation_final_review.sql`
- `src/hooks/clinic/useAttachments.ts`
- `src/hooks/clinic/useOfflineConsultationApproval.ts`
- `src/pages/clinic/ConsultationDetail.tsx`
- `src/components/clinic/consultation/SessionAttachmentsStrip.tsx`
- `src/integrations/supabase/types.ts`
- `src/test/offline-consultation-final-review.test.ts`
- `src/test/offline-attachment-upload.test.tsx`
- `src/test/offline-consultation-pages.test.tsx`
- `src/test/use-offline-consultation-approval.test.tsx`
- `src/test/session-attachments-strip.test.tsx`
- `.superpowers/sdd/2026-08-02-offline-consultation-entry/final-fix-report.md`

### Concerns

- No final-review finding remains unresolved.
- `cleanup_required` reservation rows are deliberately private, durable, and unreadable through Storage; routine service-side collection/retention scheduling remains an operational follow-up rather than a release authorization gap.
- Deploy the additive migration with the compatible application build so nullable create intent and the reservation RPC flow arrive together.
