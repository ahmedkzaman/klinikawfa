from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from collections import Counter
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Mapping


SCRIPT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_ROOT))

from remedi_import.bundle import BundleInputs, CSV_COLUMNS, write_private_bundle  # noqa: E402
from remedi_import.models import CanonicalInvoice, ClinicalEncounter  # noqa: E402
from remedi_import.reconcile import (  # noqa: E402
    ReconciliationResult,
    reconcile_encounters_and_invoices,
    verify_financial_partition,
)
from remedi_import.remedi_csv import (  # noqa: E402
    parse_note_fragments,
    parse_patients,
    reconstruct_encounters,
    verify_fragment_provenance,
)
from remedi_import.sales_pdf import (  # noqa: E402
    canonicalize_invoices,
    load_pdf_layout_pages,
    parse_sales_layout_pages,
    validate_canonical_invoices,
)
from remedi_import.source_manifest import (  # noqa: E402
    LOCKED_PROFILE,
    locked_source_specs,
    profile_sources,
    validate_sources,
    verify_profile,
)
from remedi_import.transform import (  # noqa: E402
    DOCUMENTATION_FEE,
    deterministic_id,
    transform_encounter,
    transform_financial,
    transform_patient,
    transform_payment_only,
)


COMPILER_VERSION = "remedi-import-1"
LEGACY_PROVIDER_ID = "72656d65-6469-4000-8000-000000000001"
EXPECTED_COUNTS = {
    "patients": 3040,
    "note_fragments": 6111,
    "encounters": 4392,
    "canonical_invoices": 4504,
    "candidate_pairs": 3860,
    "auto_pairs": 3848,
    "payment_only_candidates": 574,
    "mismatched_cardinality_groups": 17,
    "public_financial_invoices": 4099,
    "quarantined_invoices": 405,
    "payment_only_shells": 475,
    "vital_signs": 4178,
    "consultation_items": 4105,
    "payments": 2145,
    "panel_claims": 1954,
}


def _hash_json(value: object) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _source_key_hash(kind: str, key: str) -> str:
    return hashlib.sha256(f"{kind}\x00{key}".encode("utf-8")).hexdigest()


def _money(value: object) -> str:
    return str(Decimal(str(value)).quantize(Decimal("0.01")))


def _load_doctor_map(path: Path | None) -> dict[str, tuple[str, ...]]:
    if path is None:
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("doctor map must be a JSON object")
    result: dict[str, tuple[str, ...]] = {}
    for name, ids in data.items():
        if not isinstance(name, str) or not isinstance(ids, list):
            raise ValueError("doctor map entries must be name -> UUID array")
        result[" ".join(name.upper().split())] = tuple(str(uuid.UUID(item)) for item in ids)
    return result


def _source_file_rows(
    source_records: list[dict[str, object]],
    profile: Mapping[str, object],
    batch_hash: str,
) -> tuple[dict[str, object], ...]:
    months = {row["label"]: row for row in profile["sales_months"]}  # type: ignore[index]
    rows: list[dict[str, object]] = []
    for record in source_records:
        label = str(record["label"])
        if label == "patients_csv":
            kind, pages, count = "patients_csv", None, profile["patient_rows"]
        elif label == "clinical_notes_csv":
            kind, pages, count = "clinical_notes_csv", None, profile["note_fragments"]
        else:
            month = months[label]
            kind, pages, count = "sales_pdf", month["pages"], month["physical_rows"]
        rows.append(
            {
                "id": deterministic_id(batch_hash, "source-file", label),
                "source_kind": kind,
                "filename": Path(str(record["path"])).name if "path" in record else label,
                "byte_size": record["bytes"],
                "sha256": record["sha256"],
                "page_count": pages,
                "row_count": count,
                "source_start_date": None,
                "source_end_date": None,
            }
        )
    return tuple(rows)


def _invoice_statuses(reconciliation: ReconciliationResult) -> dict[str, str]:
    statuses = {
        item.invoice.bill_number: (
            "unresolved_identity"
            if item.reason in {"unresolved_identity", "duplicated_national_id", "conflicting_identity_signals"}
            else item.reason
        )
        for item in reconciliation.quarantined_invoices
    }
    return statuses


