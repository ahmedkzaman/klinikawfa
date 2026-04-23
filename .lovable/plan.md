
## Final Wiring — Step 7

Three atomic tasks to make the ported Consultation/Procurement work reachable.

### 1. `src/App.tsx` — wire lazy routes

Inside the existing `<Route path="/clinic" element={<ClinicProtectedRoute><ClinicLayout/></ClinicProtectedRoute>}>` block:

- Add three lazy imports near the other clinic page lazy imports:
  ```ts
  const Consultation = lazy(() => import('./pages/clinic/Consultation'));
  const ConsultationDetail = lazy(() => import('./pages/clinic/ConsultationDetail'));
  const Procurement = lazy(() => import('./pages/clinic/Procurement'));
  ```
- Add three child routes:
  ```tsx
  <Route path="consultation" element={<Suspense fallback={<Loader/>}><Consultation/></Suspense>} />
  <Route path="consultation/:queueEntryId" element={<Suspense fallback={<Loader/>}><ConsultationDetail/></Suspense>} />
  <Route path="procurement" element={<Suspense fallback={<Loader/>}><Procurement/></Suspense>} />
  ```
- Remove the existing `<Route path="consultations" …>` line and its lazy import for `ConsultationsList`.

(`ClinicProtectedRoute` already wraps the parent — no per-route gating needed.)

### 2. Delete legacy placeholder

- Delete `src/pages/clinic/ConsultationsList.tsx` (no other references — verified the file is only imported by `App.tsx`).

### 3. `src/components/clinic/ClinicLayout.tsx` — sidebar

In the `clinicNavItems` array:
- Change `{ href: '/clinic/consultations', label: 'Consultations', icon: Stethoscope }` → `{ href: '/clinic/consultation', label: 'Consultation', icon: Stethoscope }`.
- Insert new entry directly after Dispensary:
  ```ts
  { href: '/clinic/procurement', label: 'Procurement', icon: ClipboardList },
  ```
- Add `ClipboardList` to the `lucide-react` import.

### Verification

1. `tsc --noEmit` passes.
2. Sidebar shows: Queue Board · Patients · Consultation · Dispensary · Procurement · (Voided Records for special admin).
3. `/clinic/consultation` renders the today's queue list.
4. `/clinic/consultation/:id` renders the workspace.
5. `/clinic/procurement` renders the pharmacist's queue.
6. `/clinic/consultations` (old path) → 404 inside clinic shell (acceptable; no inbound links remain).

Stop after these three edits.
