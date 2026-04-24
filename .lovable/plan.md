

## Admin Dashboard — "High-Density Bento Box" Refactor

Pure presentational refactor of `src/pages/staff/admin/Dashboard.tsx`. **No data, hooks, state, queries, or routes are touched.** Every existing data point (4 stat tiles, doctors/support duty cards with on/off badges, `DailyReportsSummary`, `KanbanBoard`, 3 quick-action cards with pending badge) stays in place — only Tailwind classes and minor JSX wrapping change.

---

### 1. Page canvas

Wrap the current root `<div className="space-y-6">` in a soft-canvas shell:

```tsx
<div className="min-h-full bg-slate-50 -m-6 p-6 md:p-8">
  <div className="space-y-6 max-w-[1600px] mx-auto">
    …existing content…
  </div>
</div>
```

The `-m-6` neutralises StaffLayout's existing padding so the off-white canvas bleeds edge-to-edge, then re-applies generous internal padding. White cards will visually pop.

### 2. Shared "bento" card treatment

Every `<Card>` on this page gets the same class set (applied per-instance, no new component):

```
bg-white border-none rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]
```

Internal `CardHeader` / `CardContent` padding tightened to `p-5` (overriding the default `p-6`) for high data density.

### 3. Top-level header

```tsx
<h1 className="text-2xl font-bold tracking-tight text-slate-800">Admin Dashboard</h1>
<p className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
```

### 4. Stats bento grid (4 tiles — lines 195–200)

Grid: `grid grid-cols-2 md:grid-cols-4 gap-4`.

Each stat card pattern (kept inline, one per existing card — no shared component to keep diff minimal):

```tsx
<Card className="bento-card">
  <CardContent className="p-5">
    <div className="flex items-start justify-between">
      <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
        <Users className="h-6 w-6" />
      </div>
    </div>
    <div className="mt-4">
      <div className="text-3xl font-bold text-slate-800">{stats.totalEmployees}</div>
      <p className="text-sm font-medium text-slate-500 mt-1">Total Employees</p>
    </div>
  </CardContent>
</Card>
```

Per-tile pastel + icon colour pairing (one-line difference each):

| Tile | Icon container | Icon |
|---|---|---|
| Total Employees | `bg-blue-50 text-blue-600` | `Users` |
| Active Zones | `bg-emerald-50 text-emerald-600` | `Map` |
| Today's Punches | `bg-amber-50 text-amber-600` | `Clock` |
| Currently In | `bg-violet-50 text-violet-600` | `TrendingUp` |

### 5. Doctors / Support Staff "Today" cards (lines 117–193)

Keep the existing 2-column grid + all conditional rendering and badge logic untouched. Only:

- Apply the shared bento card class set.
- Tighten `CardHeader` to `pb-2`.
- Title: `text-base font-semibold text-slate-800`, icon container becomes `h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center` wrapping `Stethoscope` / `HardHat`.
- Section sub-labels ("On Duty" / "Off Duty") stay; tighten to `text-xs font-semibold text-slate-500 uppercase tracking-wide`.
- "On Duty" badges: `rounded-full bg-emerald-50 text-emerald-700 border-none` (replacing the green-100/green-800 pair, matching the soft-pastel system).
- "Off Duty" badges: `rounded-full bg-slate-50 text-slate-500 border-none`.
- Loading / empty paragraphs become `text-sm text-slate-400`.

### 6. `DailyReportsSummary` & `KanbanBoard` (lines 201–202)

Both are existing self-contained components — wrap each in a bento shell **without modifying the components themselves** (CRITICAL RULE):

```tsx
<div className="bg-white border-none rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5">
  <DailyReportsSummary />
</div>
<div className="bg-white border-none rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5">
  <KanbanBoard />
</div>
```

This guarantees zero behavioural change inside those components while still giving them the bento aesthetic on this page.

### 7. Quick Actions cards (lines 203–207)

Grid stays `md:grid-cols-2 lg:grid-cols-3 gap-4`. Each card:

```tsx
<Card className="bento-card">
  <CardContent className="p-5">
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
        <Users className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-semibold text-slate-800">Manage Employees</h3>
        <p className="text-sm text-slate-500">Add, edit, or remove staff</p>
      </div>
    </div>
    <Button asChild className="w-full mt-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
      <Link to="/staff/admin/employees">View Employees</Link>
    </Button>
  </CardContent>
</Card>
```

Per-card icon palette: Employees `blue`, Zones `emerald`, Requests `amber`. The pending-count chip on the Requests card stays (logic untouched) but restyled to `inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold px-2 py-0.5 ml-auto`.

### 8. Accent system summary

- Primary buttons: `rounded-xl bg-blue-600 hover:bg-blue-700 text-white`.
- Pastel icon tiles: `rounded-2xl bg-{color}-50 text-{color}-600`.
- Soft list dividers (used wherever rows appear inside this page's bento cards): `divide-y divide-slate-100` — applied to any row container if/when present (no new lists are introduced; rule documented for the doctor/support badge stacks which already use flex-wrap, so no dividers needed there).

---

### Files touched

| File | Action |
|---|---|
| `src/pages/staff/admin/Dashboard.tsx` | **Edit only** — Tailwind class changes, minor JSX wrapping. No import changes beyond what's already imported. |

### Out of scope (per CRITICAL RULE)

- `DailyReportsSummary`, `KanbanBoard`, `Card`, `Button`, `Badge` components — untouched.
- All `useEffect`s, fetchers, state, types — untouched.
- Routing, links, pending-count logic — untouched.

### Verification

1. `tsc --noEmit` passes.
2. `/staff/admin` renders with off-white canvas, white rounded-3xl bento cards, soft diffuse shadows.
3. All four stat tiles show the same numbers as before, with pastel icon chips and `text-3xl` figures.
4. Doctors/Support cards still show on-duty badges with shift labels and off-duty muted badges; loading and empty states still render.
5. Daily reports + Kanban board render unchanged inside their new white shells.
6. Quick-action buttons navigate to `/staff/admin/employees`, `/staff/admin/zones`, `/staff/admin/requests`; pending-count chip still appears when `pendingCount > 0`.
7. No console errors; no layout shift on the existing 1391×861 viewport; responsive grid collapses correctly at `md` and below.