def compile_bundle(
    *,
    source_dir: Path,
    output_dir: Path,
    repository_root: Path,
    actor_id: str,
    doctor_map_path: Path | None = None,
) -> dict[str, object]:
    actor_id = str(uuid.UUID(actor_id))
    specs = locked_source_specs(source_dir)
    validated = validate_sources(specs)
    record_by_label = {record["label"]: record for record in validated}
    for spec in specs:
        record_by_label[spec.label]["path"] = str(spec.path)
    by_label = {spec.label: spec for spec in specs}
    sales_specs = [(spec.label, spec.path) for spec in specs if spec.label.startswith("sales_")]
    profile = profile_sources(
        by_label["patients_csv"].path,
        by_label["clinical_notes_csv"].path,
        sales_specs,
        pdf_page_loader=load_pdf_layout_pages,
    )
    verify_profile(profile, LOCKED_PROFILE)
    source_manifest = {
        "schema_version": 1,
        "sources": [
            {key: value for key, value in record.items() if key != "path"}
            for record in validated
        ],
        "profile": profile,
    }
    source_manifest_sha256 = _hash_json(source_manifest)
    batch_hash = source_manifest_sha256
    batch_id = deterministic_id(batch_hash, "batch", COMPILER_VERSION)
    idempotency_key = deterministic_id(batch_hash, "batch-idempotency", COMPILER_VERSION)

    patients = parse_patients(by_label["patients_csv"].path, today=date(2026, 8, 28))
    fragments = parse_note_fragments(by_label["clinical_notes_csv"].path, patients)
    encounters = reconstruct_encounters(fragments)
    verify_fragment_provenance(fragments, encounters)

    sales_rows = []
    for label, path in sales_specs:
        sales_rows.extend(parse_sales_layout_pages(label, load_pdf_layout_pages(path)).rows)
    invoices = canonicalize_invoices(sales_rows)
    validate_canonical_invoices(invoices, expected_anomaly_count=22)
    reconciliation = reconcile_encounters_and_invoices(patients, encounters, invoices)

    observed = {
        "patients": len(patients.records),
        "note_fragments": len(fragments),
        "encounters": len(encounters),
        "canonical_invoices": len(invoices),
        "candidate_pairs": len(reconciliation.candidate_pairs),
        "auto_pairs": len(reconciliation.auto_paired),
        "payment_only_candidates": len(reconciliation.payment_only_invoices),
        "mismatched_cardinality_groups": reconciliation.mismatched_cardinality_groups,
    }
    for key, expected in EXPECTED_COUNTS.items():
        if key in observed and observed[key] != expected:
            raise ValueError(f"locked count mismatch for {key}: {observed[key]} != {expected}")

    doctor_map = _load_doctor_map(doctor_map_path)
    transformed_patients = {
        record.ui_id: transform_patient(record, batch_hash) for record in patients.records
    }
    pair_by_encounter = {pair.encounter.encounter_hash: pair for pair in reconciliation.auto_paired}
    pre_status = _invoice_statuses(reconciliation)
    invoice_by_bill = {invoice.bill_number: invoice for invoice in invoices}
    source_sha_by_label = {str(row["label"]): str(row["sha256"]) for row in validated}

    row_sets: dict[str, list[dict[str, object]]] = {name: [] for name in CSV_COLUMNS}
    for record in patients.records:
        transformed = transformed_patients[record.ui_id]
        public = transformed.public_row
        source_hash = _source_key_hash("patient", record.ui_id)
        identifier = str(public.get("national_id") or public.get("passport_no") or "")
        row_sets["patients.copy.csv"].append(
            {
                "proposed_patient_id": public["id"],
                "remedi_ui_id": record.ui_id,
                "remedi_mrn": record.mrn,
                "source_row": record.source_row,
                "source_key_hash": source_hash,
                "id_number_sha256": hashlib.sha256(identifier.encode()).hexdigest() if identifier else None,
                "name": public["name"], "phone": public["phone"], "email": public["email"],
                "id_type": public["id_type"], "national_id": public["national_id"],
                "passport_no": public["passport_no"], "date_of_birth": public["date_of_birth"],
                "gender": public["gender"], "address": public["address"],
                "registration_date": public["registration_date"],
            }
        )
        row_sets["patient_map.copy.csv"].append(
            {
                "id": deterministic_id(batch_hash, "patient-map", record.ui_id),
                "remedi_ui_id": record.ui_id, "remedi_mrn": record.mrn,
                "id_number_sha256": hashlib.sha256(identifier.encode()).hexdigest() if identifier else None,
                "source_row": record.source_row, "source_key_hash": source_hash,
            }
        )

    transformed_encounters: dict[str, object] = {}
    for encounter in encounters:
        patient_id = transformed_patients[encounter.patient_ui_id].public_row["id"]
        transformed = transform_encounter(
            encounter, patient_id=str(patient_id), batch_hash=batch_hash,
            doctor_ids_by_normalized_name=doctor_map,
        )
        transformed_encounters[encounter.encounter_hash] = transformed
        pair = pair_by_encounter.get(encounter.encounter_hash)
        financial_status = "historical_import"
        if pair is not None:
            financial_status = "financial_paired"
        queue = dict(transformed.queue_row)
        consultation = dict(transformed.consultation_row)
        queue.update({"remedi_ui_id": encounter.patient_ui_id, "payment_method": None, "panel_id": None})
        consultation["remedi_ui_id"] = encounter.patient_ui_id
        row_sets["queue_entries.copy.csv"].append({key: queue.get(key) for key in CSV_COLUMNS["queue_entries.copy.csv"]})
        row_sets["consultations.copy.csv"].append({key: consultation.get(key) for key in CSV_COLUMNS["consultations.copy.csv"]})
        if transformed.vital_row:
            vital = dict(transformed.vital_row)
            vital["remedi_ui_id"] = encounter.patient_ui_id
            row_sets["vital_signs.copy.csv"].append({key: vital.get(key) for key in CSV_COLUMNS["vital_signs.copy.csv"]})
        row_sets["encounter_map.copy.csv"].append(
            {
                "id": deterministic_id(batch_hash, "encounter-map", encounter.encounter_hash),
                "remedi_ui_id": encounter.patient_ui_id,
                "queue_entry_id": transformed.queue_row["id"],
                "consultation_id": transformed.consultation_row["id"],
                "encounter_hash": encounter.encounter_hash,
                "source_key_hash": _source_key_hash("encounter", encounter.encounter_hash),
                "source_rows": list(encounter.source_rows),
                "source_attendance_at": encounter.visit_at.isoformat(),
                "source_doctor_names": list(encounter.doctor_names),
                "reconciliation_status": financial_status,
            }
        )

    public_financial: dict[str, tuple[str, str, str, object]] = {}
    for pair in reconciliation.auto_paired:
        transformed_encounter = transformed_encounters[pair.encounter.encounter_hash]
        public_financial[pair.invoice.bill_number] = (
            pair.patient_ui_id,
            transformed_encounter.queue_row["id"],
            transformed_encounter.consultation_row["id"],
            pair.encounter,
        )
    for payment_only in reconciliation.payment_only_invoices:
        public_financial[payment_only.invoice.bill_number] = (
            payment_only.patient_ui_id, "", "", None
        )

    importable_invoices: list[CanonicalInvoice] = []
    quarantine_reasons = dict(pre_status)
    financial_transforms: dict[str, object] = {}
    payment_only_public: dict[str, object] = {}
    for bill, (ui_id, queue_id, consultation_id, clinical) in sorted(public_financial.items()):
        invoice = invoice_by_bill[bill]
        if not queue_id:
            shell = transform_payment_only(
                invoice,
                patient_id=str(transformed_patients[ui_id].public_row["id"]),
                batch_hash=batch_hash,
            )
            queue_id = str(shell.queue_row["id"])
            consultation_id = str(shell.consultation_row["id"])
            payment_only_public[bill] = shell
        financial = transform_financial(
            invoice, batch_hash=batch_hash,
            patient_id=str(transformed_patients[ui_id].public_row["id"]),
            queue_id=str(queue_id), consultation_id=str(consultation_id),
            documentation_fee=DOCUMENTATION_FEE,
            clinical_encounter=clinical if isinstance(clinical, ClinicalEncounter) else None,
            legacy_panel_id=LEGACY_PROVIDER_ID,
        )
        financial_transforms[bill] = financial
        if financial.quarantine_reason:
            quarantine_reasons[bill] = financial.quarantine_reason
            continue
        importable_invoices.append(invoice)
        if bill in payment_only_public:
            shell = payment_only_public[bill]
            queue = dict(shell.queue_row)
            consultation = dict(shell.consultation_row)
            queue.update({"remedi_ui_id": ui_id, "payment_method": None, "panel_id": None})
            consultation["remedi_ui_id"] = ui_id
            row_sets["queue_entries.copy.csv"].append({key: queue.get(key) for key in CSV_COLUMNS["queue_entries.copy.csv"]})
            row_sets["consultations.copy.csv"].append({key: consultation.get(key) for key in CSV_COLUMNS["consultations.copy.csv"]})

        queue_row = next(row for row in row_sets["queue_entries.copy.csv"] if row["id"] == queue_id)
        consultation_row = next(row for row in row_sets["consultations.copy.csv"] if row["id"] == consultation_id)
        queue_row["clinic_status"] = "dispensing_payment"
        consultation_row["status"] = "in_progress"
        if financial.panel_claim:
            queue_row["payment_method"] = "panel"
            queue_row["panel_id"] = LEGACY_PROVIDER_ID
        elif financial.payments:
            queue_row["payment_method"] = "cash"
        row_sets["consultation_items.copy.csv"].extend(dict(item) for item in financial.items)
        row_sets["payments.staging.copy.csv"].extend(
            {"bill_number": bill, "payment_id": payment["id"], "queue_entry_id": queue_id,
             "consultation_id": consultation_id, "amount": payment["amount"],
             "payment_method": payment["payment_method"], "source_created_at": payment["created_at"]}
            for payment in financial.payments
        )
        if financial.panel_claim:
            claim = financial.panel_claim
            row_sets["panel_claims.staging.copy.csv"].append(
                {"bill_number": bill, "claim_id": claim["id"], "queue_entry_id": queue_id,
                 "remedi_ui_id": ui_id, "provider_id": claim["panel_id"],
                 "amount": claim["amount"], "source_created_at": invoice.invoice_at.isoformat()}
            )

    quarantined_invoices = [invoice for invoice in invoices if invoice.bill_number in quarantine_reasons]
    verify_financial_partition(invoices, importable_invoices, quarantined_invoices)

    resolution_by_bill = {r.invoice.bill_number: r for r in reconciliation.identity_resolutions}
    for invoice in invoices:
        bill = invoice.bill_number
        resolution = resolution_by_bill[bill]
        ui_id = resolution.patient_ui_id
        financial = financial_transforms.get(bill)
        status = quarantine_reasons.get(bill, "importable")
        refs = public_financial.get(bill)
        queue_id = refs[1] if refs and status == "importable" else None
        consultation_id = refs[2] if refs and status == "importable" else None
        if bill in payment_only_public and status == "importable":
            queue_id = payment_only_public[bill].queue_row["id"]
            consultation_id = payment_only_public[bill].consultation_row["id"]
        payments = list(financial.payments) if financial and status == "importable" else []
        panel_claim = financial.panel_claim if financial and status == "importable" else None
        payment_allocations = [
            {"payment_id": p["id"], "payment_method": p["payment_method"], "amount": _money(p["amount"])}
            for p in payments
        ]
        source_hash = _source_key_hash("invoice", bill)
        row_sets["invoice_map.copy.csv"].append(
            {
                "id": deterministic_id(batch_hash, "invoice-map", bill),
                "idempotency_key": deterministic_id(batch_hash, "invoice-idempotency", bill),
                "bill_number": bill, "remedi_ui_id": ui_id,
                "queue_entry_id": queue_id, "consultation_id": consultation_id,
                "payment_ids": [p["id"] for p in payments],
                "panel_claim_id": panel_claim["id"] if panel_claim else None,
                "source_pdf_sha256": source_sha_by_label[invoice.source_label],
                "source_rows": list(invoice.source_rows),
                "page_row_references": [{"source_label": invoice.source_label, "source_row": row} for row in invoice.source_rows],
                "source_key_hash": source_hash, "source_created_at": invoice.invoice_at.isoformat(),
                "corporate_amount": _money(invoice.amounts[0]), "cash_sales_amount": _money(invoice.amounts[1]),
                "gross_amount": _money(invoice.amounts[2]), "cash_amount": _money(invoice.amounts[3]),
                "transfer_amount": _money(invoice.amounts[4]), "card_amount": _money(invoice.amounts[5]),
                "e_wallet_amount": _money(invoice.amounts[6]), "patient_collection_amount": _money(invoice.amounts[7]),
                "outstanding_amount": _money(invoice.amounts[8]), "outstanding_payment": _money(invoice.amounts[9]),
                "raw_labels": {"columns": ["Corporate", "Cash Sales", "Total Sales", "Cash", "O.Transfer", "C.Card", "E-Wallet", "Cash Collection", "Outstanding Amount", "Outstanding Payment"]},
                "payment_allocations": payment_allocations, "reconciliation_status": status,
            }
        )
        if status != "importable":
            row_sets["conflicts.csv"].append(
                {
                    "id": deterministic_id(batch_hash, "conflict", bill),
                    "conflict_type": status, "severity": "blocking",
                    "status": "accepted_private_only" if status in {"mixed_panel_self_pay", "zero_total_ledger_only", "invoice_total_imbalance"} else "open",
                    "source_key_hash": source_hash,
                    "details": {"bill_key_hash": source_hash, "reason": status},
                }
            )

    paired_importable = {invoice.bill_number for invoice in importable_invoices}
    for row in row_sets["encounter_map.copy.csv"]:
        pair = pair_by_encounter.get(row["encounter_hash"])
        if pair and pair.invoice.bill_number not in paired_importable:
            row["reconciliation_status"] = "financial_quarantined"

    observed.update(
        {
            "public_financial_invoices": len(importable_invoices),
            "quarantined_invoices": len(quarantined_invoices),
            "payment_only_shells": sum(1 for bill in payment_only_public if bill in paired_importable),
            "vital_signs": len(row_sets["vital_signs.copy.csv"]),
            "consultation_items": len(row_sets["consultation_items.copy.csv"]),
            "payments": len(row_sets["payments.staging.copy.csv"]),
            "panel_claims": len(row_sets["panel_claims.staging.copy.csv"]),
        }
    )
    for key, expected in EXPECTED_COUNTS.items():
        if observed.get(key) != expected:
            raise ValueError(f"locked count mismatch for {key}: {observed.get(key)} != {expected}")
    public_totals = {
        "public_gross_rm": _money(sum((i.gross for i in importable_invoices), Decimal("0"))),
        "quarantine_gross_rm": _money(sum((i.gross for i in quarantined_invoices), Decimal("0"))),
    }
    counts = {
        **observed, **public_totals,
        "source_gross_rm": LOCKED_PROFILE["sales_gross_rm"],
        "source_patient_collection_rm": LOCKED_PROFILE["sales_patient_collection_rm"],
        "source_corporate_rm": LOCKED_PROFILE["sales_corporate_rm"],
        "quarantine_reasons": dict(sorted(Counter(quarantine_reasons.values()).items())),
    }
    source_files = _source_file_rows(validated, profile, batch_hash)
    data = BundleInputs(
        batch_id=batch_id, idempotency_key=idempotency_key, actor_id=actor_id,
        source_manifest_sha256=source_manifest_sha256, compiler_version=COMPILER_VERSION,
        source_files=source_files, counts=counts,
        rows={name: tuple(sorted(rows, key=lambda row: tuple(str(row.get(c, "")) for c in CSV_COLUMNS[name]))) for name, rows in row_sets.items()},
    )
    return write_private_bundle(output_dir, data, repository_root=repository_root)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compile the locked private Remedi import bundle.")
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--repository-root", type=Path, default=Path.cwd())
    parser.add_argument("--actor-id", required=True)
    parser.add_argument("--doctor-map", type=Path)
    args = parser.parse_args(list(argv) if argv is not None else None)
    manifest = compile_bundle(
        source_dir=args.source_dir, output_dir=args.output_dir,
        repository_root=args.repository_root, actor_id=args.actor_id,
        doctor_map_path=args.doctor_map,
    )
    print(json.dumps({"status": "compiled", "batch_id": manifest["batch_id"], "counts": manifest["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
