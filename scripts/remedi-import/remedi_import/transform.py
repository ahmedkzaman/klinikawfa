from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Mapping

from .models import CanonicalInvoice, ClinicalEncounter, PatientRecord


class TransformError(ValueError):
    pass


ID_NAMESPACE = uuid.UUID("efb21667-9f9e-56c7-bb67-a48a34471b22")
CENTS = Decimal("0.01")
DOCUMENTATION_FEE = Decimal("15.00")
DOCUMENTATION_CUTOFF = datetime.fromisoformat("2026-08-01T00:00:00+08:00")
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
AUSCULTATION_TERMS = re.compile(
    r"\b(lung|lungs|heart|cvs|respiratory|chest)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TransformedPatient:
    public_row: dict[str, object]
    provenance: dict[str, object]


@dataclass(frozen=True)
class TransformedEncounter:
    queue_row: dict[str, object]
    consultation_row: dict[str, object]
    vital_row: dict[str, object] | None
    vital_conflicts: dict[str, tuple[str, ...]]
    provenance: dict[str, object]
    target_tables: frozenset[str]


@dataclass(frozen=True)
class TransformedFinancial:
    ledger: dict[str, object]
    items: tuple[dict[str, object], ...]
    payments: tuple[dict[str, object], ...]
    panel_claim: dict[str, object] | None
    quarantine_reason: str | None
    documentation_status: str
    target_tables: frozenset[str]


def deterministic_id(batch_hash: str, entity: str, source_key: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", batch_hash):
        raise TransformError("batch hash must be a SHA-256 hex digest")
    if not entity or not source_key:
        raise TransformError("deterministic ID inputs must be non-empty")
    opaque_name = hashlib.sha256(
        f"{batch_hash.lower()}\x00{entity}\x00{source_key}".encode("utf-8")
    ).hexdigest()
    return str(uuid.uuid5(ID_NAMESPACE, opaque_name))


def _normalized_identifier(value: str) -> str:
    return "".join(character for character in value.upper() if character.isalnum())


def _normalized_phone(value: str) -> str | None:
    stripped = value.strip()
    if not stripped:
        return None
    digits = "".join(character for character in stripped if character.isdigit())
    if not digits:
        return None
    return ("+" if stripped.startswith("+") else "") + digits


def _normalized_gender(value: str) -> str | None:
    normalized = value.strip().upper()
    mapping = {
        "M": "male",
        "MALE": "male",
        "LELAKI": "male",
        "F": "female",
        "FEMALE": "female",
        "PEREMPUAN": "female",
        "OTHER": "other",
        "LAIN-LAIN": "other",
    }
    return mapping.get(normalized)


def _normalized_id_type(value: str) -> str:
    normalized = value.strip().upper()
    if "PASSPORT" in normalized:
        return "passport"
    if "POLICE" in normalized or "POLIS" in normalized:
        return "police"
    if "ARMY" in normalized or "TENTERA" in normalized:
        return "army"
    return "mykad"


def transform_patient(record: PatientRecord, batch_hash: str) -> TransformedPatient:
    patient_id = deterministic_id(batch_hash, "patient", record.ui_id)
    id_type = _normalized_id_type(record.id_type)
    normalized_id = _normalized_identifier(record.national_id)
    email = record.email.strip() if EMAIL.fullmatch(record.email.strip()) else None
    public_row: dict[str, object] = {
        "id": patient_id,
        "name": record.name,
        "phone": _normalized_phone(record.phone),
        "email": email,
        "id_type": id_type,
        "national_id": normalized_id or None if id_type != "passport" else None,
        "passport_no": normalized_id or None if id_type == "passport" else None,
        "date_of_birth": record.date_of_birth.isoformat() if record.date_of_birth else None,
        "gender": _normalized_gender(record.gender),
        "address": record.address or None,
        "registration_date": (
            record.first_visit_date.isoformat() if record.first_visit_date else None
        ),
    }
    provenance = {
        "source_system": "remedi",
        "source_row": record.source_row,
        "source_ui_id": record.ui_id,
        "source_mrn": record.mrn,
        "source_id_type": record.id_type,
        "source_identifier": record.national_id,
    }
    return TransformedPatient(public_row, provenance)


def _case_note_value(value: str | None) -> str:
    return value.strip() if value and value.strip() else "Not documented in Remedi source"


def _explicit_auscultation(examination: str) -> str:
    explicit = [
        line.strip()
        for line in examination.splitlines()
        if line.strip() and AUSCULTATION_TERMS.search(line)
    ]
    return "\n".join(explicit)


def build_case_note(encounter: ClinicalEncounter) -> str:
    examination = encounter.text.get("on_examination", "")
    sections = (
        ("Presenting symptoms & complaints", encounter.text.get("symptoms", "")),
        ("Physical examination", examination),
        ("Auscultation lungs & heart", _explicit_auscultation(examination)),
        ("Procedure findings", encounter.text.get("procedure", "")),
        ("Laboratory", encounter.text.get("lab_findings", "")),
        ("Imaging", encounter.text.get("lab_imaging", "")),
        ("Plan / care", encounter.text.get("patient_plan_care", "")),
        ("Other vital signs", encounter.text.get("other_vital_sign", "")),
        (
            "Medical certificate",
            "\n".join(
                f"{field}: {encounter.text[field]}"
                for field in ("mc_issued", "mc_day_no", "mc_start")
                if encounter.text.get(field, "").strip()
            ),
        ),
    )
    return "\n\n".join(
        f"{heading}\n{_case_note_value(value)}" for heading, value in sections
    )


def _doctor_id(
    encounter: ClinicalEncounter,
    doctor_ids_by_normalized_name: Mapping[str, tuple[str, ...]],
) -> str | None:
    if len(encounter.doctor_names) != 1:
        return None
    normalized = " ".join(encounter.doctor_names[0].upper().split())
    matches = doctor_ids_by_normalized_name.get(normalized, ())
    return matches[0] if len(matches) == 1 else None


def _vital_values(
    encounter: ClinicalEncounter,
) -> tuple[dict[str, Decimal | int], dict[str, tuple[str, ...]]]:
    mapping = {
        "sbp": "bp_systolic",
        "dbp": "bp_diastolic",
        "pulse_rate": "heart_rate",
        "weight": "weight_kg",
        "height": "height_cm",
        "spo2": "spo2",
        "temperature": "temperature_c",
    }
    integer_targets = {"bp_systolic", "bp_diastolic", "heart_rate"}
    values: dict[str, Decimal | int] = {}
    rejected: dict[str, tuple[str, ...]] = {}
    for source, destination in mapping.items():
        if source in encounter.vital_conflicts or source not in encounter.vitals:
            continue
        try:
            parsed = Decimal(encounter.vitals[source])
        except InvalidOperation as error:
            raise TransformError(f"invalid structured vital: {source}") from error
        if destination in integer_targets:
            if parsed != parsed.to_integral_value():
                rejected[source] = (encounter.vitals[source],)
                continue
            values[destination] = int(parsed)
        else:
            values[destination] = parsed
    return values, rejected


def _base_consultation(
    *,
    consultation_id: str,
    queue_id: str,
    patient_id: str,
    created_at: str,
    case_note: str,
    diagnosis_text: str,
    dispense_note: str,
    doctor_id: str | None,
) -> dict[str, object]:
    return {
        "id": consultation_id,
        "queue_entry_id": queue_id,
        "patient_id": patient_id,
        "created_at": created_at,
        "updated_at": created_at,
        "status": "completed",
        "case_note": case_note,
        "diagnosis_text": diagnosis_text,
        "dispense_note": dispense_note,
        "doctor_id": doctor_id,
        "entry_source": "live",
        "approval_status": "not_required",
        "entered_by": None,
        "original_consulted_at": None,
    }


def transform_encounter(
    encounter: ClinicalEncounter,
    *,
    patient_id: str,
    batch_hash: str,
    doctor_ids_by_normalized_name: Mapping[str, tuple[str, ...]],
) -> TransformedEncounter:
    queue_id = deterministic_id(batch_hash, "queue", encounter.encounter_hash)
    consultation_id = deterministic_id(
        batch_hash,
        "consultation",
        encounter.encounter_hash,
    )
    created_at = encounter.visit_at.isoformat()
    doctor_id = _doctor_id(encounter, doctor_ids_by_normalized_name)
    queue_row: dict[str, object] = {
        "id": queue_id,
        "patient_id": patient_id,
        "created_at": created_at,
        "updated_at": created_at,
        "visit_type": "historical_import",
        "visit_purpose": "Historical Remedi import",
        "clinic_status": "completed",
        "queue_number": None,
        "queue_sequence": None,
        "called_at": None,
        "called_by_doctor_id": None,
        "assigned_doctor_id": doctor_id,
        "created_by": None,
        "is_urgent": False,
    }
    consultation_row = _base_consultation(
        consultation_id=consultation_id,
        queue_id=queue_id,
        patient_id=patient_id,
        created_at=created_at,
        case_note=build_case_note(encounter),
        diagnosis_text=encounter.text.get("diagnosis", ""),
        dispense_note=encounter.text.get("medication", ""),
        doctor_id=doctor_id,
    )
    vital_values, rejected_vitals = _vital_values(encounter)
    vital_row: dict[str, object] | None = None
    targets = {"queue_entries", "consultations"}
    if vital_values:
        vital_row = {
            "id": deterministic_id(batch_hash, "vital", encounter.encounter_hash),
            "queue_entry_id": queue_id,
            "patient_id": patient_id,
            "created_at": created_at,
            "updated_at": created_at,
            **vital_values,
        }
        targets.add("vital_signs")
    provenance = {
        "source_system": "remedi",
        "encounter_hash": encounter.encounter_hash,
        "source_rows": encounter.source_rows,
        "source_attendance_at": created_at,
        "source_doctor_names": encounter.doctor_names,
    }
    return TransformedEncounter(
        queue_row,
        consultation_row,
        vital_row,
        {**encounter.vital_conflicts, **rejected_vitals},
        provenance,
        frozenset(targets),
    )


def transform_payment_only(
    invoice: CanonicalInvoice,
    *,
    patient_id: str,
    batch_hash: str,
) -> TransformedEncounter:
    queue_id = deterministic_id(batch_hash, "payment-only-queue", invoice.bill_number)
    consultation_id = deterministic_id(
        batch_hash,
        "payment-only-consultation",
        invoice.bill_number,
    )
    created_at = invoice.invoice_at.isoformat()
    queue_row: dict[str, object] = {
        "id": queue_id,
        "patient_id": patient_id,
        "created_at": created_at,
        "updated_at": created_at,
        "visit_type": "payment_only",
        "visit_purpose": "Legacy Remedi financial record",
        "clinic_status": "completed",
        "queue_number": None,
        "queue_sequence": None,
        "called_at": None,
        "called_by_doctor_id": None,
        "assigned_doctor_id": None,
        "created_by": None,
        "is_urgent": False,
    }
    consultation_row = _base_consultation(
        consultation_id=consultation_id,
        queue_id=queue_id,
        patient_id=patient_id,
        created_at=created_at,
        case_note="",
        diagnosis_text="",
        dispense_note="",
        doctor_id=None,
    )
    return TransformedEncounter(
        queue_row,
        consultation_row,
        None,
        {},
        {
            "source_system": "remedi",
            "source_bill_number": invoice.bill_number,
            "source_invoice_at": created_at,
        },
        frozenset({"queue_entries", "consultations"}),
    )


def _ledger(invoice: CanonicalInvoice, status: str) -> dict[str, object]:
    return {
        "bill_number": invoice.bill_number,
        "source_label": invoice.source_label,
        "source_rows": invoice.source_rows,
        "invoice_at": invoice.invoice_at.isoformat(),
        "amounts": tuple(str(value) for value in invoice.amounts),
        "raw_payment_labels": ("Cash", "O.Transfer", "C.Card", "E-Wallet"),
        "reconciliation_status": status,
    }


def _ledger_only(invoice: CanonicalInvoice, reason: str) -> TransformedFinancial:
    return TransformedFinancial(
        ledger=_ledger(invoice, reason),
        items=(),
        payments=(),
        panel_claim=None,
        quarantine_reason=reason,
        documentation_status="not_applicable",
        target_tables=frozenset(),
    )


def transform_financial(
    invoice: CanonicalInvoice,
    *,
    batch_hash: str,
    patient_id: str,
    queue_id: str,
    consultation_id: str,
    documentation_fee: Decimal,
    clinical_encounter: ClinicalEncounter | None = None,
    legacy_panel_id: str | None = None,
) -> TransformedFinancial:
    fee = documentation_fee.quantize(CENTS)
    if fee != DOCUMENTATION_FEE:
        raise TransformError("active documentation fee must be RM15.00")
    if len(invoice.amounts) != 10:
        raise TransformError("invoice must contain exactly ten financial columns")
    if any(value < 0 for value in invoice.amounts):
        raise TransformError("negative public financial amount is unsupported")
    if invoice.cash_sales != invoice.cash_collection:
        raise TransformError("Cash Sales and Cash Collection differ")
    if sum(invoice.amounts[3:7], Decimal("0")).quantize(CENTS) != invoice.cash_collection:
        raise TransformError("payment channel allocation does not balance")
    if invoice.outstanding_amount != 0 or invoice.outstanding_payment != 0:
        raise TransformError("non-zero outstanding balance is unsupported")

    if invoice.gross == 0:
        return _ledger_only(invoice, "zero_total_ledger_only")
    if invoice.balance_discrepancy != 0:
        return _ledger_only(invoice, "invoice_total_imbalance")
    if invoice.corporate > 0 and invoice.cash_collection > 0:
        return _ledger_only(invoice, "mixed_panel_self_pay")

    documentation_status = "not_applicable"
    documentation_amount = Decimal("0.00")
    if (
        clinical_encounter is not None
        and clinical_encounter.visit_at >= DOCUMENTATION_CUTOFF
        and clinical_encounter.text.get("mc_issued", "").strip().upper() == "Y"
    ):
        if invoice.gross >= fee:
            documentation_status = "structured_mc"
            documentation_amount = fee
        else:
            documentation_status = "fee_classification_quarantined_below_gross"

    residual = (invoice.gross - documentation_amount).quantize(CENTS)
    if residual < 0:
        raise TransformError("documentation split produced a negative residual")
    items: list[dict[str, object]] = []
    if documentation_amount > 0:
        items.append(
            {
                "id": deterministic_id(
                    batch_hash,
                    "consultation-item-documentation",
                    invoice.bill_number,
                ),
                "consultation_id": consultation_id,
                "item_name": "Official Documentation Fees",
                "quantity": 1,
                "price": documentation_amount,
                "unit_cost": Decimal("0.00"),
                "item_id": None,
                "service_id": None,
                "package_id": None,
                "source_document_id": None,
                "created_at": invoice.invoice_at.isoformat(),
            }
        )
    if residual > 0:
        items.append(
            {
                "id": deterministic_id(
                    batch_hash,
                    "consultation-item-unitemised",
                    invoice.bill_number,
                ),
                "consultation_id": consultation_id,
                "item_name": "Legacy Remedi Invoice (Unitemised)",
                "quantity": 1,
                "price": residual,
                "unit_cost": Decimal("0.00"),
                "item_id": None,
                "service_id": None,
                "package_id": None,
                "source_document_id": None,
                "created_at": invoice.invoice_at.isoformat(),
            }
        )
    if sum((item["price"] for item in items), Decimal("0")) != invoice.gross:
        raise TransformError("consultation item sum does not equal invoice gross")

    channel_map = (
        (3, "cash"),
        (4, "transfer"),
        (5, "card"),
        (6, "qr_pay"),
    )
    payments: list[dict[str, object]] = []
    for index, method in channel_map:
        amount = invoice.amounts[index]
        if amount == 0:
            continue
        payments.append(
            {
                "id": deterministic_id(
                    batch_hash,
                    f"payment-{method}",
                    invoice.bill_number,
                ),
                "queue_entry_id": queue_id,
                "consultation_id": consultation_id,
                "amount": amount,
                "payment_method": method,
                "payment_type": "self_pay",
                "created_at": invoice.invoice_at.isoformat(),
            }
        )
    if sum((payment["amount"] for payment in payments), Decimal("0")) != invoice.cash_collection:
        raise TransformError("patient payment rows do not equal Cash Collection")

    panel_claim: dict[str, object] | None = None
    if invoice.corporate > 0:
        if not legacy_panel_id:
            raise TransformError("legacy unspecified panel provider is required")
        panel_claim = {
            "id": deterministic_id(batch_hash, "panel-claim", invoice.bill_number),
            "claim_no": f"REM-{deterministic_id(batch_hash, 'claim-number', invoice.bill_number)}",
            "queue_entry_id": queue_id,
            "patient_id": patient_id,
            "panel_id": legacy_panel_id,
            "amount": invoice.corporate,
            "claim_date": invoice.invoice_at.isoformat(),
            "status": "pending",
        }
    targets = {"consultation_items"}
    if payments:
        targets.add("payments")
    if panel_claim:
        targets.add("panel_claims")
    return TransformedFinancial(
        ledger=_ledger(invoice, "importable"),
        items=tuple(items),
        payments=tuple(payments),
        panel_claim=panel_claim,
        quarantine_reason=None,
        documentation_status=documentation_status,
        target_tables=frozenset(targets),
    )
