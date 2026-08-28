from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.models import (  # noqa: E402
    CanonicalInvoice,
    ClinicalEncounter,
    PatientIndex,
    PatientRecord,
)
from remedi_import.reconcile import (  # noqa: E402
    ReconciliationError,
    reconcile_encounters_and_invoices,
    resolve_invoice_patient,
    verify_financial_partition,
)


MYT = ZoneInfo("Asia/Kuala_Lumpur")


def patient(ui_id: str, mrn: str, national_id: str) -> PatientRecord:
    return PatientRecord(
        source_row=int(ui_id[-1]) + 1,
        name=f"Synthetic {ui_id}",
        ui_id=ui_id,
        mrn=mrn,
        national_id=national_id,
        id_type="Synthetic",
        date_of_birth=date(1990, 1, 1),
        gender="",
        address="",
        email="",
        phone="",
        first_visit_date=None,
    )


def patient_index() -> PatientIndex:
    records = (
        patient("UI1", "MRN1", "IC1"),
        patient("UI2", "MRN2", "IC2"),
        patient("UI3", "MRN3", "DUPLICATEIC"),
        patient("UI4", "MRN4", "DUPLICATEIC"),
    )
    return PatientIndex(
        records=records,
        by_ui_id={record.ui_id: record for record in records},
        by_mrn={record.mrn: record for record in records},
        unique_by_national_id={"IC1": records[0], "IC2": records[1]},
        duplicated_national_ids=frozenset({"DUPLICATEIC"}),
    )


def invoice(
    bill: str,
    *,
    at: datetime,
    mrn: str = "MRN1",
    national_id: str = "IC1",
    gross: str = "100.00",
) -> CanonicalInvoice:
    amount = Decimal(gross)
    return CanonicalInvoice(
        source_label="synthetic",
        source_rows=(1,),
        invoice_at=at,
        bill_number=bill,
        mrn=mrn,
        national_id=national_id,
        amounts=(
            Decimal("0.00"),
            amount,
            amount,
            amount,
            Decimal("0.00"),
            Decimal("0.00"),
            Decimal("0.00"),
            amount,
            Decimal("0.00"),
            Decimal("0.00"),
        ),
    )


def encounter(
    ui_id: str,
    *,
    at: datetime,
    payment: str = "RM 100.00",
    symptom: str = "Clinical truth",
) -> ClinicalEncounter:
    return ClinicalEncounter(
        patient_ui_id=ui_id,
        visit_at=at,
        source_rows=(2,),
        text={"payment": payment, "symptoms": symptom},
        vitals={"temperature": "37.0"},
        encounter_hash=f"{ui_id}-{at.isoformat()}",
    )


class IdentityResolutionTest(unittest.TestCase):
    def test_uses_mrn_primary_and_unique_ic_secondary(self) -> None:
        patients = patient_index()
        at = datetime(2026, 8, 1, 10, 0, tzinfo=MYT)

        by_both = resolve_invoice_patient(invoice("B1", at=at), patients)
        missing_ic = resolve_invoice_patient(
            invoice("B2", at=at, national_id=""), patients
        )
        by_ic = resolve_invoice_patient(
            invoice("B3", at=at, mrn="", national_id="IC2"), patients
        )

        self.assertEqual((by_both.patient_ui_id, by_both.method), ("UI1", "mrn"))
        self.assertEqual((missing_ic.patient_ui_id, missing_ic.method), ("UI1", "mrn"))
        self.assertEqual((by_ic.patient_ui_id, by_ic.method), ("UI2", "national_id"))

    def test_quarantines_duplicate_ic_unresolved_and_conflicting_signals(self) -> None:
        patients = patient_index()
        at = datetime(2026, 8, 1, 10, 0, tzinfo=MYT)

        duplicated = resolve_invoice_patient(
            invoice("B1", at=at, mrn="", national_id="DUPLICATEIC"), patients
        )
        unresolved = resolve_invoice_patient(
            invoice("B2", at=at, mrn="UNKNOWN", national_id="UNKNOWN"), patients
        )
        conflict = resolve_invoice_patient(
            invoice("B3", at=at, mrn="MRN1", national_id="IC2"), patients
        )

        self.assertEqual(duplicated.reason, "duplicated_national_id")
        self.assertEqual(unresolved.reason, "unresolved_identity")
        self.assertEqual(conflict.reason, "conflicting_identity_signals")
        self.assertIsNone(duplicated.patient_ui_id)
        self.assertIsNone(unresolved.patient_ui_id)
        self.assertIsNone(conflict.patient_ui_id)


