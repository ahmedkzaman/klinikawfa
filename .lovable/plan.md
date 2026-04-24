

## Consultation View — "High-Density Clinical Bento" Refactor (with mobile + sticky-footer patches)

Pure presentational refactor of **`src/pages/clinic/ConsultationDetail.tsx`**. Logic, hooks, mutations, routing, and child components are untouched. Tailwind + JSX wrapping only.

---

### 1. Page canvas & header strip

```tsx
<div className="min-h-full bg-slate-50 -m-4 md:-m-6 p-4 md:p-6">
  <div className="max-w-[1600px] mx-auto space-y-4">
    {/* Header bar — wrapped in white bento */}
    <div className="bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-4 flex items-center justify-between gap-3 flex-wrap">
      …existing back button, doctor avatar, waiting badge, Call In dropdown, StatusBadge…
    </div>
    {/* Split-pane grid below */}
  </div>
</div>
```

Header tweaks (class-only): queue badge `Q{n}` → `rounded-xl bg-blue-50 text-blue-700 border-none font-mono text-base`; "Call In" button → `rounded-xl bg-blue-600 hover:bg-blue-700 text-white`.

### 2. Split-pane grid — **mobile order swapped (PATCH 1)**

DOM order: **workspace first, context second.** Visual order on `lg:` flipped via `order-*`:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
  <main  className="order-1 lg:order-2 lg:col-span-8 space-y-4 flex flex-col pb-24 relative">
    …workspace cards…
  </main>
  <aside className="order-2 lg:order-1 lg:col-span-4 space-y-4">
    …context cards…
  </aside>
</div>
```

Result: on mobile (single column), the doctor lands on the workspace immediately; demographics/vitals/history flow below. On `lg:` and up, context sits on the left (4/12), workspace on the right (8/12).

### 3. Shared bento class

```ts
const bento = "bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)]";
const bentoHeader = "text-sm font-bold text-slate-800 uppercase tracking-wider mb-3";
```

`CardHeader` → `pb-2`; `CardContent` → `p-5`.

### 4. LEFT column (`<aside>`, `lg:col-span-4`) — read-only context

In this top-down order:

- **Demographics** — `bento`, `p-5`. Patient name `text-base font-semibold text-slate-800` with a `User` icon in `bg-blue-50 text-blue-600 rounded-lg p-1.5`. DOB / IC / Gender as a 2-col `text-sm text-slate-600` grid. Payment chip `inline-flex rounded-full bg-slate-50 text-slate-600 text-xs px-2 py-0.5`.
- **Visit Note** (receptionist intake) — `bento`. Header `VISIT NOTE`. Body `text-sm whitespace-pre-wrap text-slate-700`.
- **Vital Signs** — `bento`. Header `VITAL SIGNS` + Edit/Record button (`rounded-lg`). The 8-tile vitals grid → mini-bento tiles:
  ```tsx
  <div className="bg-slate-50 rounded-xl p-3 text-center">
    <div className="text-xl font-bold text-slate-800">{val ?? '—'}</div>
    <div className="text-xs text-slate-500 mt-0.5">{label}{unit ? ` (${unit})` : ''}</div>
  </div>
  ```
  Edit-form inputs gain `bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 rounded-lg`. `<VitalHistoryTrends />` rendered as-is.
- **Patient History** — moved here from the right tab. `bento`, header `PAST VISITS`. Strip per-row inner cards; render as `divide-y divide-slate-100` list. Pagination buttons → `rounded-lg`.
- **Upcoming Appointments** — `bento`, header `UPCOMING`. Row pills `rounded-lg bg-slate-50 px-3 py-2`.

### 5. RIGHT column (`<main>`, `lg:col-span-8`) — active workspace

Tabs wrapper removed (history moved left). Stack:

**a. Consultation Notes — document canvas**

```tsx
<Card className={bento}>
  <CardContent className="p-5 space-y-4">
    <h2 className={bentoHeader}>CONSULTATION NOTES</h2>
    <Textarea
      value={caseNote}
      onChange={…}
      className="min-h-[400px] resize-y bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 rounded-xl p-4 text-base leading-relaxed text-slate-800"
    />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Diagnosis</Label>
        <Input … className="bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 rounded-lg" />
      </div>
      <div>
        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dispense Note</Label>
        <Textarea rows={3} … className="bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 rounded-lg" />
      </div>
    </div>
  </CardContent>
