

## Role-Based Queue Board Actions & Strict Workflow Enforcement

Two-file edit splitting responsibility: front desk (`QueueBoard.tsx`) gets a strict, status-gated action panel with **no `on_hold` recovery**; the doctor's view (`Consultation.tsx`) gains the **only** `on_hold` recovery hatch via a "Resume Patient" row action. This removes state amnesia (front desk can't blindly push paused patients back to the doctor queue) and gives the attending doctor — who knows the clinical context — the sole authority to resume.

---

### Part A — `src/pages/clinic/QueueBoard.tsx` (front desk)

**Imports** (extend existing): add `useNavigate` from `react-router-dom`. `useUpdateQueueEntry`, `toast`, and `updateQueue` are already wired.

**Instantiate**: `const navigate = useNavigate();` alongside the existing `updateQueue`.

**Visuals**: Kanban card (`QueueCard`) untouched — no extra badges.

**Sheet footer action block** (current lines 268–313) is replaced with strict per-status branching:

| `activeEntry.clinic_status` | Rendered control |
|---|---|
| `registered` | **Send to Doctor** button — `disabled={updateQueue.isPending \|\| !activeEntry}`; label flips to `Updating...` only when `updateQueue.variables?.clinic_status === 'ready_for_doctor'`; `onClick` null-guards then `updateQueue.mutate({ id, clinic_status: 'ready_for_doctor' }, { onSuccess: close sheet + `toast.success('Patient called to doctor')`, onError: `toast.error('Update failed: ' + err.message)` })`. |
| `sent_to_dispensary` or `dispensing_payment` | **Open Checkout** button (`variant="outline"`) — `onClick` calls `navigate('/clinic/queue/checkout/' + activeEntry.id)` then `setActiveEntry(null)`. |
| `on_hold` | **No buttons.** Render a read-only muted `<p>`: *"Patient is on hold. Status can only be resumed by the attending doctor."* |
| `ready_for_doctor`, `with_doctor`, `completed` | Render nothing in the action block. |

The existing "Mark Done" omission comment is dropped (superseded by the new branching). `wasOnHold` resume logic is removed entirely from this file — it now lives only in Consultation.

---

### Part B — `src/pages/clinic/Consultation.tsx` (doctor's view)

**Imports** (extend existing line 20): also import `useUpdateQueueEntry`. Add `import { toast } from 'sonner';`. `useNavigate` is already imported.

**Instantiate**: `const resumeQueue = useUpdateQueueEntry();` alongside the existing `callPatient`.

**Row action cell** (current lines 272–310) — restructure the leading branch so `on_hold` takes precedence over the existing checkout/view fork:

```text
if entry.clinic_status === 'on_hold'
    → <Button size="sm" variant="default">  // Resume Patient
        disabled = resumeQueue.isPending && resumeQueue.variables?.id === entry.id
        label    = same condition ? 'Resuming...' : 'Resume Patient'
        onClick  = resumeQueue.mutate(
                     { id: entry.id, clinic_status: 'with_doctor' },
                     { onSuccess: toast.success('Patient resumed — back with doctor')
                                  + navigate('/clinic/consultation/' + entry.id),
                       onError:   toast.error('Resume failed: ' + err.message) }
                   )
else if ['sent_to_dispensary','dispensing_payment'].includes(entry.clinic_status)
    → existing "Checkout" button (unchanged)
else
    → existing "View" button (unchanged)
```

The doctor-only **Call In** button (current lines 293–309) for `registered` / `ready_for_doctor` patients stays untouched.

---

### Resulting workflow guarantees

- Front desk **cannot** resume `on_hold` patients → no state amnesia, no accidental dispensary→doctor regression.
- Front desk **cannot** force `completed` from any status → revenue-leak loophole stays sealed; dispensary patients can only progress through `/clinic/queue/checkout/:id`.
- Doctor's table is the single, clinically-aware exit from `on_hold`, landing the patient back in `with_doctor` and routing the doctor straight into the consultation page.
- Per-button loading labels keyed off `mutation.variables` prevent the shared-state UX bug in both files.
- All mutations have `onError` toasts surfacing the underlying message; sheets/rows stay open on failure for retry.

### Verification

1. `tsc --noEmit` passes.
2. QueueBoard, `registered` patient → **Send to Doctor** only; advances to `ready_for_doctor`, sheet closes, success toast.
3. QueueBoard, `sent_to_dispensary` / `dispensing_payment` → **Open Checkout** only; navigates to `/clinic/queue/checkout/:id`, sheet closes.
4. QueueBoard, `on_hold` → no buttons; only the read-only "resumed by the attending doctor" message visible.
5. QueueBoard, `ready_for_doctor` / `with_doctor` / `completed` → no action controls.
6. Consultation table, `on_hold` row → **Resume Patient** button; click sets status to `with_doctor`, success toast, navigates to `/clinic/consultation/:id`. Per-row loading state isolated by `variables.id`.
7. Consultation table, dispensary statuses → **Checkout** (unchanged). All other statuses → **View** (unchanged). **Call In** still appears for doctors on `registered`/`ready_for_doctor` rows.
8. Forced RLS denial on either mutation → red error toast surfaces the message; UI stays open for retry.

