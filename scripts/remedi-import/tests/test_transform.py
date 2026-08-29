from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.models import CanonicalInvoice, ClinicalEncounter, PatientRecord  # noqa: E402
from remedi_import.transform import (  # noqa: E402
    TransformError,
    deterministic_id,
    transform_encounter,
    transform_financial,
    transform_patient,
    transform_payment_only,
)


MYT = ZoneInfo("Asia/Kuala_Lumpur")
BATCH_HASH = "a" * 64


def patient_record(*, id_type: str = "MYKAD", national_id: str = "900101-01-0001") -> PatientRecord:
    return PatientRecord(
        source_row=2,
        name="Synthetic Patient",
        ui_id="UI-001",
        mrn="MRN-001",
        national_id=national_id,
        id_type=id_type,
        date_of_birth=date(1990, 1, 1),
        gender="LELAKI",
        address="Line one\nLine two",
        email="invalid-address",
        phone="+60 (12) 345-6789",
        first_visit_date=date(2025, 12, 1),
    )


def encounter(*, at: datetime, mc_issued: str = "") -> ClinicalEncounter:
    return ClinicalEncounter(
        patient_ui_id="UI001",
        visit_at=at,
        source_rows=(2, 3),
        text={
            "symptoms": "Fever and cough",
            "on_examination": "Lungs: equal air entry\nNo other assertion",
            "procedure": "Wound dressing finding",
            "lab_findings": "FBC reviewed",
            "lab_imaging": "Chest radiograph reviewed",
            "patient_plan_care": "Return if worse",
            "other_vital_sign": "Pain score 2",
            "mc_issued": mc_issued,
            "medication": "Legacy medication text",
            "diagnosis": "Viral illness",
            "payment": "100.00",
        },
        vitals={
            "sbp": "120",
            "dbp": "80",
            "pulse_rate": "75",
            "weight": "60.5",
            "height": "165",
            "spo2": "99",
            "temperature": "37.2",
        },
        vital_conflicts={"temperature": ("37.2", "38.0")},
        doctor_names=("Dr Synthetic",),
        encounter_hash="encounter-hash",
    )


def invoice(
    *,
    at: datetime,
    bill: str = "BILL-001",
    corporate: str = "0.00",
    cash: str = "100.00",
    gross: str = "100.00",
    channels: tuple[str, str, str, str] = ("10.00", "20.00", "30.00", "40.00"),
) -> CanonicalInvoice:
    amounts = (
        Decimal(corporate),
        Decimal(cash),
        Decimal(gross),
        *(Decimal(value) for value in channels),
        Decimal(cash),
        Decimal("0.00"),
        Decimal("0.00"),
    )
    return CanonicalInvoice(
        source_label="synthetic",
        source_rows=(1,),
        invoice_at=at,
        bill_number=bill,
        mrn="MRN001",
        national_id="900101010001",
        amounts=amounts,
    )


class DeterministicTransformTest(unittest.TestCase):
    def test_ids_are_stable_and_do_not_embed_raw_source_keys(self) -> None:
        first = deterministic_id(BATCH_HASH, "patient", "RAW-IDENTIFIER-001")
        second = deterministic_id(BATCH_HASH, "patient", "RAW-IDENTIFIER-001")
        changed = deterministic_id(BATCH_HASH, "patient", "RAW-IDENTIFIER-002")

        self.assertEqual(first, second)
        self.assertNotEqual(first, changed)
        self.assertNotIn("RAW", first)
        self.assertEqual(len(first), 36)

    def test_patient_mapping_keeps_source_identifiers_private(self) -> None:
        transformed = transform_patient(patient_record(), BATCH_HASH)

        self.assertEqual(transformed.public_row["id_type"], "mykad")
        self.assertEqual(transformed.public_row["national_id"], "900101010001")
        self.assertIsNone(transformed.public_row["passport_no"])
        self.assertEqual(transformed.public_row["gender"], "male")
        self.assertEqual(transformed.public_row["phone"], "+60123456789")
        self.assertIsNone(transformed.public_row["email"])
        self.assertEqual(transformed.public_row["registration_date"], "2025-12-01")
        self.assertNotIn("ui_id", transformed.public_row)
        self.assertNotIn("mrn", transformed.public_row)
        self.assertEqual(transformed.provenance["source_ui_id"], "UI-001")
        self.assertEqual(transformed.provenance["source_mrn"], "MRN-001")

        passport = transform_patient(
            patient_record(id_type="PASSPORT", national_id="A-1234567"),
            BATCH_HASH,
        )
        self.assertEqual(passport.public_row["id_type"], "passport")
        self.assertEqual(passport.public_row["passport_no"], "A1234567")
        self.assertIsNone(passport.public_row["national_id"])


