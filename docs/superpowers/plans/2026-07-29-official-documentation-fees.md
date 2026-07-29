# Official Documentation Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge configurable official documentation fees for issued MCs, prescription slips, and referral letters across cash and panel visits.

**Architecture:** Store one role-protected price per supported document type and link each issued document to one consultation-item charge. Guarded PostgreSQL functions will atomically issue/void documents and their charges, including the existing completed-bill correction path; React hooks and settings UI will call those functions and show role-appropriate controls.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, React Testing Library.

## Global Constraints

- Initial prices are RM15.00 for MC, prescription slip, and referral letter.
- Patient-facing receipt and panel-claim text is exactly `Official Documentation Fees`.
- The feature applies to cash and panel patients.
- Reprints and edits never duplicate a charge.
- Voiding an issued document reverses only its linked fee.
- Late documents create a new outstanding amount without changing existing payments.
- MC prices are editable by operations staff, resident doctors, admin, and doctor-admin; locums are excluded.
- Prescription and referral prices are editable only by admin and doctor-admin.
- Existing documents are not charged retrospectively.
- Database authorization must enforce every price-editing rule.

## File structure

- `supabase/migrations/<generated>_add_official_documentation_fees.sql`: configuration, links, guarded RPCs, RLS/grants, defaults, and completed-bill integration.
- `supabase/tests/official_documentation_fees.sql`: transactional database acceptance tests.
- `src/hooks/clinic/useClinicDocumentFees.ts`: typed fee query/update API.
- `src/hooks/clinic/useClinicDocuments.ts`: issue/void mutations through atomic RPCs.
- `src/components/clinic/settings/DocumentFeeSettings.tsx`: focused price editor.
- `src/components/clinic/settings/DocumentTemplateBuilder.tsx`: composes the fee editor into document settings.
- `src/components/clinic/consultation/IssueDocumentModal.tsx`: displays the applicable fee during issuance.
- `src/test/official-documentation-fees-migration.test.ts`: migration contract.
- `src/test/document-fee-settings.test.tsx`: permissions and editing UI.
- `src/test/issue-document-fee.test.tsx`: issuance RPC and visible fee behavior.

---

### Task 1: Database model and atomic billing lifecycle

**Files:**
- Create: `supabase/migrations/<generated>_add_official_documentation_fees.sql`
- Create: `supabase/tests/official_documentation_fees.sql`
- Create: `src/test/official-documentation-fees-migration.test.ts`

**Interfaces:**
- Produces: `clinic_document_fees(document_type text primary key, amount numeric(10,2), updated_by uuid, updated_at timestamptz)`.
- Produces: `set_clinic_document_fee(_document_type text, _amount numeric) returns clinic_document_fees`.
- Produces: `issue_consultation_document_with_fee(...) returns consultation_documents`.
- Produces: `void_consultation_document_with_fee(_document_id uuid) returns void`.
- Produces: `consultation_items.source_document_id uuid` and `consultation_items.source_document_type text`.

- [ ] **Step 1: Generate the migration filename**

Run `supabase migration new add_official_documentation_fees` and use the generated path in all following steps.

- [ ] **Step 2: Write the failing migration contract**

Create `src/test/official-documentation-fees-migration.test.ts` to read the generated SQL and assert the three RM15 seeds, the exact public label, a unique active source-document index, authorization branches, and both issue/void RPCs.

```ts
expect(sql).toMatch(/values\s*\('mc',\s*15\.00\)/i);
expect(sql).toContain('Official Documentation Fees');
expect(sql).toMatch(/unique[\s\S]*source_document_id[\s\S]*where deleted_at is null/i);
expect(sql).toMatch(/issue_consultation_document_with_fee/i);
expect(sql).toMatch(/void_consultation_document_with_fee/i);
```

- [ ] **Step 3: Run the contract and verify RED**

