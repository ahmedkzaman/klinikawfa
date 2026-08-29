from __future__ import annotations

import csv
import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


class BundleError(ValueError):
    pass


CSV_COLUMNS: dict[str, tuple[str, ...]] = {
    "patients.copy.csv": (
        "proposed_patient_id", "remedi_ui_id", "remedi_mrn", "source_row",
        "source_key_hash", "id_number_sha256", "name", "phone", "email",
        "id_type", "national_id", "passport_no", "date_of_birth", "gender",
        "address", "registration_date",
    ),
    "queue_entries.copy.csv": (
        "id", "remedi_ui_id", "created_at", "updated_at", "visit_type",
        "visit_purpose", "clinic_status", "assigned_doctor_id", "payment_method",
        "panel_id", "is_urgent",
    ),
    "consultations.copy.csv": (
        "id", "queue_entry_id", "remedi_ui_id", "doctor_id", "case_note",
        "diagnosis_text", "dispense_note", "status", "created_at", "updated_at",
        "entry_source", "approval_status",
    ),
    "vital_signs.copy.csv": (
        "id", "queue_entry_id", "remedi_ui_id", "height_cm", "weight_kg",
        "temperature_c", "bp_systolic", "bp_diastolic", "heart_rate", "spo2",
        "created_at", "updated_at",
    ),
    "consultation_items.copy.csv": (
        "id", "consultation_id", "item_name", "quantity", "price", "unit_cost",
        "item_id", "service_id", "package_id", "source_document_id", "created_at",
    ),
    "payments.staging.copy.csv": (
        "bill_number", "payment_id", "queue_entry_id", "consultation_id", "amount",
        "payment_method", "source_created_at",
    ),
    "panel_claims.staging.copy.csv": (
        "bill_number", "claim_id", "queue_entry_id", "remedi_ui_id", "provider_id",
        "amount", "source_created_at",
    ),
    "patient_map.copy.csv": (
        "id", "remedi_ui_id", "remedi_mrn", "id_number_sha256", "source_row",
        "source_key_hash",
    ),
    "encounter_map.copy.csv": (
        "id", "remedi_ui_id", "queue_entry_id", "consultation_id", "encounter_hash",
        "source_key_hash", "source_rows", "source_attendance_at",
        "source_doctor_names", "reconciliation_status",
    ),
    "invoice_map.copy.csv": (
        "id", "idempotency_key", "bill_number", "remedi_ui_id", "queue_entry_id",
        "consultation_id", "payment_ids", "panel_claim_id", "source_pdf_sha256",
        "source_rows", "page_row_references", "source_key_hash", "source_created_at",
        "corporate_amount", "cash_sales_amount", "gross_amount", "cash_amount",
        "transfer_amount", "card_amount", "e_wallet_amount",
        "patient_collection_amount", "outstanding_amount", "outstanding_payment",
        "raw_labels", "payment_allocations", "reconciliation_status",
    ),
    "conflicts.csv": (
        "id", "conflict_type", "severity", "status", "source_key_hash", "details",
    ),
}


@dataclass(frozen=True)
class BundleInputs:
    batch_id: str
    idempotency_key: str
    actor_id: str
    source_manifest_sha256: str
    compiler_version: str
    source_files: tuple[Mapping[str, object], ...]
    counts: Mapping[str, object]
    rows: Mapping[str, Sequence[Mapping[str, object]]]


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _csv_value(value: object) -> object:
    if value is None:
        return r"\N"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value