class ClinicalTransformTest(unittest.TestCase):
    def test_attendance_time_drives_queue_consultation_and_vital_rows(self) -> None:
        visit_at = datetime(2026, 8, 2, 9, 15, tzinfo=MYT)
        transformed = transform_encounter(
            encounter(at=visit_at),
            patient_id="00000000-0000-0000-0000-000000000001",
            batch_hash=BATCH_HASH,
            doctor_ids_by_normalized_name={"DR SYNTHETIC": ("doctor-id",)},
        )

        expected_time = visit_at.isoformat()
        self.assertEqual(transformed.queue_row["created_at"], expected_time)
        self.assertEqual(transformed.consultation_row["created_at"], expected_time)
        self.assertEqual(transformed.vital_row["created_at"], expected_time)
        self.assertEqual(transformed.queue_row["visit_type"], "historical_import")
        self.assertIsNone(transformed.queue_row["queue_number"])
        self.assertIsNone(transformed.queue_row["called_at"])
        self.assertIsNone(transformed.queue_row["called_by_doctor_id"])
        self.assertEqual(transformed.consultation_row["entry_source"], "live")
        self.assertEqual(transformed.consultation_row["approval_status"], "not_required")
        self.assertIsNone(transformed.consultation_row["entered_by"])
        self.assertIsNone(transformed.consultation_row["original_consulted_at"])
        self.assertEqual(transformed.consultation_row["doctor_id"], "doctor-id")

        case_note = transformed.consultation_row["case_note"]
        self.assertIn("Presenting symptoms & complaints\nFever and cough", case_note)
        self.assertIn("Auscultation lungs & heart\nLungs: equal air entry", case_note)
        self.assertIn("Procedure findings\nWound dressing finding", case_note)
        self.assertNotIn("normal", case_note.lower())
        self.assertEqual(transformed.consultation_row["diagnosis_text"], "Viral illness")
        self.assertEqual(transformed.consultation_row["dispense_note"], "Legacy medication text")
        self.assertEqual(transformed.vital_row["bp_systolic"], Decimal("120"))
        self.assertNotIn("temperature_c", transformed.vital_row)
        self.assertEqual(transformed.vital_conflicts["temperature"], ("37.2", "38.0"))
        self.assertEqual(
            transformed.target_tables,
            frozenset({"queue_entries", "consultations", "vital_signs"}),
        )

    def test_doctor_is_null_unless_source_and_destination_match_uniquely(self) -> None:
        visit_at = datetime(2026, 8, 2, 9, 15, tzinfo=MYT)
        ambiguous = transform_encounter(
            encounter(at=visit_at),
            patient_id="patient-id",
            batch_hash=BATCH_HASH,
            doctor_ids_by_normalized_name={"DR SYNTHETIC": ("one", "two")},
        )
        self.assertIsNone(ambiguous.consultation_row["doctor_id"])
        self.assertEqual(ambiguous.provenance["source_doctor_names"], ("Dr Synthetic",))

    def test_non_integral_integer_vital_is_not_rounded_or_structured(self) -> None:
        source = encounter(at=datetime(2026, 8, 2, 9, 15, tzinfo=MYT))
        source.vitals["pulse_rate"] = "88.1"

        transformed = transform_encounter(
            source,
            patient_id="patient-id",
            batch_hash=BATCH_HASH,
            doctor_ids_by_normalized_name={},
        )

        self.assertNotIn("heart_rate", transformed.vital_row)
        self.assertEqual(transformed.vital_conflicts["pulse_rate"], ("88.1",))

    def test_payment_only_shell_is_operational_not_clinical_attendance(self) -> None:
        invoice_at = datetime(2026, 8, 2, 11, 0, tzinfo=MYT)
        transformed = transform_payment_only(
            invoice(at=invoice_at),
            patient_id="patient-id",
            batch_hash=BATCH_HASH,
        )

        self.assertEqual(transformed.queue_row["visit_type"], "payment_only")
        self.assertEqual(transformed.queue_row["created_at"], invoice_at.isoformat())
        self.assertEqual(transformed.queue_row["clinic_status"], "completed")
        self.assertIsNone(transformed.queue_row["queue_number"])
        self.assertEqual(transformed.consultation_row["case_note"], "")
        self.assertEqual(transformed.consultation_row["entry_source"], "live")
        self.assertIsNone(transformed.vital_row)


