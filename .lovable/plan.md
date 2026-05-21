## Add "Assign Doctor" dropdown to RegisterAndCheckInDialog

### Discovery
- `queue_entries.assigned_doctor_id` already exists in the DB (FK → `public.doctors.id`, not `profiles`). **No migration needed.**
- A `useDoctors()` hook already fetches all doctors from the `doctors` table with `status` and `on_duty` fields. We'll reuse it.
- The dialog's insert payload lives at `src/components/clinic/RegisterAndCheckInDialog.tsx` lines 431–441.

### Changes (single file: `RegisterAndCheckInDialog.tsx`)

1. **Import** `useDoctors` from `@/hooks/clinic/useDoctors`.
2. **State**: `const [assignedDoctorId, setAssignedDoctorId] = useState<string | null>(null);`
   - Reset to `null` in the existing reset effect (when `open` becomes false / on submit success).
3. **Fetch**: call `useDoctors()` and filter to `status === 'active'` (sorted by name).
4. **UI**: in the visit/queue routing card (near visit type / payment), add a `<Select>` labeled **"Assign Doctor (Optional)"**.
   - Use a sentinel value (e.g. `"__any__"`) for "Any Available Doctor" because Radix Select can't use empty string. Map to `null` on change.
   - Render one `<SelectItem>` per active doctor with `doctor.name`.
   - Hide the field when `visit_type === 'direct_sale'` (dispensary-only flow — no doctor needed).
5. **Submit payload** (line 431 insert): add `assigned_doctor_id: isDirectSaleSubmit ? null : assignedDoctorId`.

### Out of scope
- No migration, no types regeneration (column already typed).
- No changes to queue board rendering, doctor filtering of queue, or other dialogs.
- No auto-routing of `clinic_status` — entry still lands in `registered`; doctors can still pick from the queue, but assignment metadata is persisted for the queue board to use later.
