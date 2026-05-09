# Sprint 2 — Dashboard.tsx & Punch.tsx

Presentation only. No data, hooks, routing, or guard changes. Strip `dark:` variants in touched files.

## Shared changes (both files)

- Wrap entire return in `<div className={pageShell}><div className={pageInner}> … </div></div>`.
- Page header: `<h1 className="text-2xl font-bold tracking-tight text-slate-800">` + `<p className="text-sm text-slate-500">`.
- Replace shadcn `<Card>` with `<div className={cn(bento, 'p-4')}>` (or `p-5/p-6`); drop `<CardHeader>/<CardTitle>/<CardDescription>/<CardContent>` and use semantic `<h2 className={bentoHeader}>` + `<p className="text-sm text-slate-500">`.
- Loader spinners → `text-blue-600`.

## `src/pages/staff/Dashboard.tsx`

- Notifications card: bento with `border border-blue-100 bg-blue-50/40` accent (preserved blue tint), header uses `bentoHeader`, "Mark all read" button stays ghost but `text-blue-700`. Unread count pill → `bg-blue-600 text-white`. Each notification row → `softTile` with `hover:bg-slate-100`.
- Stat cards (Current Status, Today's Punches): bento, label `fieldLabel`, value `text-2xl font-bold text-slate-800`, helper `text-xs text-slate-500`. Status icon colors: green-500 / slate-400 stay.
- Quick Actions card: bento. Primary CTA `primaryBtn`; secondary `secondaryBtn`.
- Today's Timeline card: bento, header `bentoHeader`, each row uses slate dots (in=emerald-500, out=rose-500), text `text-slate-700` / `text-slate-500`.
- `KanbanBoard` and `DailyReportingCard` stay rendered as-is (Sprint 4 will restyle them); they'll inherit the slate-50 canvas.

## `src/pages/staff/Punch.tsx`

- Outer container: `pageShell` + `pageInner` with an inner `max-w-lg mx-auto` for the form column.
- Active Shift bento: header `bentoHeader` ("Active Shift"), shift label text `text-slate-700`. Badges (`shiftKey`, "cross-midnight") use `softBadge` + variant; clock-skew alert keeps `Alert variant="destructive"`.
- Location Status bento: header `bentoHeader` ("Location Status"), description `text-sm text-slate-500`. Accuracy line keeps semantic colors (emerald-600 / amber-600 / rose-600). Inside/outside zone block uses `rounded-xl` with emerald-50/border-emerald-200 or rose-50/border-rose-200 (drop `dark:` variants). Refresh button → `secondaryBtn`.
- Record Attendance bento: header `bentoHeader` ("Record Attendance"), last-punch line `text-sm text-slate-500`. The big Punch button keeps semantic green/red (emerald-600 / rose-600 with `rounded-xl h-20 text-lg`) — this is the "carve-out" for the punch CTA per Sprint 1's note (semantic urgency wins over blue brand). Helper text `text-slate-500`.
- `FaceVerificationModal` invocation untouched (camera frame + logic).

## Out of scope
- `KanbanBoard`, `DailyReportingCard`, `FaceVerificationModal` internals (Sprint 4).
- Any business logic, geofence math, RPC, or state.

## Verification
- `/staff/dashboard` shows slate-50 canvas, white bento cards, blue accents, no dark seams.
- `/staff/punch` shows three bento cards in a centered column; punch button still green/red; camera modal unchanged.