def _write_csv(path: Path, columns: tuple[str, ...], rows: Sequence[Mapping[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="raise", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            missing = set(columns) - set(row)
            if missing:
                raise BundleError(f"{path.name}: missing columns: {sorted(missing)}")
            writer.writerow({column: _csv_value(row[column]) for column in columns})
    os.chmod(path, 0o600)


def _hash_files(directory: Path, names: Sequence[str]) -> dict[str, str]:
    return {
        name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
        for name in sorted(names)
    }


def _bundle_digest(file_hashes: Mapping[str, str]) -> str:
    canonical = json.dumps(file_hashes, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()


def _sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def _import_sql(output: Path, data: BundleInputs, bundle_sha256: str) -> str:
    copies = "\n".join(
        f"\\copy stage_{name.split('.')[0]} FROM '{name}' WITH (FORMAT csv, HEADER true, NULL '\\N');"
        for name in CSV_COLUMNS
    )
    source_values = ",\n".join(
        "(" + ", ".join(
            (
                _sql_literal(record["id"]),
                _sql_literal(data.batch_id),
                _sql_literal(record["source_kind"]),
                _sql_literal(record["filename"]),
                str(int(record["byte_size"])),
                _sql_literal(record["sha256"]),
                "NULL" if record.get("page_count") is None else str(int(record["page_count"])),
                "NULL" if record.get("row_count") is None else str(int(record["row_count"])),
                _sql_literal(record.get("source_start_date")),
                _sql_literal(record.get("source_end_date")),
            )
        ) + ")"
        for record in data.source_files
    )
    # All patient/clinical values live in COPY files, never in this SQL script.
    return f"""\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '30min';
SET CONSTRAINTS ALL DEFERRED;

CREATE TEMP TABLE stage_patients (
  proposed_patient_id uuid, remedi_ui_id text, remedi_mrn text, source_row integer,
  source_key_hash text, id_number_sha256 text, name text, phone text, email text,
  id_type text, national_id text, passport_no text, date_of_birth date, gender text,
  address text, registration_date date
) ON COMMIT DROP;
CREATE TEMP TABLE stage_queue_entries (
  id uuid, remedi_ui_id text, created_at timestamptz, updated_at timestamptz,
  visit_type text, visit_purpose text, clinic_status public.clinic_status,
  assigned_doctor_id uuid, payment_method text, panel_id uuid, is_urgent boolean
) ON COMMIT DROP;
CREATE TEMP TABLE stage_consultations (
  id uuid, queue_entry_id uuid, remedi_ui_id text, doctor_id uuid, case_note text,
  diagnosis_text text, dispense_note text, status text, created_at timestamptz,
  updated_at timestamptz, entry_source text, approval_status text
) ON COMMIT DROP;
CREATE TEMP TABLE stage_vital_signs (
  id uuid, queue_entry_id uuid, remedi_ui_id text, height_cm numeric, weight_kg numeric,
  temperature_c numeric, bp_systolic integer, bp_diastolic integer, heart_rate integer,
  spo2 numeric, created_at timestamptz, updated_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE stage_consultation_items (
  id uuid, consultation_id uuid, item_name text, quantity integer, price numeric,
  unit_cost numeric, item_id uuid, service_id uuid, package_id uuid,
  source_document_id uuid, created_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE stage_payments (
  bill_number text, payment_id uuid, queue_entry_id uuid, consultation_id uuid,
  amount numeric, payment_method text, source_created_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE stage_panel_claims (
  bill_number text, claim_id uuid, queue_entry_id uuid, remedi_ui_id text,
  provider_id uuid, amount numeric, source_created_at timestamptz
) ON COMMIT DROP;
CREATE TEMP TABLE stage_patient_map (
  id uuid, remedi_ui_id text, remedi_mrn text, id_number_sha256 text,
  source_row integer, source_key_hash text
) ON COMMIT DROP;
CREATE TEMP TABLE stage_encounter_map (
  id uuid, remedi_ui_id text, queue_entry_id uuid, consultation_id uuid,
  encounter_hash text, source_key_hash text, source_rows jsonb,
  source_attendance_at timestamptz, source_doctor_names jsonb,
  reconciliation_status text
) ON COMMIT DROP;
CREATE TEMP TABLE stage_invoice_map (
  id uuid, idempotency_key uuid, bill_number text, remedi_ui_id text,
  queue_entry_id uuid, consultation_id uuid, payment_ids jsonb, panel_claim_id uuid,
  source_pdf_sha256 text, source_rows jsonb, page_row_references jsonb,
  source_key_hash text, source_created_at timestamptz, corporate_amount numeric,
  cash_sales_amount numeric, gross_amount numeric, cash_amount numeric,
  transfer_amount numeric, card_amount numeric, e_wallet_amount numeric,
  patient_collection_amount numeric, outstanding_amount numeric,
  outstanding_payment numeric, raw_labels jsonb, payment_allocations jsonb,
  reconciliation_status text
) ON COMMIT DROP;
CREATE TEMP TABLE stage_conflicts (
  id uuid, conflict_type text, severity text, status text,
  source_key_hash text, details jsonb
) ON COMMIT DROP;

{copies}

DO $validate$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '{data.actor_id}') THEN
    RAISE EXCEPTION 'REMEDI_IMPORT_ACTOR_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.insurance_providers
    WHERE id = '72656d65-6469-4000-8000-000000000001'
      AND name = 'Legacy Remedi Corporate - Provider Unspecified'
      AND status = 'inactive'
  ) THEN
    RAISE EXCEPTION 'REMEDI_FIXED_PROVIDER_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.remedi_patient_map'::regclass
      AND conname = 'remedi_patient_map_batch_id_patient_id_key'
  ) THEN
    RAISE EXCEPTION 'REMEDI_PATIENT_MAP_MANY_TO_ONE_MIGRATION_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.clinic_document_fees
      WHERE document_type IN ('mc', 'prescription', 'quarantine', 'referral')
        AND amount = 15.00) <> 4 THEN
    RAISE EXCEPTION 'REMEDI_DOCUMENT_FEE_CONFIGURATION_CHANGED';
  END IF;
  IF (SELECT count(*) FROM stage_patients) <> {int(data.counts['patients'])} THEN
    RAISE EXCEPTION 'REMEDI_PATIENT_STAGE_COUNT_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM stage_encounter_map) <> {int(data.counts['encounters'])} THEN
    RAISE EXCEPTION 'REMEDI_ENCOUNTER_STAGE_COUNT_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM stage_invoice_map) <> {int(data.counts['canonical_invoices'])} THEN
    RAISE EXCEPTION 'REMEDI_INVOICE_STAGE_COUNT_MISMATCH';
  END IF;
  IF EXISTS (SELECT 1 FROM stage_patients GROUP BY remedi_ui_id HAVING count(*) <> 1)
     OR EXISTS (SELECT 1 FROM stage_queue_entries GROUP BY id HAVING count(*) <> 1)
     OR EXISTS (SELECT 1 FROM stage_consultations GROUP BY id HAVING count(*) <> 1)
     OR EXISTS (SELECT 1 FROM stage_invoice_map GROUP BY bill_number HAVING count(*) <> 1) THEN
    RAISE EXCEPTION 'REMEDI_STAGE_DUPLICATE_KEY';
  END IF;
END
$validate$;

INSERT INTO private.remedi_import_batches(
  id, idempotency_key, status, source_manifest_sha256, bundle_sha256,
  compiler_version, patient_count, encounter_count, canonical_invoice_count,
  source_gross_amount, source_patient_collection, source_corporate_amount,
  counts_summary, started_at
) VALUES (
  '{data.batch_id}', '{data.idempotency_key}', 'loading',
  '{data.source_manifest_sha256}', '{bundle_sha256}', '{data.compiler_version}',
  {int(data.counts['patients'])}, {int(data.counts['encounters'])},
  {int(data.counts['canonical_invoices'])},
  {data.counts['source_gross_rm']}, {data.counts['source_patient_collection_rm']},
  {data.counts['source_corporate_rm']},
  '{json.dumps(dict(data.counts), sort_keys=True, separators=(',', ':'))}'::jsonb,
  pg_catalog.clock_timestamp()
) ON CONFLICT (id) DO UPDATE SET status = 'loading'
  WHERE private.remedi_import_batches.idempotency_key = EXCLUDED.idempotency_key
    AND private.remedi_import_batches.source_manifest_sha256 = EXCLUDED.source_manifest_sha256
    AND private.remedi_import_batches.bundle_sha256 = EXCLUDED.bundle_sha256;

INSERT INTO private.remedi_source_files(
  id, batch_id, source_kind, filename, byte_size, sha256, page_count,
  row_count, source_start_date, source_end_date
) VALUES
{source_values}
ON CONFLICT (batch_id, filename) DO NOTHING;

-- Existing patients are resolved by normalized identity. If the destination
-- has duplicate identity rows, exactly one stricter DOB plus phone/name match
-- may resolve it. Multiple Remedi records may map to one unique existing
-- destination identity; unresolved duplicate identities still fail closed.
CREATE TEMP TABLE stage_patient_resolution ON COMMIT DROP AS
WITH source_identity AS (
  SELECT p.*,
    upper(regexp_replace(coalesce(p.national_id, p.passport_no, ''), '[^A-Z0-9]', '', 'g')) AS identity,
    regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') AS normalized_phone,
    upper(regexp_replace(coalesce(p.name, ''), '[^A-Z0-9]', '', 'g')) AS normalized_name,
    count(*) OVER (PARTITION BY upper(regexp_replace(coalesce(p.national_id, p.passport_no, ''), '[^A-Z0-9]', '', 'g'))) AS source_identity_count
  FROM stage_patients p
), external_id_usage AS (
  SELECT patient_id, count(*) AS external_id_count
  FROM public.patient_external_ids
  GROUP BY patient_id
), consultation_usage AS (
  SELECT patient_id, count(*) AS consultation_count
  FROM public.consultations
  GROUP BY patient_id
), queue_entry_usage AS (
  SELECT patient_id, count(*) AS queue_entry_count
  FROM public.queue_entries
  GROUP BY patient_id
), destination_patient_usage AS (
  SELECT p.id,
    coalesce(e.external_id_count, 0) AS external_id_count,
    coalesce(c.consultation_count, 0) AS consultation_count,
    coalesce(q.queue_entry_count, 0) AS queue_entry_count
  FROM public.patients p
  LEFT JOIN external_id_usage e ON e.patient_id = p.id
  LEFT JOIN consultation_usage c ON c.patient_id = p.id
  LEFT JOIN queue_entry_usage q ON q.patient_id = p.id
), destination_identity AS (
  SELECT p.id,
    upper(regexp_replace(coalesce(p.national_id, p.passport_no, ''), '[^A-Z0-9]', '', 'g')) AS identity,
    regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') AS normalized_phone,
    upper(regexp_replace(coalesce(p.name, ''), '[^A-Z0-9]', '', 'g')) AS normalized_name,
    p.date_of_birth,
    count(*) OVER (PARTITION BY upper(regexp_replace(coalesce(p.national_id, p.passport_no, ''), '[^A-Z0-9]', '', 'g'))) AS destination_identity_count
  FROM public.patients p
), matched_identity AS (
  SELECT s.remedi_ui_id, d.id, 'national_id'::text AS match_method
  FROM source_identity s
  JOIN destination_identity d ON d.identity = s.identity
  WHERE s.identity <> ''
    AND d.destination_identity_count = 1
), strict_duplicate_identity AS (
  SELECT s.remedi_ui_id, d.id, 'national_id'::text AS match_method,
         count(*) OVER (PARTITION BY s.remedi_ui_id) AS strict_destination_match_count,
         u.external_id_count, u.consultation_count, u.queue_entry_count
  FROM source_identity s
  JOIN destination_identity d ON d.identity = s.identity
  JOIN destination_patient_usage u ON u.id = d.id
  WHERE s.identity <> ''
    AND s.source_identity_count = 1
    AND d.destination_identity_count > 1
    AND s.date_of_birth IS NOT DISTINCT FROM d.date_of_birth
    AND (
      (s.normalized_phone <> '' AND s.normalized_phone = d.normalized_phone)
      OR (s.normalized_name <> '' AND s.normalized_name = d.normalized_name)
    )
), ranked_duplicate_identity AS (
  SELECT d.*,
    dense_rank() OVER (
      PARTITION BY d.remedi_ui_id
      ORDER BY d.external_id_count DESC,
               d.consultation_count DESC,
               d.queue_entry_count DESC
    ) AS duplicate_usage_rank
  FROM strict_duplicate_identity d
  WHERE d.strict_destination_match_count > 1
), top_ranked_duplicate_identity AS (
  SELECT d.remedi_ui_id, d.id,
    'national_id'::text AS match_method,
    count(*) OVER (PARTITION BY d.remedi_ui_id) AS duplicate_top_rank_count
  FROM ranked_duplicate_identity d
  WHERE d.duplicate_usage_rank = 1
), resolved_identity AS (
  SELECT remedi_ui_id, id, match_method FROM matched_identity
  UNION ALL
  SELECT remedi_ui_id, id, match_method
  FROM strict_duplicate_identity
  WHERE strict_destination_match_count = 1
  UNION ALL
  SELECT remedi_ui_id, id, match_method
  FROM top_ranked_duplicate_identity
  WHERE duplicate_top_rank_count = 1
)
SELECT s.*,
  coalesce(r.id, s.proposed_patient_id) AS patient_id,
  coalesce(r.match_method, 'inserted') AS match_method
FROM source_identity s
LEFT JOIN resolved_identity r ON r.remedi_ui_id = s.remedi_ui_id;

DO $resolve$
BEGIN
  IF (SELECT count(*) FROM stage_patient_resolution) <> {int(data.counts['patients'])}
     OR EXISTS (SELECT 1 FROM stage_patient_resolution GROUP BY remedi_ui_id HAVING count(*) <> 1)
     OR EXISTS (
       SELECT 1
       FROM stage_patient_resolution
       GROUP BY patient_id
       HAVING count(*) > 1 AND bool_or(match_method = 'inserted')
     ) THEN
    RAISE EXCEPTION 'REMEDI_PATIENT_RESOLUTION_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM stage_patient_resolution r
    WHERE r.match_method = 'inserted'
      AND r.identity <> ''
      AND EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE upper(regexp_replace(coalesce(p.national_id, p.passport_no, ''), '[^A-Z0-9]', '', 'g')) = r.identity
      )
  ) THEN
    RAISE EXCEPTION 'REMEDI_PATIENT_DUPLICATE_DESTINATION_IDENTITY';
  END IF;
END
$resolve$;

INSERT INTO public.patients(
  id, name, phone, email, id_type, national_id, passport_no, date_of_birth,
  gender, address, registration_date
)
SELECT patient_id, name, phone, email, id_type, national_id, passport_no,
       date_of_birth, gender, address, registration_date
FROM stage_patient_resolution WHERE match_method = 'inserted'
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.remedi_patient_map(
  id, batch_id, patient_id, remedi_ui_id, remedi_mrn, id_number_sha256,
  source_row, source_key_hash, match_method, match_status
)
SELECT m.id, '{data.batch_id}', r.patient_id, m.remedi_ui_id, m.remedi_mrn,
       m.id_number_sha256, m.source_row, m.source_key_hash, r.match_method,
       CASE WHEN r.match_method = 'inserted' THEN 'inserted' ELSE 'matched' END
FROM stage_patient_map m JOIN stage_patient_resolution r USING (remedi_ui_id)
ON CONFLICT (batch_id, remedi_ui_id) DO NOTHING;

INSERT INTO public.queue_entries(
  id, patient_id, created_at, updated_at, visit_type, visit_purpose,
  clinic_status, assigned_doctor_id, payment_method, panel_id, is_urgent,
  queue_number, queue_sequence, called_at, called_by_doctor_id, created_by
)
SELECT q.id, pm.patient_id, q.created_at, q.updated_at, q.visit_type,
       q.visit_purpose, q.clinic_status, q.assigned_doctor_id, q.payment_method,
       q.panel_id, q.is_urgent, NULL, NULL, NULL, NULL, NULL
FROM stage_queue_entries q
JOIN private.remedi_patient_map pm ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = q.remedi_ui_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultations(
  id, queue_entry_id, patient_id, doctor_id, case_note, diagnosis_text,
  dispense_note, status, created_at, updated_at, entry_source, approval_status
)
SELECT c.id, c.queue_entry_id, pm.patient_id, c.doctor_id, c.case_note,
       c.diagnosis_text, c.dispense_note, c.status, c.created_at, c.updated_at,
       c.entry_source, c.approval_status
FROM stage_consultations c
JOIN private.remedi_patient_map pm ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = c.remedi_ui_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vital_signs(
  id, queue_entry_id, patient_id, height_cm, weight_kg, temperature_c,
  bp_systolic, bp_diastolic, heart_rate, spo2, created_at, updated_at
)
SELECT v.id, v.queue_entry_id, pm.patient_id, v.height_cm, v.weight_kg,
       v.temperature_c, v.bp_systolic, v.bp_diastolic, v.heart_rate, v.spo2,
       v.created_at, v.updated_at
FROM stage_vital_signs v
JOIN private.remedi_patient_map pm ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = v.remedi_ui_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.consultation_items(
  id, consultation_id, item_name, quantity, price, unit_cost, item_id,
  service_id, package_id, source_document_id, created_at
)
SELECT id, consultation_id, item_name, quantity, price, unit_cost, item_id,
       service_id, package_id, source_document_id, created_at
FROM stage_consultation_items staged
WHERE NOT EXISTS (
  SELECT 1 FROM public.consultation_items existing WHERE existing.id = staged.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO private.remedi_encounter_map(
  id, batch_id, patient_id, queue_entry_id, consultation_id, encounter_hash,
  source_key_hash, source_rows, source_attendance_at, source_doctor_names,
  reconciliation_status
)
SELECT e.id, '{data.batch_id}', pm.patient_id, e.queue_entry_id, e.consultation_id,
       e.encounter_hash, e.source_key_hash,
       ARRAY(SELECT jsonb_array_elements_text(e.source_rows)::integer),
       e.source_attendance_at,
       ARRAY(SELECT jsonb_array_elements_text(e.source_doctor_names)),
       e.reconciliation_status
FROM stage_encounter_map e
JOIN private.remedi_patient_map pm ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = e.remedi_ui_id
ON CONFLICT (batch_id, encounter_hash) DO NOTHING;

INSERT INTO private.remedi_invoice_map(
  id, batch_id, idempotency_key, bill_number, patient_id, queue_entry_id,
  consultation_id, payment_ids, panel_claim_id, source_pdf_sha256, source_rows,
  page_row_references, source_key_hash, source_created_at, corporate_amount,
  cash_sales_amount, gross_amount, cash_amount, transfer_amount, card_amount,
  e_wallet_amount, patient_collection_amount, outstanding_amount,
  outstanding_payment, raw_labels, payment_allocations, reconciliation_status
)
SELECT i.id, '{data.batch_id}', i.idempotency_key, i.bill_number, pm.patient_id,
       i.queue_entry_id, i.consultation_id,
       ARRAY(SELECT jsonb_array_elements_text(i.payment_ids)::uuid),
       i.panel_claim_id, i.source_pdf_sha256,
       ARRAY(SELECT jsonb_array_elements_text(i.source_rows)::integer),
       i.page_row_references, i.source_key_hash, i.source_created_at,
       i.corporate_amount, i.cash_sales_amount, i.gross_amount, i.cash_amount,
       i.transfer_amount, i.card_amount, i.e_wallet_amount,
       i.patient_collection_amount, i.outstanding_amount, i.outstanding_payment,
       i.raw_labels, i.payment_allocations, i.reconciliation_status
FROM stage_invoice_map i
LEFT JOIN private.remedi_patient_map pm ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = i.remedi_ui_id
ON CONFLICT (batch_id, bill_number) DO NOTHING;

INSERT INTO private.remedi_import_conflicts(
  id, batch_id, conflict_type, severity, status, source_key_hash, details
)
SELECT id, '{data.batch_id}', conflict_type, severity, status, source_key_hash, details
FROM stage_conflicts ON CONFLICT (batch_id, source_key_hash) DO NOTHING;

UPDATE private.remedi_invoice_map SET reconciliation_status = 'importable'
WHERE batch_id = '{data.batch_id}' AND reconciliation_status = 'loaded';
DO $context$
BEGIN
  PERFORM private.begin_remedi_import_context('{data.batch_id}', '{data.actor_id}');
END
$context$;
DO $payments$
DECLARE v record;
BEGIN
  FOR v IN SELECT * FROM stage_payments ORDER BY bill_number, payment_id LOOP
    PERFORM private.import_remedi_payment(
      '{data.batch_id}', v.bill_number, v.payment_id, v.queue_entry_id,
      v.consultation_id, '{data.actor_id}', v.amount, v.payment_method,
      v.source_created_at
    );
  END LOOP;
END
$payments$;
DO $claims$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT p.*, pm.patient_id FROM stage_panel_claims p
    JOIN private.remedi_patient_map pm
      ON pm.batch_id = '{data.batch_id}' AND pm.remedi_ui_id = p.remedi_ui_id
    ORDER BY p.bill_number
  LOOP
    PERFORM private.import_remedi_panel_claim(
      '{data.batch_id}', v.bill_number, v.claim_id, v.queue_entry_id,
      v.patient_id, v.provider_id, v.amount, v.source_created_at
    );
  END LOOP;
END
$claims$;

UPDATE public.consultations SET status = 'completed', updated_at = created_at
WHERE id IN (
  SELECT consultation_id FROM private.remedi_invoice_map
  WHERE batch_id = '{data.batch_id}' AND reconciliation_status = 'importable'
);
UPDATE public.queue_entries SET clinic_status = 'completed', updated_at = created_at
WHERE id IN (
  SELECT queue_entry_id FROM private.remedi_invoice_map
  WHERE batch_id = '{data.batch_id}' AND reconciliation_status = 'importable'
);

UPDATE private.remedi_invoice_map SET reconciliation_status = 'loaded'
WHERE batch_id = '{data.batch_id}' AND reconciliation_status = 'importable';
UPDATE private.remedi_import_batches
SET status = 'loaded', completed_at = pg_catalog.clock_timestamp()
WHERE id = '{data.batch_id}';

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM private.remedi_patient_map WHERE batch_id = '{data.batch_id}') <> {int(data.counts['patients'])}
     OR (SELECT count(*) FROM private.remedi_encounter_map WHERE batch_id = '{data.batch_id}') <> {int(data.counts['encounters'])}
     OR (SELECT count(*) FROM private.remedi_invoice_map WHERE batch_id = '{data.batch_id}') <> {int(data.counts['canonical_invoices'])}
     OR (SELECT count(*) FROM public.payments WHERE id IN (SELECT payment_id FROM stage_payments)) <> (SELECT count(*) FROM stage_payments)
     OR (SELECT count(*) FROM public.panel_claims WHERE id IN (SELECT claim_id FROM stage_panel_claims)) <> (SELECT count(*) FROM stage_panel_claims)
     OR (SELECT count(*) FROM public.consultation_items WHERE id IN (SELECT id FROM stage_consultation_items)) <> (SELECT count(*) FROM stage_consultation_items)
     OR EXISTS (
       SELECT 1 FROM stage_payments s JOIN public.payments p ON p.id = s.payment_id
       WHERE p.amount <> s.amount OR p.payment_method <> s.payment_method
          OR p.created_at <> s.source_created_at OR p.created_by <> '{data.actor_id}'
     )
     OR EXISTS (
       SELECT 1 FROM stage_panel_claims s JOIN public.panel_claims p ON p.id = s.claim_id
       WHERE p.amount <> s.amount OR p.panel_id <> s.provider_id
          OR p.created_at <> s.source_created_at
     ) THEN
    RAISE EXCEPTION 'REMEDI_POSTFLIGHT_MISMATCH';
  END IF;
END
$postflight$;
COMMIT;
"""


def _rollback_sql(data: BundleInputs) -> str:
    return f"""\\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE rollback_inserted_patients ON COMMIT DROP AS
SELECT patient_id FROM private.remedi_patient_map
WHERE batch_id = '{data.batch_id}' AND match_status = 'inserted';
CREATE TEMP TABLE rollback_encounters ON COMMIT DROP AS
SELECT queue_entry_id, consultation_id FROM private.remedi_encounter_map
WHERE batch_id = '{data.batch_id}';
CREATE TEMP TABLE rollback_invoices ON COMMIT DROP AS
SELECT queue_entry_id, consultation_id, payment_ids, panel_claim_id
FROM private.remedi_invoice_map WHERE batch_id = '{data.batch_id}';
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.queue_entries later
    JOIN private.remedi_patient_map pm ON pm.patient_id = later.patient_id
    WHERE pm.batch_id = '{data.batch_id}'
      AND later.created_at > (SELECT completed_at FROM private.remedi_import_batches WHERE id = '{data.batch_id}')
      AND NOT EXISTS (
        SELECT 1 FROM private.remedi_encounter_map em
        WHERE em.batch_id = '{data.batch_id}' AND em.queue_entry_id = later.id
      )
  ) THEN
    RAISE EXCEPTION 'REMEDI_ROLLBACK_DEPENDENCY_CONFLICT';
  END IF;
END
$guard$;

DELETE FROM private.remedi_import_context WHERE batch_id = '{data.batch_id}';
DELETE FROM private.remedi_import_conflicts WHERE batch_id = '{data.batch_id}';
DELETE FROM private.remedi_invoice_map WHERE batch_id = '{data.batch_id}';
DELETE FROM private.remedi_encounter_map WHERE batch_id = '{data.batch_id}';
DELETE FROM private.remedi_patient_map WHERE batch_id = '{data.batch_id}';
DELETE FROM private.remedi_source_files WHERE batch_id = '{data.batch_id}';
DELETE FROM public.panel_claims WHERE id IN (
  SELECT panel_claim_id FROM rollback_invoices WHERE panel_claim_id IS NOT NULL
);
DELETE FROM public.payments WHERE id = ANY(ARRAY(
  SELECT unnest(payment_ids) FROM rollback_invoices
));
DELETE FROM public.consultation_items WHERE consultation_id IN (
  SELECT consultation_id FROM rollback_encounters
  UNION
  SELECT consultation_id FROM rollback_invoices WHERE consultation_id IS NOT NULL
);
DELETE FROM public.vital_signs WHERE queue_entry_id IN (
  SELECT queue_entry_id FROM rollback_encounters
);
DELETE FROM public.consultations WHERE id IN (
  SELECT consultation_id FROM rollback_encounters
  UNION
  SELECT consultation_id FROM rollback_invoices WHERE consultation_id IS NOT NULL
);
DELETE FROM public.queue_entries WHERE id IN (
  SELECT queue_entry_id FROM rollback_encounters
  UNION
  SELECT queue_entry_id FROM rollback_invoices WHERE queue_entry_id IS NOT NULL
);
DELETE FROM public.patients p WHERE EXISTS (
  SELECT 1 FROM rollback_inserted_patients r WHERE r.patient_id = p.id
);
UPDATE private.remedi_import_batches SET status = 'rolled_back' WHERE id = '{data.batch_id}';
COMMIT;
"""


def write_private_bundle(
    output: Path,
    data: BundleInputs,
    *,
    repository_root: Path,
) -> dict[str, object]:
    if _inside(output, repository_root):
        raise BundleError("private bundle output must be outside the Git repository")
    output.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    unexpected = set(data.rows) - set(CSV_COLUMNS)
    if unexpected:
        raise BundleError(f"unsupported bundle files: {sorted(unexpected)}")
    for name, columns in CSV_COLUMNS.items():
        _write_csv(output / name, columns, data.rows.get(name, ()))

    csv_hashes = _hash_files(output, tuple(CSV_COLUMNS))
    bundle_sha256 = _bundle_digest(csv_hashes)
    manifest = {
        "schema_version": 1,
        "batch_id": data.batch_id,
        "source_manifest_sha256": data.source_manifest_sha256,
        "bundle_sha256": bundle_sha256,
        "compiler_version": data.compiler_version,
        "counts": dict(data.counts),
        "source_files": [
            {key: value for key, value in record.items() if key not in {"path"}}
            for record in data.source_files
        ],
        "private_file_sha256": csv_hashes,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (output / "import.sql").write_text(
        _import_sql(output, data, bundle_sha256), encoding="utf-8", newline="\n"
    )
    (output / "rollback.sql").write_text(
        _rollback_sql(data), encoding="utf-8", newline="\n"
    )
    for name in ("manifest.json", "import.sql", "rollback.sql"):
        os.chmod(output / name, 0o600)
    return manifest
