## Accounts Receivable (B2B Invoicing) — Hardened Build

B2B invoicing module for corporate clients (panels, training, rentals). Free-text line items, atomic server-side persistence, race-free invoice numbering, scoped print, and SST-ready letterhead.

### 1. Database Migration

New file: `supabase/migrations/<ts>_create_receivables_schema.sql`

**Tables** (UUID PKs, `created_at`/`updated_at` defaults, `update_updated_at_column` trigger on each):

- `corporate_clients`: `name text not null`, `address text`, `contact_person text`, `phone text`, `email text`, `status text not null default 'active'`.
- `client_invoices`: `invoice_no text not null unique`, `client_id uuid not null references corporate_clients(id)`, `issue_date date not null default current_date`, `due_date date`, `status text not null default 'Draft' check (status in ('Draft','Issued','Paid','Cancelled'))`, `total_amount numeric(12,2) not null default 0`, `notes text`, `payment_ref text`.
- `client_invoice_items`: `invoice_id uuid not null references client_invoices(id) on delete cascade`, `description text not null`, `quantity numeric(12,2) not null default 1`, `unit_price numeric(12,2) not null default 0`, `total_price numeric(12,2) generated always as (quantity * unit_price) stored`.

**Race-free invoice numbering:**
```sql
create sequence public.client_invoice_seq start 1;

create function public.assign_client_invoice_no() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.invoice_no is null or new.invoice_no = '' then
    new.invoice_no := 'INV-AR-' || to_char(coalesce(new.issue_date, current_date),'YYYYMMDD')
                   || '-' || lpad(nextval('public.client_invoice_seq')::text,4,'0');
  end if; return new;
end $$;

create trigger trg_assign_client_invoice_no before insert on public.client_invoices
for each row execute function public.assign_client_invoice_no();
```

**Atomic items save (single-tx RPC):**
```sql
create function public.save_client_invoice_items(_invoice_id uuid, _items jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.client_invoice_items where invoice_id = _invoice_id;
  insert into public.client_invoice_items (invoice_id, description, quantity, unit_price)
  select _invoice_id, (i->>'description')::text,
         coalesce((i->>'quantity')::numeric,1),
         coalesce((i->>'unit_price')::numeric,0)
  from jsonb_array_elements(_items) i
  where coalesce(trim(i->>'description'),'') <> '';
end $$;
grant execute on function public.save_client_invoice_items(uuid, jsonb) to authenticated;
```

**Total recomputation trigger** on `client_invoice_items` (insert/update/delete) updates `client_invoices.total_amount = SUM(total_price)` — runs in same tx as the RPC.

**SST-ready clinic settings:** `alter table public.clinic_settings add column if not exists sst_number text;` (nullable; UI shows it in Document Settings).

**RLS** — enable on all three tables; `authenticated` gets `SELECT/INSERT/UPDATE/DELETE` (`USING(true)`/`WITH CHECK(true)`) matching the recent ERP patch.

**Indexes:** `client_invoices(client_id)`, `client_invoice_items(invoice_id)`.

### 2. Data Hooks

- `src/hooks/clinic/useCorporateClients.ts` — list / create / update / archive.
- `src/hooks/clinic/useClientInvoices.ts` — list (joined with client name), `getById` (header + items), `create` (omits `invoice_no`, lets trigger assign), `updateHeader`, `updateStatus`, `markPaid({ id, payment_ref })`. **No retry logic** — sequence guarantees uniqueness.
- `src/hooks/clinic/useClientInvoiceItems.ts` — `listByInvoice`, **`save`** calls `supabase.rpc('save_client_invoice_items', { _invoice_id, _items })` — single atomic call.
- Existing `useClinicSettings` extended to expose `sst_number`.

### 3. Sidebar + Routing

- Add to `clinicNavItems` in `src/components/clinic/ClinicLayout.tsx`: `{ href: '/clinic/receivables', label: 'Receivables', icon: Briefcase }` between Panel Claims and Dispensary.
- Register route in `src/App.tsx`: `<Route path="receivables" element={<Receivables />} />`.

### 4. Receivables Dashboard — `src/pages/clinic/Receivables.tsx`

- Shadcn `Tabs`: **Invoices** (default) and **Clients**.
- **Clients tab:** table (Name, Contact, Phone, Email, Status, Edit) + "Add Client" → `CorporateClientDialog`.
- **Invoices tab:** table (Invoice No, Client, Issue Date, Due Date, Total RM, Status badge — Draft=slate, Issued=blue, Paid=green, Cancelled=zinc). Row click opens `ClientInvoiceSheet`. "Create Invoice" button.

