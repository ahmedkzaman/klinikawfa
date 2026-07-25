-- Consolidate legacy duplicate doctor profiles before enforcing the invariant
-- relied upon by useCurrentDoctor.
CREATE TEMP TABLE _doctor_merge_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY user_id
      ORDER BY created_at, id
    ) AS retained_id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at, id
    ) AS row_number
  FROM public.doctors
  WHERE user_id IS NOT NULL
)
SELECT id AS duplicate_id, retained_id
FROM ranked
WHERE row_number > 1;

UPDATE public.consultations AS consultation
SET doctor_id = merge.retained_id
FROM _doctor_merge_map AS merge
WHERE consultation.doctor_id = merge.duplicate_id;

UPDATE public.queue_entries AS queue_entry
SET assigned_doctor_id = merge.retained_id
FROM _doctor_merge_map AS merge
WHERE queue_entry.assigned_doctor_id = merge.duplicate_id;

UPDATE public.queue_entries AS queue_entry
SET called_by_doctor_id = merge.retained_id
FROM _doctor_merge_map AS merge
WHERE queue_entry.called_by_doctor_id = merge.duplicate_id;

UPDATE public.clinic_appointments AS appointment
SET doctor_id = merge.retained_id
FROM _doctor_merge_map AS merge
WHERE appointment.doctor_id = merge.duplicate_id;

-- room_assignments permits only one row per doctor. If both profiles have an
-- assignment, preserve the retained profile's existing assignment.
DELETE FROM public.room_assignments AS assignment
USING _doctor_merge_map AS merge
WHERE assignment.doctor_id = merge.duplicate_id
  AND EXISTS (
    SELECT 1
    FROM public.room_assignments AS retained_assignment
    WHERE retained_assignment.doctor_id = merge.retained_id
  );

UPDATE public.room_assignments AS assignment
SET doctor_id = merge.retained_id
FROM _doctor_merge_map AS merge
WHERE assignment.doctor_id = merge.duplicate_id;

DELETE FROM public.doctors AS doctor
USING _doctor_merge_map AS merge
WHERE doctor.id = merge.duplicate_id;

CREATE UNIQUE INDEX doctors_user_id_unique
  ON public.doctors (user_id)
  WHERE user_id IS NOT NULL;