Run `npm.cmd test -- --run src/test/official-documentation-fees-migration.test.ts`.
Expected: FAIL because the migration does not yet contain the schema and functions.

- [ ] **Step 4: Write the transactional SQL acceptance test**

Create `supabase/tests/official_documentation_fees.sql` using a transaction and assertions for:

- RM15 defaults;
- one charge on issue;
- no second charge on document update;
- linked charge reversal on void;
- cash and panel totals including the charge;
- paid/completed visit gaining RM15 outstanding;
- role allow/deny cases; and
- concurrent/idempotent uniqueness.

The test must roll back and raise an exception for every failed assertion.

- [ ] **Step 5: Implement the migration**

Create the configuration table with RLS, explicit authenticated reads, and updates only through `set_clinic_document_fee`. Validate supported types and non-negative two-decimal amounts.

Extend `consultation_items` with nullable source-document metadata and a partial unique index on active `source_document_id`.

Implement issue and void as guarded transactional functions. Each function must:

- verify `auth.uid()` is authorized for the consultation;
- use `SECURITY INVOKER` where existing RLS permits the operation;
- lock the consultation and relevant completed-bill rows;
- snapshot the configured price into one item named `Official Documentation Fees`;
- set internal source metadata;
- invoke the established completed-bill correction guard for completed visits;
- preserve payments; and
- return an existing document/charge for an idempotent retry.

Revoke function execution from `PUBLIC` and `anon`, then grant only to `authenticated`.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/test/official-documentation-fees-migration.test.ts
npx.cmd tsc --noEmit
```

Expected: all checks pass.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations supabase/tests/official_documentation_fees.sql src/test/official-documentation-fees-migration.test.ts
git commit -m "feat: add official documentation fee lifecycle"
```

### Task 2: Typed price hooks and role-aware settings

**Files:**
- Create: `src/hooks/clinic/useClinicDocumentFees.ts`
- Create: `src/components/clinic/settings/DocumentFeeSettings.tsx`
- Modify: `src/components/clinic/settings/DocumentTemplateBuilder.tsx`
- Create: `src/test/document-fee-settings.test.tsx`

**Interfaces:**
- Consumes: `set_clinic_document_fee(_document_type, _amount)`.
- Produces: `DocumentFeeType = 'mc' | 'prescription' | 'referral'`.
- Produces: `useClinicDocumentFees()`.
- Produces: `useSetClinicDocumentFee()`.
- Produces: `<DocumentFeeSettings />`.

- [ ] **Step 1: Write the failing component tests**

Cover RM15 rendering, allowed MC editor roles, locum denial, admin-only prescription/referral editing, validation, and successful RPC mutation.

```ts
expect(screen.getByLabelText('Medical Certificate fee')).toHaveValue(15);
expect(screen.getByLabelText('Prescription Slip fee')).toBeDisabled();
expect(screen.getByText('RM15.00')).toBeInTheDocument();
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- --run src/test/document-fee-settings.test.tsx`.
Expected: FAIL because the hook and component do not exist.

- [ ] **Step 3: Implement the hook**

Read the three configuration rows, normalize numeric amounts, update only by calling `set_clinic_document_fee`, invalidate `clinic-document-fees`, and surface database permission messages.

- [ ] **Step 4: Implement the focused editor**

Render three labelled currency inputs with Save actions and short permission text. Derive editability from the existing authenticated clinic-role source, while relying on the RPC for final authorization.

- [ ] **Step 5: Compose it into document settings**

Place `<DocumentFeeSettings />` above the template list/editor without changing existing template behavior.

- [ ] **Step 6: Verify GREEN and commit**

Run the focused test and TypeScript check, then:

```powershell
git add src/hooks/clinic/useClinicDocumentFees.ts src/components/clinic/settings/DocumentFeeSettings.tsx src/components/clinic/settings/DocumentTemplateBuilder.tsx src/test/document-fee-settings.test.tsx
git commit -m "feat: add document fee settings"
```

