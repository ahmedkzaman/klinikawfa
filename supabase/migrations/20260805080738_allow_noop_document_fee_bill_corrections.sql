-- Completed-bill corrections submit the complete current line-item set. The
-- correction RPC consequently issues an UPDATE for protected document-fee rows
-- even when their values did not change. Permit that exact no-op while keeping
-- every material mutation behind the document lifecycle guard.
CREATE OR REPLACE FUNCTION public.guard_consultation_item_source_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.source_document_id IS NOT NULL
     -- Compare every stored column explicitly. is_partial is generated and its
     -- BEFORE-trigger NEW value is not a reliable whole-row comparison input.
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.consultation_id IS NOT DISTINCT FROM OLD.consultation_id
     AND NEW.item_name IS NOT DISTINCT FROM OLD.item_name
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.dosage IS NOT DISTINCT FROM OLD.dosage
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND NEW.price_tier IS NOT DISTINCT FROM OLD.price_tier
     AND NEW.indication IS NOT DISTINCT FROM OLD.indication
     AND NEW.dosage_qty IS NOT DISTINCT FROM OLD.dosage_qty
     AND NEW.dosage_unit IS NOT DISTINCT FROM OLD.dosage_unit
     AND NEW.frequency IS NOT DISTINCT FROM OLD.frequency
     AND NEW.instruction IS NOT DISTINCT FROM OLD.instruction
     AND NEW.duration IS NOT DISTINCT FROM OLD.duration
     AND NEW.precaution IS NOT DISTINCT FROM OLD.precaution
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND NEW.deleted_by IS NOT DISTINCT FROM OLD.deleted_by
     AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id
     AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id
     AND NEW.package_id IS NOT DISTINCT FROM OLD.package_id
     AND NEW.unit_cost IS NOT DISTINCT FROM OLD.unit_cost
     AND NEW.dispensed_qty IS NOT DISTINCT FROM OLD.dispensed_qty
     AND NEW.partial_reason IS NOT DISTINCT FROM OLD.partial_reason
     AND NEW.billing_adjustment_kind IS NOT DISTINCT FROM
       OLD.billing_adjustment_kind
     AND NEW.clinic_charge_type_id IS NOT DISTINCT FROM
       OLD.clinic_charge_type_id
     AND NEW.source_document_id IS NOT DISTINCT FROM OLD.source_document_id
     AND NEW.source_document_type IS NOT DISTINCT FROM OLD.source_document_type
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.source_document_id IS NOT NULL THEN
    IF OLD.deleted_at IS NOT NULL
       OR NEW.deleted_at IS NULL
       OR NEW.deleted_by IS DISTINCT FROM auth.uid()
       OR OLD.consultation_id IS DISTINCT FROM NEW.consultation_id
       OR OLD.item_name IS DISTINCT FROM NEW.item_name
       OR OLD.quantity IS DISTINCT FROM NEW.quantity
       OR OLD.price IS DISTINCT FROM NEW.price
       OR OLD.unit_cost IS DISTINCT FROM NEW.unit_cost
       OR OLD.item_id IS DISTINCT FROM NEW.item_id
       OR OLD.service_id IS DISTINCT FROM NEW.service_id
       OR OLD.package_id IS DISTINCT FROM NEW.package_id
       OR OLD.billing_adjustment_kind IS DISTINCT FROM
         NEW.billing_adjustment_kind
       OR OLD.clinic_charge_type_id IS DISTINCT FROM
         NEW.clinic_charge_type_id
       OR OLD.source_document_id IS DISTINCT FROM NEW.source_document_id
       OR OLD.source_document_type IS DISTINCT FROM NEW.source_document_type
       OR NOT EXISTS (
         SELECT 1
         FROM public.consultation_document_fee_guard guard_row
         WHERE guard_row.transaction_id = txid_current()
           AND guard_row.backend_pid = pg_backend_pid()
           AND guard_row.source_document_id = OLD.source_document_id
           AND guard_row.actor_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'DOCUMENT_FEE_ITEM_IMMUTABLE'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND (
          OLD.source_document_id IS DISTINCT FROM NEW.source_document_id
          OR OLD.source_document_type IS DISTINCT FROM NEW.source_document_type
        ) THEN
    RAISE EXCEPTION 'SOURCE_DOCUMENT_METADATA_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.source_document_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.consultation_documents cd
      WHERE cd.id = NEW.source_document_id
        AND cd.consultation_id = NEW.consultation_id
        AND lower(btrim(coalesce(cd.type, ''))) = NEW.source_document_type
    ) THEN
      RAISE EXCEPTION 'SOURCE_DOCUMENT_MISMATCH'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.guard_consultation_item_source_document()
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_consultation_item_source_document()
  FROM PUBLIC, anon, authenticated;
