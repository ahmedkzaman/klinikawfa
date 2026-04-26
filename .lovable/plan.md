## Goal
Redesign every page under `/clinic/*` (and their feature components) to match the **bento style** established in `ConsultationDetail.tsx`. Visual parity only — no logic, data, or routing changes.

## Design Tokens (mirrored from ConsultationDetail)

```ts
const bento        = "bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)]";
const bentoHeader  = "text-sm font-bold text-slate-800 uppercase tracking-wider mb-3";
const softInput    = "bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 rounded-lg";
const pageShell    = "min-h-full bg-slate-50 -m-4 md:-m-6 p-4 md:p-6";
const pageInner    = "max-w-[1600px] mx-auto space-y-4";
const primaryBtn   = "rounded-xl bg-blue-600 hover:bg-blue-700 text-white";
const softBadge    = "rounded-full bg-slate-50 text-slate-600 border-none";
const softTile     = "rounded-xl bg-slate-50 px-3 py-2";          // labels / pill rows
const pillTab      = "rounded-full px-3 py-1 text-xs font-medium"; // active = bg-blue-600 text-white, idle = bg-slate-50 text-slate-600
```

A shared helper file `src/lib/clinic/bentoTokens.ts` will export these constants so every page references the same source of truth (avoids drift if we tune the look later).

## Scope — Pages

Each page gets:
1. Wrapped in `pageShell` + `pageInner`.
2. All `Card` instances swapped to the `bento` token (no border, soft shadow, rounded-2xl).
3. Section titles → uppercase `bentoHeader`.
4. Inputs/Selects/Textareas → `softInput`.
5. Primary actions → `primaryBtn`; secondary → ghost on `bg-slate-50`.
6. Tables: header row `bg-slate-50 text-slate-500 uppercase tracking-wider text-xs`, body rows `hover:bg-slate-50/60`, no harsh borders.
7. Tabs (where present) → pill style.
8. Status/role badges → `softBadge` variants.

| Page | Notes |
|---|---|
| `Consultation.tsx` (queue list) | Header bar + queue table become bento; status chips → soft pills. |
| `ConsultationDetail.tsx` | Already the reference — only refactor inline strings into the shared token import. |
| `QueueBoard.tsx` | Kanban columns become bento cards; column headers uppercase; cards inside white with soft hover. |
| `PatientsList.tsx` | Search bar → soft input; result rows → bento card grid; Patient Profile sheet inherits soft inputs. |
| `Billings.tsx` | Filter strip + table reskinned; "Record payment" CTA → primary blue. |
| `DispenseCheckout.tsx` | Two-column bento layout; line-item rows → `softTile`. |
| `PanelClaims.tsx` | Tabs → pill tabs; claim list → bento cards; status badges recolored to soft palette. |
| `Inventory.tsx` | Toolbar + inventory table reskinned. |
| `Procurement.tsx` | Same treatment as Inventory. |
| `VoidedRecords.tsx` | Audit table reskinned, danger states use `bg-red-50 text-red-700` soft chips. |
| `Insight.tsx` + 5 tabs (`OverviewTab` inline, `ScoreboardsTab`, `LeaderboardsTab`, `ValuationTab`, `BankHealthTab`) | Apply bento to all chart/table cards, pill tabs, soft inputs for date pickers, blue-600 CTAs, slate tooltips on Recharts. |
| `_Placeholder.tsx` | Empty-state card → centered bento card with muted icon. |

### Settings sub-pages
| Page | Notes |
|---|---|
| `SettingsPage.tsx` | Sidebar nav → pill list; content frame → bento. |
| `InClinicSettings.tsx` | Form sections grouped into bento cards. |
| `DrugLabelSettings.tsx` | Preview pane in bento; form on left in soft inputs. |
| `InventorySettings.tsx` | Toolbar + table reskinned. |
| `PanelsSettings.tsx` | List + dialog trigger reskinned. |
| `UserManagementSettings.tsx` | User table + role chips reskinned. |
| `DiagnosisSweeper.tsx` | Two-column compare layout in bento. |

## Scope — Shared Clinic Components
- `ClinicLayout.tsx` — set the outer surface to `bg-slate-50`, top bar to `bg-white border-b border-slate-100`, sidebar items to slate-500 idle / blue-600 active pills.
- `StatusBadge.tsx` — soft palette (`bg-{color}-50 text-{color}-700`) instead of saturated fills.
- `PatientPicker.tsx`, `CheckInAppointmentDialog.tsx`, `CheckInWalkInDialog.tsx`, `RegisterAndCheckInDialog.tsx`, `RegisterPatientDialog.tsx` — Dialog content uses bento card chrome, soft inputs, primary blue CTA.
- `consultation/*` (already aligned, light pass for token consistency).
- `visit/AttachmentsCard.tsx`, `visit/BillingDetailsColumn.tsx`, `visit/VisitDetailsColumn.tsx`, `visit/RecordPaymentDialog.tsx` — bento cards, soft tiles for line items, pill status chips.
- `patient/FollowUpScheduler.tsx` — soft input date row, blue-600 CTA.
- `settings/DoctorProfileDialog.tsx`, `InventoryItemDialog.tsx`, `PackageDialog.tsx`, `PanelDialog.tsx`, `ServiceDialog.tsx` — Dialog header strip, sectioned bento blocks, soft inputs, sticky bottom action bar (white/90 backdrop blur, like ConsultationDetail's save bar).
- `insight/*` — already drafted in last step; this pass enforces the shared token imports.

## What I will NOT change
- Data hooks, queries, mutations, routes, validation, business logic.
- The clinic sidebar information architecture.
- Component file boundaries (no splits/renames).
- Color semantics for hard medical states (errors stay red, success stays green) — only desaturated to the soft palette.

## Approach / Order
1. Create `src/lib/clinic/bentoTokens.ts` with the shared constants.
2. Update `ClinicLayout` + `StatusBadge` first (affects every screen).
3. Sweep page-by-page in the order listed above, one PR-sized batch per group:
   - Operational pages (Consultation, QueueBoard, PatientsList, Billings, DispenseCheckout, PanelClaims).
   - Inventory/Procurement/VoidedRecords.
   - Insight + 5 tabs.
   - Settings hub + 6 sub-pages.
   - Shared dialogs and visit/patient components.
4. Final TypeScript check (`npx tsc --noEmit`) and a visual smoke test of each route.

## Risks / Trade-offs
- ~30 files touched; large diff but mechanical (className edits).
- Recharts default tooltip/legend will be restyled inline per chart — minor repetition is acceptable to keep charts self-contained.
- StatusBadge palette change is global; if any screen relies on a specific saturated color for emphasis, it will soften — acceptable per the "full visual parity" directive.

## Deliverable
Every `/clinic/*` route reads as one cohesive product: slate-50 canvas, white rounded-2xl bento cards with whisper shadows, uppercase section labels, soft slate-50 inputs, blue-600 primary actions, and pill-style tabs/badges — indistinguishable in feel from `ConsultationDetail`.
