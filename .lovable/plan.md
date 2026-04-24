

## Build Panel Claims Management View (production-hardened, read-only)

Read-only tracking view for panel/insurance claims. Server-side pagination, DB-grounded `is_overdue`, explicitly named FK constraint, and a `received_amount` column so "Received" reflects actual cash collected.

---

### 1. Migration — `supabase/migrations/<ts>_panel_claims.sql`

Creates the enum, table (with `received_amount` and named FK `fk_panel_claims_updated_by`), indexes, `updated_at` trigger, the `panel_claims_view` (overdue computed in SQL against `CURRENT_DATE`), and 4 RLS policies (read-all for authenticated, ops/admin for write).

Exact SQL as supplied in the prompt — applied verbatim.

### 2. Hook — `src/hooks/clinic/usePanelClaims.ts` (new)

Two exports, both `useQuery`-based against `panel_claims_view`.

**`usePanelClaims(tab, page)`** — paginated table data
- `tab`: `'all' | 'overdue' | PanelClaimStatus`
- `page`: 0-based; PAGE_SIZE = 50
- `.select(..., { count: 'exact' })` with embeds:
  - `insurance_providers:panel_id ( id, name )`
  - `patients:patient_id ( id, name )`
  - `updater:profiles!fk_panel_claims_updated_by ( id, full_name, email )`
- `.order('created_at', { ascending: false }).range(page*50, page*50+49)`
- Server-side filter: `tab === 'overdue'` → `.eq('is_overdue', true)`; specific status → `.eq('status', tab)`; `'all'` → no filter.
- Returns `{ rows: PanelClaimRow[], total: number }`. `is_overdue` comes straight from the view.
- `queryKey: ['panel_claims', tab, page]`.

**`usePanelClaimsSummary()`** — light aggregate for cards
- Selects only `status, amount, received_amount, is_overdue` from `panel_claims_view`.
- Local reduce returns:
  - `pendingCount` (status === 'pending')
  - `overdueCount` (is_overdue === true)
  - `approvedSum` (sum amount where status === 'approved')
  - `rejectedSum` (sum amount where status === 'rejected')
  - `receivedSum` (sum `received_amount ?? amount` where status === 'received')
  - `outstandingSum` (sum amount where status ∈ {pending, submitted, approved} — `received` structurally excluded)
- `staleTime: 30_000`.

`PanelClaimRow` and `PanelClaimStatus` exported as types for the page.

### 3. Page — `src/pages/clinic/PanelClaims.tsx` (new)

Layout follows `Billings.tsx`: `max-w-7xl` container, header → summary grid → tabs → table card → pagination footer.

- **State**: `tab` (default `'all'`), `page` (default `0`). Changing `tab` resets `page` to `0`.
- **Header**: `<h1>Panel Claims</h1>` next to `<span className="text-destructive font-semibold text-sm">{summary.overdueCount} Overdue Claims</span>`.
- **Summary cards** (`grid grid-cols-1 md:grid-cols-2 gap-4`, fed by `usePanelClaimsSummary`):
  - *Submissions*: Pending (count), Overdue (count, red).
  - *Payouts (RM)*: Approved (emerald dot), Rejected (red dot), Received (teal dot — uses `receivedSum`), Outstanding (amber dot). All `RM XX.XX`.
- **Tabs** (shadcn `Tabs`): All, Pending, Overdue, Submitted, Approved, Rejected, Received, Cancelled. Filtering is **server-side** via the hook.
- **Table columns**:
  | Column | Source / format |
  |---|---|
  | Amount | `received_amount ?? amount` formatted `RM XX.XX`, right-aligned `tabular-nums`. On the **Received** tab, append `<span className="text-muted-foreground ml-1">(claimed: RM X.XX)</span>` when `received_amount` differs from `amount`. |
  | Claim No | `claim_no` |
  | Panel | `insurance_providers.name` |
  | Patient | `patients.name` |
  | Status | shadcn `Badge` via status map |
  | Date | `format(claim_date, 'd MMM yyyy')` |
  | Updated By | `updater.full_name ?? updater.email ?? '—'` |
  | Remarks | `max-w-[200px] line-clamp-1` |

- **Row highlight**: `<TableRow className={row.is_overdue ? "bg-destructive/10 hover:bg-destructive/20" : ""}>`.
- **Status badge map**:

| Status | Class / variant |
|---|---|
| pending | `bg-amber-100 text-amber-800 hover:bg-amber-100` |
| submitted | `bg-blue-100 text-blue-800 hover:bg-blue-100` |
| approved | `bg-emerald-100 text-emerald-800 hover:bg-emerald-100` |
| rejected | `variant="destructive"` |
| received | `bg-teal-100 text-teal-800 hover:bg-teal-100` |
| cancelled | `bg-muted text-muted-foreground hover:bg-muted` |

- **Pagination footer** (shadcn `Pagination`): "Page X of ⌈total/50⌉", Prev/Next disabled at bounds. Hidden when `total === 0`.
- **States**: 5 skeleton rows while `isLoading`; centered `FileText` icon + "No claims in this view" when `rows.length === 0`.

### 4. Routing — `src/App.tsx`

Add import alongside other clinic page imports and route inside the existing `/clinic` block (after `billings`):

```tsx
import PanelClaims from "./pages/clinic/PanelClaims";
…
<Route path="panel-claims" element={<PanelClaims />} />
```

(Existing clinic routes are direct imports in this project — match that style; no lazy wrapping unless the others are also lazy.)

### 5. Sidebar — `src/components/clinic/ClinicLayout.tsx`

Add `FileText` to the existing `lucide-react` import line and a new entry between Billings and Procurement in `clinicNavItems`:

```ts
{ href: '/clinic/panel-claims', label: 'Panel Claims', icon: FileText },
```

`specialAdminOnly` filter remains untouched.

---

### Out of scope

- Create / edit / delete claim mutations and forms.
- Auto-generating claims at checkout from panel/insurance payments.
- Bulk export, LHDN e-invoice linkage, backfill of `received_amount`.

### Files touched

| File | Action |
|---|---|
| `supabase/migrations/<ts>_panel_claims.sql` | **New** — enum, table, indexes, trigger, view, RLS. |
| `src/hooks/clinic/usePanelClaims.ts` | **New** — paginated `usePanelClaims` + light `usePanelClaimsSummary`. |
| `src/pages/clinic/PanelClaims.tsx` | **New** — header, summary cards, server-filtered tabs, table, row highlight, pagination. |
| `src/App.tsx` | **Edit** — import + route. |
| `src/components/clinic/ClinicLayout.tsx` | **Edit** — `FileText` import + nav entry. |

### Verification

1. Migration applies; `panel_claims` table + `panel_claims_view` exist; `pg_constraint` shows `fk_panel_claims_updated_by`; 4 RLS policies present.
2. `tsc --noEmit` passes.
3. `/clinic/panel-claims` renders empty state ("No claims in this view") since the table starts empty.
4. After inserting test rows (mix of statuses, some `due_date < CURRENT_DATE`, some with `received_amount < amount`):
   - Table paginates 50/page; Prev/Next reflects total count.
   - Overdue tab + red row tint match the DB's `is_overdue`; client clock changes do not affect them.
   - Received tab shows `received_amount` with `(claimed: RM …)` suffix on partial payments.
   - Outstanding total excludes any row with `status='received'`.
5. Sidebar shows new "Panel Claims" with FileText icon between Billings and Procurement; mobile sheet works.
6. Existing Billings / Queue / Consultation / Checkout pages unaffected.

