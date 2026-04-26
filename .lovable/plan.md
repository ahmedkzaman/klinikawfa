## Step 29 — Yezza-Style Tabbed Treatment List & Medicine-Only Label Printing

### Architectural Decision: Replace `VisitDetailsColumn` rather than wrap it

The treatment list lives inside **`src/components/clinic/visit/VisitDetailsColumn.tsx`** (not in `DispenseCheckout.tsx` directly — the original prompt was slightly off). That component currently renders a flat list with no tabs, no print buttons, no kind-filtering, and no Yezza-style typography. Rather than bolt tabs on top, I'll do a clean rewrite of that single file so the new layout matches the screenshot 1:1, and leave `DispenseCheckout.tsx` untouched (it already mounts `<VisitDetailsColumn>` in the middle column).

The "Documents" tab is the natural home for the existing `consultation_attachments` (uploaded labs/photos), so we'll fold them in there using the already-built `useConsultationAttachments` hook — this also explains why the screenshot shows "Documents (0)" as a peer tab.

---

### A. Tabbed Navigation (`src/components/clinic/visit/VisitDetailsColumn.tsx`)

Replace the existing flat list with a `<Tabs>` component using the shadcn primitives we already have (`@/components/ui/tabs`).

**Tabs (in order):** `All` · `Items` · `Services` · `Packages` · `Documents`

**Filter logic** (computed once via `useMemo`):
```ts
const itemsRows     = items.filter(i => i.item_id    != null);   // medicines
const servicesRows  = items.filter(i => i.service_id != null);   // consultation, RCC, procedures
const packagesRows  = items.filter(i => i.package_id != null);
// "All" = items (full unfiltered consultation_items list)
// "Documents" = attachments from useConsultationAttachments (already exists)
```

**Count badges** rendered as a small pill next to each tab label, e.g. `All` `11`, matching the grey rounded badge in the screenshot. Use the existing `Badge` component with `variant="secondary"` and a tighter `h-5 px-1.5 text-[10px]` size.

For "Documents" the count comes from `useConsultationAttachments(consultationId).data?.length ?? 0`.

**Note on free-text rows:** The `trg_resolve_selling_price` trigger explicitly handles rows where all three FK columns are null (manual / free-text). Per the spec these will appear under **All** but won't match Items / Services / Packages — that's correct, they're neither catalog medicines nor catalog services. The "All" tab keeps them visible so nothing is hidden from the staff.

---

### B. Medicine-Only Print Logic

Inside the row renderer, the `Print label` button is gated by:

```tsx
{item.item_id && canEdit && (
  <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={() => handlePrintLabel(item)}>
    <Tag className="h-3 w-3 mr-1.5" />
    Print label
  </Button>
)}
```

- Services (Consultation Fee, RCC, Branula Insertion in the screenshot) — no `item_id` → button is **completely hidden**, not disabled. Matches the screenshot exactly.
- Packages — also hidden (packages are billing constructs, not physical items to label).
- For now `handlePrintLabel(item)` triggers `window.print()` after stashing a single-row payload in component state and rendering a hidden `<div className="hidden print:block">…</div>` with the medicine name, dosage, frequency, instruction, patient name (passed in via a new optional `patientName` prop on `VisitDetailsColumn`). This keeps the implementation client-side and avoids any new infra. We'll iterate on a proper label template later if the user wants barcode/QR.

---

### C. Bulk Actions Header