class FinancialTransformTest(unittest.TestCase):
    def test_self_pay_items_and_channel_payments_balance_at_pdf_time(self) -> None:
        invoice_at = datetime(2026, 7, 31, 14, 0, tzinfo=MYT)
        result = transform_financial(
            invoice(at=invoice_at),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
        )

        self.assertIsNone(result.quarantine_reason)
        self.assertEqual(sum(item["price"] for item in result.items), Decimal("100.00"))
        self.assertEqual(sum(payment["amount"] for payment in result.payments), Decimal("100.00"))
        self.assertEqual(
            [payment["payment_method"] for payment in result.payments],
            ["cash", "transfer", "card", "qr_pay"],
        )
        self.assertTrue(all(payment["created_at"] == invoice_at.isoformat() for payment in result.payments))
        self.assertIsNone(result.panel_claim)
        self.assertEqual(
            result.target_tables,
            frozenset({"consultation_items", "payments"}),
        )

    def test_panel_claim_equals_corporate_and_is_not_a_patient_payment(self) -> None:
        invoice_at = datetime(2026, 7, 31, 14, 0, tzinfo=MYT)
        result = transform_financial(
            invoice(
                at=invoice_at,
                corporate="100.00",
                cash="0.00",
                gross="100.00",
                channels=("0.00", "0.00", "0.00", "0.00"),
            ),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            legacy_panel_id="legacy-panel-id",
        )

        self.assertEqual(result.payments, ())
        self.assertEqual(result.panel_claim["amount"], Decimal("100.00"))
        self.assertEqual(result.panel_claim["panel_id"], "legacy-panel-id")
        self.assertEqual(result.panel_claim["claim_date"], invoice_at.isoformat())

    def test_zero_imbalanced_and_mixed_invoices_are_ledger_only(self) -> None:
        at = datetime(2026, 8, 2, 10, 0, tzinfo=MYT)
        zero = transform_financial(
            invoice(at=at, cash="0.00", gross="0.00", channels=("0.00",) * 4),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
        )
        imbalanced = transform_financial(
            invoice(at=at, corporate="20.00", cash="70.00", gross="100.00", channels=("70.00", "0.00", "0.00", "0.00")),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            legacy_panel_id="legacy-panel-id",
        )
        mixed = transform_financial(
            invoice(at=at, corporate="30.00", cash="70.00", gross="100.00", channels=("70.00", "0.00", "0.00", "0.00")),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            legacy_panel_id="legacy-panel-id",
        )

        self.assertEqual(zero.quarantine_reason, "zero_total_ledger_only")
        self.assertEqual(imbalanced.quarantine_reason, "invoice_total_imbalance")
        self.assertEqual(mixed.quarantine_reason, "mixed_panel_self_pay")
        for result in (zero, imbalanced, mixed):
            self.assertEqual(result.items, ())
            self.assertEqual(result.payments, ())
            self.assertIsNone(result.panel_claim)
            self.assertEqual(result.target_tables, frozenset())

    def test_only_structured_post_cutoff_mc_splits_documentation_fee_from_gross(self) -> None:
        at = datetime(2026, 8, 1, 0, 0, tzinfo=MYT)
        eligible = transform_financial(
            invoice(at=at, gross="100.00", cash="100.00"),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            clinical_encounter=encounter(at=at, mc_issued="Y"),
        )
        text_only = encounter(at=at, mc_issued="")
        text_only.text["patient_plan_care"] = "Medical certificate discussed"
        ineligible = transform_financial(
            invoice(at=at, bill="BILL-002", gross="100.00", cash="100.00"),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            clinical_encounter=text_only,
        )

        self.assertEqual(
            [(item["item_name"], item["price"]) for item in eligible.items],
            [
                ("Official Documentation Fees", Decimal("15.00")),
                ("Legacy Remedi Invoice (Unitemised)", Decimal("85.00")),
            ],
        )
        self.assertEqual(sum(item["price"] for item in eligible.items), Decimal("100.00"))
        self.assertEqual(len(ineligible.items), 1)
        self.assertEqual(ineligible.items[0]["price"], Decimal("100.00"))

        before_cutoff = transform_financial(
            invoice(at=at, bill="BILL-003"),
            batch_hash=BATCH_HASH,
            patient_id="patient-id",
            queue_id="queue-id",
            consultation_id="consultation-id",
            documentation_fee=Decimal("15.00"),
            clinical_encounter=encounter(at=at.replace(year=2026, month=7, day=31), mc_issued="Y"),
        )
        self.assertEqual(len(before_cutoff.items), 1)

    def test_invalid_fee_or_negative_public_amount_fails_closed(self) -> None:
        at = datetime(2026, 8, 2, 10, 0, tzinfo=MYT)
        with self.assertRaisesRegex(TransformError, "documentation fee"):
            transform_financial(
                invoice(at=at),
                batch_hash=BATCH_HASH,
                patient_id="patient-id",
                queue_id="queue-id",
                consultation_id="consultation-id",
                documentation_fee=Decimal("20.00"),
            )
        with self.assertRaisesRegex(TransformError, "negative"):
            transform_financial(
                invoice(at=at, cash="100.00", gross="100.00", channels=("-1.00", "21.00", "30.00", "50.00")),
                batch_hash=BATCH_HASH,
                patient_id="patient-id",
                queue_id="queue-id",
                consultation_id="consultation-id",
                documentation_fee=Decimal("15.00"),
            )


if __name__ == "__main__":
    unittest.main()