</Card>
```

The in-card "Save Notes" button is removed (deduped — see footer below; same `handleSaveNotes` handler reused).

**b. Treatment Plan**

`bento`, `p-5`. Header row horizontal: `TREATMENT PLAN` label + search + "Add in bulk" on one line.
- Search: `bg-slate-50 border-transparent rounded-lg pl-9`.
- Category pills: active `rounded-full bg-blue-600 text-white`, idle `rounded-full bg-slate-50 text-slate-600 border-none hover:bg-slate-100`.
- `<TreatmentItemCard>` rows untouched.
- Total row: `rounded-xl bg-slate-50 px-4 py-3 flex items-center justify-between text-sm`.

**c. Sticky action footer (PATCH 2)**

Replaces the old `<Separator />` + button row. **No `mt-auto`** — uses `sticky bottom-4` so it floats above scrolling workspace content. Parent `<main>` has `pb-24` so the last Treatment Plan row clears the floating footer.

```tsx
<div className="sticky bottom-4 z-10 bg-white/90 backdrop-blur-md border border-slate-100 rounded-2xl shadow-lg p-4 flex items-center justify-between gap-3 flex-wrap">
  <div className="text-sm">
    <span className="text-slate-500">Total</span>{' '}
    <span className="text-xl font-bold text-slate-800">RM {total.toFixed(2)}</span>
  </div>
  <div className="flex gap-2">
    <Button
      variant="outline"
      onClick={handleSaveNotes}
      disabled={updateConsultation.isPending}
      className="rounded-xl"
    >
      Save Draft
    </Button>
    <Button
      onClick={handleSendToDispensary}
      disabled={updateQueue.isPending}
      className="px-8 py-6 rounded-xl text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md"
    >
      Send to Dispensary
    </Button>
  </div>
</div>
```

### 6. Accent system (this page)

| Element | Class |
|---|---|
| Bento card | `bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)]` |
| Section header | `text-sm font-bold text-slate-800 uppercase tracking-wider mb-3` |
| Pastel icon tile | `bg-blue-50 text-blue-600 rounded-lg p-1.5` |
| Mini-bento metric | `bg-slate-50 rounded-xl p-3 text-center` |
| Soft input | `bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 rounded-lg` |
| Notes canvas | adds `min-h-[400px] focus-visible:ring-2 focus-visible:ring-blue-200 p-4 text-base leading-relaxed` |
| Primary button | `rounded-xl bg-blue-600 hover:bg-blue-700 text-white` |
| Sticky footer | `sticky bottom-4 z-10 bg-white/90 backdrop-blur-md border border-slate-100 rounded-2xl shadow-lg` |
| Pill (active / idle) | `rounded-full bg-blue-600 text-white` / `rounded-full bg-slate-50 text-slate-600` |
| Dividers | `divide-y divide-slate-100` |

---

### Files touched

| File | Action |
|---|---|
| `src/pages/clinic/ConsultationDetail.tsx` | **Edit only** — Tailwind + JSX restructure (column DOM-order swap, tabs removed, sticky footer added, `pb-24` on `<main>`). No new imports. |

### Out of scope

- All child components (`TreatmentItemCard`, `AddTreatmentBulkDialog`, `VitalHistoryTrends`, `StatusBadge`, shadcn primitives) — untouched.
- All hooks, mutations, `useState`/`useEffect`/`useMemo`, handlers (`handleSaveNotes`, `handleSaveVitals`, `handleBulkInsert`, `handleSendToDispensary`, `handleCallIn`) — untouched.
- Routing, auto-create-consultation effect — untouched.

### Verification

1. `tsc --noEmit` passes.
2. **Mobile (<lg)**: workspace (notes → treatment plan → sticky footer) appears first; context (demographics, vitals, history, upcoming) stacks below. Doctor lands on the editable canvas without scrolling past patient context.
3. **Desktop (≥lg)**: visual layout is context-left (4/12), workspace-right (8/12), thanks to `order-1 lg:order-2` / `order-2 lg:order-1`.
4. The action footer **floats** above workspace content as the user scrolls (`sticky bottom-4`), with translucent white blur and shadow; never gets pushed below the fold.
5. `<main>` has `pb-24`, so the bottom of the Treatment Plan card is fully readable above the floating footer.
6. `caseNote` textarea is ≥400px tall, slate-50 idle, white-with-blue-ring on focus.
7. Vitals render as mini-bento tiles; edit form still saves; trends render.
8. Patient history paginates as before, just unboxed.
9. Treatment plan: search, category pills, "Add in bulk", per-row save/remove all work via existing mutations.
10. "Save Draft" persists notes via `handleSaveNotes`; "Send to Dispensary" still completes consultation, sets queue `sent_to_dispensary`, navigates back.
11. "Call In" dropdown unchanged.
12. No console errors.