class ReconciliationTest(unittest.TestCase):
    def test_pairs_chronologically_only_when_patient_day_cardinality_matches(self) -> None:
        patients = patient_index()
        day = datetime(2026, 8, 1, 9, 0, tzinfo=MYT)
        encounters = [
            encounter("UI1", at=day.replace(hour=10), payment="20.00"),
            encounter("UI1", at=day.replace(hour=9), payment="10.00"),
            encounter("UI2", at=day.replace(hour=11), payment="30.00"),
        ]
        invoices = [
            invoice("B2", at=day.replace(hour=10, minute=15), gross="20.00"),
            invoice("B1", at=day.replace(hour=9, minute=5), gross="10.00"),
            invoice(
                "B3",
                at=day.replace(hour=11, minute=10),
                mrn="MRN2",
                national_id="IC2",
                gross="30.00",
            ),
            invoice(
                "B4",
                at=day.replace(hour=12),
                mrn="MRN2",
                national_id="IC2",
                gross="40.00",
            ),
        ]

        result = reconcile_encounters_and_invoices(patients, encounters, invoices)

        self.assertEqual(
            [(pair.encounter.visit_at.hour, pair.invoice.bill_number) for pair in result.candidate_pairs],
            [(9, "B1"), (10, "B2")],
        )
        self.assertEqual(result.mismatched_cardinality_groups, 1)
        self.assertEqual(
            {item.invoice.bill_number for item in result.quarantined_invoices},
            {"B3", "B4"},
        )
        self.assertTrue(
            all(item.reason == "cardinality_mismatch" for item in result.quarantined_invoices)
        )

    def test_pdf_wins_only_financial_conflict_and_preserves_clinical_vitals_attendance(self) -> None:
        patients = patient_index()
        visit_at = datetime(2026, 8, 1, 9, 0, tzinfo=MYT)
        clinical = encounter(
            "UI1",
            at=visit_at,
            payment="90.00",
            symptom="Do not replace",
        )
        sale = invoice(
            "B1",
            at=visit_at.replace(hour=9, minute=30),
            gross="100.00",
        )

        result = reconcile_encounters_and_invoices(patients, [clinical], [sale])
        pair = result.candidate_pairs[0]

        self.assertEqual(pair.payment_status, "pdf_wins")
        self.assertEqual(pair.remedi_payment, Decimal("90.00"))
        self.assertEqual(pair.effective_payment, Decimal("100.00"))
        self.assertEqual(pair.encounter.visit_at, visit_at)
        self.assertEqual(pair.encounter.text["symptoms"], "Do not replace")
        self.assertEqual(pair.encounter.vitals["temperature"], "37.0")

    def test_enforces_zero_to_180_minute_auto_pair_window_and_balances_finances(self) -> None:
        patients = patient_index()
        day = datetime(2026, 8, 1, 9, 0, tzinfo=MYT)
        encounters = [
            encounter("UI1", at=day, payment="10.00"),
            encounter("UI2", at=day, payment="20.00"),
        ]
        invoices = [
            invoice("B1", at=day.replace(hour=12), gross="10.00"),
            invoice(
                "B2",
                at=day.replace(hour=8, minute=59),
                mrn="MRN2",
                national_id="IC2",
                gross="20.00",
            ),
        ]

        result = reconcile_encounters_and_invoices(patients, encounters, invoices)

        self.assertEqual([pair.invoice.bill_number for pair in result.auto_paired], ["B1"])
        self.assertEqual(
            [(item.invoice.bill_number, item.reason) for item in result.quarantined_invoices],
            [("B2", "billing_delay_out_of_window")],
        )
        totals = verify_financial_partition(
            invoices,
            [pair.invoice for pair in result.auto_paired],
            [item.invoice for item in result.quarantined_invoices],
        )
        self.assertEqual(totals["source"]["gross"], Decimal("30.00"))
        self.assertEqual(totals["importable"]["gross"], Decimal("10.00"))
        self.assertEqual(totals["quarantined"]["gross"], Decimal("20.00"))

        with self.assertRaisesRegex(ReconciliationError, "financial partition"):
            verify_financial_partition(invoices, invoices, invoices)

    def test_resolved_invoice_without_encounter_is_payment_only_not_quarantined(self) -> None:
        patients = patient_index()
        sale = invoice(
            "B1",
            at=datetime(2026, 8, 1, 12, 0, tzinfo=MYT),
            gross="25.00",
        )

        result = reconcile_encounters_and_invoices(patients, [], [sale])

        self.assertEqual(len(result.payment_only_invoices), 1)
        self.assertEqual(result.payment_only_invoices[0].patient_ui_id, "UI1")
        self.assertEqual(result.payment_only_invoices[0].invoice.bill_number, "B1")
        self.assertEqual(result.quarantined_invoices, ())


if __name__ == "__main__":
    unittest.main()
