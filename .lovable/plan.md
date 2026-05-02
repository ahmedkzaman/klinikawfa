## Problem

The invoice print template shows a hardcoded "[Bank Name] [Account No]" placeholder in the footer, but there is no UI or database field to enter your actual bank details. The SST field was added in the previous step, but bank info was missed.

## Solution

Add three new fields to `clinic_settings` and surface them in **Clinic → Settings → Document Settings**, then wire them into the invoice PDF footer.

### 1. Database Migration

Add to `public.clinic_settings`:
- `bank_name` (text, nullable)
- `bank_account_no` (text, nullable)
- `bank_account_holder` (text, nullable) — defaults to clinic name on the printout if blank

### 2. Update Hook

Extend `useClinicSettings.ts` types and defaults to include the three new fields.

### 3. Document Settings UI

In `src/pages/clinic/settings/DocumentSettings.tsx`, add a new **"Bank Details (for B2B Invoices)"** card with three inputs:
- Bank Name (e.g., "Maybank Berhad")
- Account Holder Name (e.g., "Klinik Awfa Sdn Bhd")
- Account Number

Include a small helper note: *"These details appear in the footer of corporate invoices to instruct clients where to remit payment."*

### 4. Invoice Print Template

Update `ClientInvoicePrintTemplate.tsx` footer:
- If `bank_name` and `bank_account_no` are set → render a clean "Payment Instructions" block:
  ```
  Please make payment to:
  {bank_account_holder || clinic_name}
  {bank_name} — {bank_account_no}
  ```
- If not configured → render a muted hint *"Bank details not configured"* (only visible to user, hidden in print via `print:hidden`) so empty footers don't ship to clients.

### Files Affected

- **New**: `supabase/migrations/[ts]_add_bank_details_to_clinic_settings.sql`
- **Edited**: `src/hooks/clinic/useClinicSettings.ts`, `src/pages/clinic/settings/DocumentSettings.tsx`, `src/components/clinic/receivables/ClientInvoicePrintTemplate.tsx`

No changes to invoice creation flow or RLS — settings table already has admin-write policies in place.