### 5. Invoice Builder — `src/components/clinic/receivables/ClientInvoiceSheet.tsx`

- Right `Sheet` (`sm:max-w-3xl`), props `{ open, onOpenChange, invoiceId? }`.
- Header: client `Select` (active clients), Issue Date, Due Date, Status badge, Notes textarea.
- Line items: dynamic table — Description (free-text `Input`, full width), Qty (number), Unit Price RM, Line Total (read-only, `qty * unit_price`), Remove. "Add line" button.
- Footer: live grand total.
- Actions: **Save Draft**, **Mark as Issued**, **Mark as Paid** (inline `Dialog` prompts for `payment_ref`), **Download PDF / Print** (window.print, enabled only after first save).

**Hardening:**
- All save buttons disabled while any mutation pending.
- `onOpenChange` is no-op while `mutation.isPending` (prevents close mid-save).
- Save flow: insert/update header → await success → call `save_client_invoice_items` RPC → invalidate queries. If RPC fails, header still has previous items (no partial wipe possible since delete+insert are in one tx).
- Validation: block save & status changes when `items.filter(i => i.description.trim()).length === 0` → toast "Add at least one line item".
- Re-open hydration: `getById` populates header + items via react-query cache.

### 6. Print Template — `src/components/clinic/receivables/ClientInvoicePrintTemplate.tsx`

Mirrors `POPrintTemplate.tsx`:
- `useClinicSettings()` for logo, name, address, phone, email, `logo_height_px`, `letterhead_text_px`, `content_margin_top` (applied as `paddingTop`).
- **Title logic:** default `"INVOICE"`. If `settings.sst_number` is set → render `"TAX INVOICE"` and add `SST No: {sst_number}` line under the clinic letterhead.
- Top-right: title, Invoice No, Issue Date, Due Date, Status.
- "Bill To:" block from `corporate_clients`.
- Line items table: No, Description, Qty, Unit Price (RM), Total (RM); footer "GRAND TOTAL (RM)".
- Notes (if present) under table.
- Bank-details footer: `Make payment to Klinik Awfa: [Bank Name] [Account No]`.
- "Generated on …" timestamp.
- Wrapper: `client-invoice-print-root hidden print:block print:fixed print:inset-0 print:bg-white print:text-black print:p-10 print:text-[12pt]`.
- Mounted hidden inside `ClientInvoiceSheet`.

### 7. Print Isolation (fixes potential bug in PO too)

Add to `src/index.css`:
```css
@media print {
  body * { visibility: hidden !important; }
  .po-print-root, .po-print-root *,
  .client-invoice-print-root, .client-invoice-print-root * { visibility: visible !important; }
  .po-print-root, .client-invoice-print-root { position: fixed; inset: 0; }
}
```
Guarantees no sidebar/header bleed-through during `window.print()`.

### 8. Document Settings UI

In `src/pages/clinic/settings/DocumentSettings.tsx`, add an optional **"SST Registration No."** input bound to `settings.sst_number`. Helper text: "Leave blank if not SST-registered. When set, invoices will be labeled 'TAX INVOICE'."

### Post-Build QA Checklist

- **Decimal:** qty 2.5 × RM 120.55 → line total 301.38 (toFixed(2)); footer total matches.
- **Persistence:** create → close sheet → reopen → header + items + total all hydrate.
- **Empty block:** save attempt with 0 valid lines → toast, no DB write.
- **Race:** simulate two tabs creating invoices same second → both get distinct sequential numbers, no errors.
- **Print isolation:** `window.print()` shows only the invoice — no sidebar, no app header.

### Files Created / Modified

**Created:**
- `supabase/migrations/<ts>_create_receivables_schema.sql`
- `src/hooks/clinic/useCorporateClients.ts`
- `src/hooks/clinic/useClientInvoices.ts`
- `src/hooks/clinic/useClientInvoiceItems.ts`
- `src/pages/clinic/Receivables.tsx`
- `src/components/clinic/receivables/CorporateClientDialog.tsx`
- `src/components/clinic/receivables/ClientInvoiceSheet.tsx`
- `src/components/clinic/receivables/ClientInvoicePrintTemplate.tsx`

**Modified:**
- `src/components/clinic/ClinicLayout.tsx` (nav item + Briefcase icon)
- `src/App.tsx` (route)
- `src/index.css` (scoped print rule)
- `src/hooks/clinic/useClinicSettings.ts` (expose `sst_number`)
- `src/pages/clinic/settings/DocumentSettings.tsx` (SST No. field)
