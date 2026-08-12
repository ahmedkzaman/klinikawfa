-- Recovery snapshot for the narrowly scoped historical classification repair.
-- Consultations with any completed-bill correction audit are deliberately absent.
CREATE TABLE private.other_charge_backfill_20260813 AS
SELECT
  ci.id AS consultation_item_id,
  ci.consultation_id,
  ci.item_name,
  ci.billing_adjustment_kind AS previous_adjustment_kind,
  ci.clinic_charge_type_id AS previous_charge_type_id,
  cct.id AS repaired_charge_type_id,
  pg_catalog.now() AS captured_at
FROM public.consultation_items ci
JOIN public.clinic_charge_types cct
  ON cct.is_active
 AND (
   pg_catalog.lower(pg_catalog.btrim(ci.item_name)) =
     pg_catalog.lower(pg_catalog.btrim(cct.name))
   OR (
     cct.name = 'Regulatory Compliance Charges'
     AND pg_catalog.lower(pg_catalog.btrim(ci.item_name)) IN (
       'regulatory compliance charge (rcc)',
       'regulatory compliance charge'
     )
   )
 )
WHERE ci.deleted_at IS NULL
  AND ci.billing_adjustment_kind IS NULL
  AND ci.clinic_charge_type_id IS NULL
  AND ci.item_id IS NULL
  AND ci.service_id IS NULL
  AND ci.package_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.completed_bill_correction_audit audit
    WHERE audit.consultation_id = ci.consultation_id
  );

ALTER TABLE private.other_charge_backfill_20260813
  ADD PRIMARY KEY (consultation_item_id);

DO $function$
DECLARE
  v_candidates bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_candidates
  FROM private.other_charge_backfill_20260813;

  IF v_candidates <> 8482 THEN
    RAISE EXCEPTION 'OTHER_CHARGE_BACKFILL_CANDIDATE_COUNT_CHANGED: expected 8482, found %',
      v_candidates;
  END IF;
END;
$function$;

-- This maintenance update changes classification metadata only. The completed
-- bill mutation guard is bypassed within this locked migration transaction;
-- audited/edited consultations remain excluded in both the snapshot and update.
ALTER TABLE public.consultation_items
  DISABLE TRIGGER guard_completed_bill_item_mutation;

UPDATE public.consultation_items ci
SET billing_adjustment_kind = 'other_charge',
    clinic_charge_type_id = snapshot.repaired_charge_type_id
FROM private.other_charge_backfill_20260813 snapshot
WHERE ci.id = snapshot.consultation_item_id
  AND ci.billing_adjustment_kind IS NULL
  AND ci.clinic_charge_type_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.completed_bill_correction_audit audit
    WHERE audit.consultation_id = ci.consultation_id
  );

ALTER TABLE public.consultation_items
  ENABLE TRIGGER guard_completed_bill_item_mutation;

DO $function$
DECLARE
  v_repaired bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_repaired
  FROM public.consultation_items ci
  JOIN private.other_charge_backfill_20260813 snapshot
    ON snapshot.consultation_item_id = ci.id
  WHERE ci.billing_adjustment_kind = 'other_charge'
    AND ci.clinic_charge_type_id = snapshot.repaired_charge_type_id;

  IF v_repaired <> 8482 THEN
    RAISE EXCEPTION 'OTHER_CHARGE_BACKFILL_INCOMPLETE: expected 8482, found %',
      v_repaired;
  END IF;
END;
$function$;
