# Step 40 — Panel Claims A/R Engine (Phase 1)

Turn `/clinic/panel-claims` into a real Accounts Receivable workflow with workflow-aware fields, a dedicated evidence storage bucket, and a 2-column slide-out claim sheet.

## Current state (audited)

- `panel_claims` already has: `claim_no`, `panel_id`, `patient_id`, `queue_entry_id`, `amount`, `received_amount`, `status`, `claim_date`, `due_date`, `remarks`, `updated_by`, timestamps.
- Enum `panel_claim_status` already includes the full set: `pending, submitted, approved, rejected, received, cancelled`. ✅
- View `panel_claims_view` already computes `is_overdue`. ✅
- Page `src/pages/clinic/PanelClaims.tsx` already renders the bento table + tabs but has **no Due Date column, no Actions menu, and no detail sheet**.
- Treatment items live in `consultation_items` (linked via `consultations.queue_entry_id` → `panel_claims.queue_entry_id`).

## A. Database migration — extend schema

New columns on `public.panel_claims`:

| Column | Type | Notes |
|---|---|---|
| `submitted_date` | `date` | Stamped on transition to `submitted` |
| `approved_amount` | `numeric(10,2)` | Stamped on transition to `approved` |
| `write_off_amount` | `numeric(10,2) GENERATED ALWAYS AS (amount - COALESCE(approved_amount, amount)) STORED` | Auto-computed |
| `payment_reference` | `text` | Cheque/EFT reference for `received` |
| `received_date` | `date` | Stamped on transition to `received` |
| `gl_document_url` | `text` | Storage path to uploaded GL/receipt |

Update `panel_claims_view` to expose all new columns alongside `is_overdue`.

Storage:
- Create private bucket `panel-claim-docs` (mirrors existing `visit-attachment` pattern).
- RLS on `storage.objects`:
  - `select`/`insert`/`update`/`delete` allowed when `bucket_id = 'panel-claim-docs'` AND `is_ops_or_admin(auth.uid())`.

(Existing `panel_claims` RLS already restricts mutations to ops/admin — no change needed there.)

## B. Hook updates — `src/hooks/clinic/usePanelClaims.ts`

- Extend `PanelClaimRow` with the 6 new columns.
- Extend `PANEL_CLAIMS_SELECT` to fetch them.
- Add a new mutation hook `useUpdatePanelClaim()` that:
  - Accepts `{ id, status?, submitted_date?, approved_amount?, payment_reference?, received_date?, remarks?, gl_document_url?, received_amount? }`.
  - Auto-stamps `submitted_date = today` when status flips to `submitted` and field is empty (same pattern for `received_date`).
  - Sets `updated_by = auth.uid()`.
  - Invalidates `['panel_claims']` and `['panel_claims_summary']`.
- Add `useClaimTreatmentItems(queueEntryId)` returning `consultation_items` joined via `consultations` (active rows only) for the left column ledger.

## C. Page updates — `src/pages/clinic/PanelClaims.tsx`

- Add `Due Date` column between `Date` and `Updated By`. Render `—` if null; if `is_overdue`, render a red `Overdue` pill instead of the date.
- Add `Actions` column (right-most) with a `DropdownMenu` (three-dot icon button) containing **"View details / Update claim"**.
- Clicking the row OR the menu item opens the new `ClaimDetailsSheet` (controlled state in the page).
- Update `colSpan` on the empty/loading rows to 10.

## D. New component — `src/components/clinic/claims/ClaimDetailsSheet.tsx`

Wide right-side `Sheet` (`w-full sm:max-w-5xl`) with a 2-column grid (`md:grid-cols-2 gap-6`).

### Left column — Read-only ledger (bento card)
- **Billing Details** — patient name, reg no/ID.
- **Invoice Details** — `claim_no`, visit date (from `consultation.created_at` or `claim_date` fallback), panel name.
- **Treatment Items table** — Item Name, Rate (price), Qty, Total (`price * quantity`), with a footer row summing to the claim `amount`.
- Skeleton rows while `useClaimTreatmentItems` loads.

### Right column — Action & Workflow (bento card)
- Header strip: panel name + total billed amount (large, tabular).
- **Status `Select`** with all 6 enum values (`Pending → Submitted → Approved → Received`, plus `Rejected`/`Cancelled`).
- **Dynamic fields** based on selected status:
  - `submitted` → `submitted_date` (Date input, defaults today).
  - `approved` → `approved_amount` (numeric); show computed `write_off = amount - approved_amount` in a soft amber strip when non-zero.
  - `received` → `payment_reference` (text) + `received_date` (Date) + optional `received_amount` (numeric, defaults to `approved_amount ?? amount`).
- **Remarks** `Textarea` (always visible).
- **Upload zone** — drag-and-drop file input (PDF/JPG/PNG, max 10 MB) that uploads to `panel-claim-docs/{claim_id}/{timestamp}-{filename}` and stamps `gl_document_url`. Show existing file as a download link if present.
- Footer: `Cancel` + `Save` buttons. Save calls `useUpdatePanelClaim`, toasts success/error, closes sheet.

All UI uses bento tokens (`bento`, `bentoHeader`, `softInput`, `pillTabActive`, `secondaryBtn`) for visual parity with `ConsultationDetail`.

## Deliverables checklist

1. **Migration**: add 6 columns + recreate `panel_claims_view` + create `panel-claim-docs` bucket + storage RLS.
2. **`usePanelClaims.ts`**: extended row type, new `useUpdatePanelClaim`, new `useClaimTreatmentItems`.
3. **`PanelClaims.tsx`**: Due Date column with overdue pill, Actions dropdown, controlled sheet state.
4. **`ClaimDetailsSheet.tsx`**: new split-view sheet with workflow form + uploader.

No changes to summary cards, tabs, or pagination — those already work. Phase 2 (audit log, bulk submit, ageing buckets) is out of scope for this step.