### Task 3: Atomic issue and void integration

**Files:**
- Modify: `src/hooks/clinic/useClinicDocuments.ts`
- Modify: `src/components/clinic/consultation/IssueDocumentModal.tsx`
- Create: `src/test/issue-document-fee.test.tsx`

**Interfaces:**
- Consumes: database issue/void RPCs and `useClinicDocumentFees()`.
- Produces: existing `useAddConsultationDocument()` and `useDeleteConsultationDocument()` APIs backed by guarded RPCs.

- [ ] **Step 1: Write failing behavior tests**

Assert supported documents call the issue RPC, editing uses the existing update path, delete calls the void RPC, the modal shows `Official Documentation Fees · RM15.00`, and unsupported types do not show or create fees.

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- --run src/test/issue-document-fee.test.tsx`.
Expected: FAIL because hooks still perform direct insert/delete operations.

- [ ] **Step 3: Replace direct issue/delete mutations**

Map the existing input fields to the guarded RPC. Keep return types and query invalidation compatible with current callers. Invalidate:

- `consultation-documents`;
- `consultation_items`;
- queue/billing queries;
- panel claims; and
- clinic-health/financial insight queries.

- [ ] **Step 4: Show the fee before saving**

For MC, prescription, and referral templates, show the exact label and current configured price in the issue modal. Editing an existing document must say the fee is already linked and will not be charged again.

- [ ] **Step 5: Verify GREEN and commit**

Run focused tests and TypeScript, then:

```powershell
git add src/hooks/clinic/useClinicDocuments.ts src/components/clinic/consultation/IssueDocumentModal.tsx src/test/issue-document-fee.test.tsx
git commit -m "feat: charge issued consultation documents"
```

### Task 4: Regression and database verification

**Files:**
- Modify only if a failing regression exposes an implementation defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified release candidate.

- [ ] **Step 1: Run focused document and billing tests**

Run:

```powershell
npm.cmd test -- --run src/test/official-documentation-fees-migration.test.ts src/test/document-fee-settings.test.tsx src/test/issue-document-fee.test.tsx src/test/print-document-letterhead.test.ts src/test/document-letterhead-integration.test.tsx src/test/completed-bill-financial-reporting.test.ts
```

- [ ] **Step 2: Run full static checks**

Run:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
git diff --check
```

- [ ] **Step 3: Apply to the verified live Supabase project**

Confirm runtime config still references `nhjbqdiyptjqherdfbqk`. Apply the generated migration once through Supabase migration tooling.

- [ ] **Step 4: Run authenticated production smoke tests**

Without exposing patient data, verify:

- all three prices equal 15;
- authorized and unauthorized price edits behave correctly;
- a transactionally created test document creates one linked charge;
- void reverses it;
- totals update for cash, panel, and completed scenarios; and
- the smoke transaction rolls back.

- [ ] **Step 5: Commit any verification-only adjustments**

If no fixes were needed, do not create an empty commit. Otherwise commit only the tested corrections.

### Task 5: GitHub deployment and canary

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: verified release commit.
- Produces: deployed production release.

- [ ] **Step 1: Confirm a clean fast-forward**

Fetch `origin/main`, confirm the merge base equals `origin/main`, and ensure no unrelated working-tree changes are included.

- [ ] **Step 2: Push the release commit**

Push the current HEAD to `origin/main`.

- [ ] **Step 3: Monitor required workflows**

Wait for Security Gate and Deploy GitHub Pages to complete successfully. If either fails, inspect the failing job, reproduce locally, fix test-first, and push a new commit.

- [ ] **Step 4: Production canary**

Verify the Document Fees settings load, role controls display correctly, one supported issue flow shows RM15, and billing/claim views show `Official Documentation Fees`.

- [ ] **Step 5: Report completion**

Provide the commit, workflow links, database verification result, and the exact user-visible behavior. Do not claim deployment before both workflows and the canary succeed.