Directly **below the tab strip and above the list**, render a header row with two ghost-style outline buttons (matching the screenshot's pill outlines):

```tsx
<div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
  <div className="flex gap-2">
    <Button variant="outline" size="sm" className="h-8 rounded-full text-xs"
            onClick={handlePrintAllLabels}
            disabled={medicineRows.length === 0}>
      <Tag className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
      Print all labels
    </Button>
    <Button variant="outline" size="sm" className="h-8 rounded-full text-xs"
            onClick={handlePrintAllDocuments}
            disabled={attachments.length === 0}>
      <FileText className="h-3.5 w-3.5 mr-1.5" />
      Print all documents
    </Button>
  </div>
  {canEdit && <Button variant="outline" size="sm" className="h-8 rounded-full text-xs">Edit</Button>}
</div>
```

**`handlePrintAllLabels`** filters to `items.filter(i => i.item_id != null)` only — services and procedures are skipped per spec. It renders all selected medicines into the hidden print container then calls `window.print()`.

**`handlePrintAllDocuments`** opens each attachment's `signedUrl` in a new tab (browser print dialog from the PDF/image preview). Disabled when there are zero attachments.

The `Edit` button is a stub for now (no spec behavior requested) — kept visible to match the screenshot but wired only to a no-op + comment so we don't introduce unintended UX.

---

### D. Yezza Row Styling

Each row in the All / Items / Services / Packages tabs follows this layout (matches screenshot):

```tsx
<div className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/30">
  <div className="flex-1 min-w-0">
    {/* Bold uppercase name */}
    <div className="text-sm font-bold uppercase tracking-tight text-foreground">
      {item.item_name}
    </div>
    {/* Pricing tier sub-line */}
    <div className="text-xs text-muted-foreground mt-0.5">
      {(item.price_tier ?? 'SELF PAY')}, RM {Number(item.price ?? 0).toFixed(2)}
    </div>
    {/* Dosage chips — only when present, only for medicines */}
    {item.item_id && dosageBits.length > 0 && (
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500 uppercase tracking-wide">
        {dosageBits.map((bit, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 && <span className="mx-1.5 text-slate-300">|</span>}
            {bit}
          </span>
        ))}
      </div>
    )}
  </div>

  <div className="flex flex-col items-end gap-1.5 shrink-0">
    <div className="text-sm font-semibold tabular-nums">
      RM {(Number(item.price ?? 0) * (item.quantity ?? 0)).toFixed(2)}
    </div>
    {item.item_id && canEdit && (
      <Button variant="outline" size="sm" className="h-7 rounded-full text-xs">
        <Tag className="h-3 w-3 mr-1.5" /> Print label
      </Button>
    )}
  </div>
</div>
```

**Dosage chip composition** (screenshot shows e.g. `KUAT INJAP | 1 BIJI | 3X SEHARI` and `GASTRIK | 10 ML | 3X SEHARI | SELEPAS MAKAN`):

```ts
const dosageBits = [
  item.indication,                                                   // KUAT INJAP / GASTRIK
  item.dosage_qty && item.dosage_unit
    ? `${item.dosage_qty} ${item.dosage_unit}`                       // 1 BIJI / 10 ML
    : item.dosage,                                                    // legacy fallback
  item.frequency,                                                    // 3X SEHARI
  item.instruction,                                                  // SELEPAS MAKAN
].filter(Boolean).map(s => String(s).toUpperCase());
```

This pulls from the existing `consultation_items` columns — no schema changes needed.

**Quantity controls (+/− and Trash):** Move into a compact icon-only row under the price block, kept behind `canEdit`. The screenshot doesn't show them because the user is in a "view" pose, but they're functional needs from the existing component — we keep them rather than regress dispensary editability.

---

### E. Documents Tab Content

When the active tab is `Documents`, render a vertically stacked list of the existing attachment rows reusing the same data shape returned by `useConsultationAttachments`:

```tsx
<TabsContent value="documents" className="m-0">
  {attachments.length === 0 ? (
    <EmptyState icon={FileText} title="No documents attached" hint="Lab results and photos uploaded for this visit appear here." />
  ) : (
    <ul className="divide-y divide-border">
      {attachments.map(a => (
        <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {(a.content_type ?? '').startsWith('image/') ? <ImageIcon className="h-4 w-4 text-slate-500" /> : <FileText className="h-4 w-4 text-slate-500" />}
            <div className="min-w-0">
              <div className="text-sm font-bold uppercase truncate">{a.file_name}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'd MMM yyyy, h:mma')}</div>
            </div>
          </div>
          {a.signedUrl && <a href={a.signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">View</a>}
        </li>
      ))}
    </ul>
  )}
</TabsContent>
```

This means **`AttachmentsCard` continues to be the upload UI** (sits above the treatment list in `DispenseCheckout.tsx` — unchanged), but the listing is now also surfaced inside the tabbed list under "Documents" so the doctor/staff can see everything in one place.

---

### F. Empty States Per Tab

Each tab gets a tailored empty state (`Items`, `Services`, `Packages`, `Documents`) using the existing `Pill` / `Stethoscope` / `Package` / `FileText` icons from lucide-react. Keeps the UX feeling intentional rather than blank.

---

### Files Touched

| File | Change |
|---|---|
| `src/components/clinic/visit/VisitDetailsColumn.tsx` | **Full rewrite** — tabs, filters, Yezza row styling, conditional Print label, bulk actions header, documents tab |

### Files NOT touched (intentionally)

- `src/pages/clinic/DispenseCheckout.tsx` — already passes `consultationId` and `canEdit` to `<VisitDetailsColumn>`. The `<AttachmentsCard>` upload widget stays where it is. Layout unchanged.
- `src/hooks/clinic/useConsultationItems.ts` — selecting `*` already returns `item_id`, `service_id`, `package_id`, `price_tier`, `indication`, `dosage_qty`, `dosage_unit`, `frequency`, `instruction`. No hook change needed.
- `src/hooks/clinic/useAttachments.ts` — `useConsultationAttachments` already exists and is used here.
- DB schema — no migration required.

### Print implementation note

Print labels uses a small in-component hidden block: `<div className="hidden print:block fixed inset-0 bg-white p-6 z-50">…</div>` populated via local state, then `setTimeout(() => window.print(), 50)` followed by clearing the state on `onafterprint`. This is good enough for v1 thermal-label printing from the dispensary. If the user later wants Zebra/Brother-specific raw ESC/POS output we'll plan that separately.