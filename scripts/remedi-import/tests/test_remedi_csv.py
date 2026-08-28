from __future__ import annotations

import sys
import unittest
from datetime import date, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.remedi_csv import (  # noqa: E402
    ClinicalSourceError,
    parse_note_fragments,
    parse_patients,
    reconstruct_encounters,
    verify_fragment_provenance,
)


class RemediPatientParsingTest(unittest.TestCase):
    def test_parses_rfc4180_quoting_and_normalizes_ui_mrn_and_duplicate_ic(self) -> None:
        index = parse_patients(
            FIXTURES / "remedi_patients.synthetic.csv",
            today=date(2026, 8, 28),
        )

        self.assertEqual(len(index.records), 3)
        alice = index.by_ui_id["UI001"]
        self.assertEqual(alice.name, "Example, Alice")
        self.assertEqual(alice.mrn, "MRN001")
        self.assertEqual(alice.address, "Line one\nLine two")
        self.assertEqual(alice.date_of_birth, date(1990, 2, 1))
        self.assertEqual(alice.first_visit_date, date(2025, 12, 3))
        self.assertEqual(index.duplicated_national_ids, frozenset({"900101010001"}))
        self.assertNotIn("900101010001", index.unique_by_national_id)
        self.assertEqual(index.unique_by_national_id["A1234567"].ui_id, "UI003")

    def test_rejects_a_future_dob_and_invalid_calendar_date(self) -> None:
        source = (FIXTURES / "remedi_patients.synthetic.csv").read_text(encoding="utf-8")
        with TemporaryDirectory() as directory:
            future = Path(directory) / "future.csv"
            future.write_text(source.replace("01/02/1990", "01/02/2030", 1), encoding="utf-8")
            invalid = Path(directory) / "invalid.csv"
            invalid.write_text(source.replace("01/02/1990", "31/02/1990", 1), encoding="utf-8")

            with self.assertRaisesRegex(ClinicalSourceError, "row 2.*DATE OF BIRTH.*future"):
                parse_patients(future, today=date(2026, 8, 28))
            with self.assertRaisesRegex(ClinicalSourceError, "row 2.*DATE OF BIRTH.*invalid"):
                parse_patients(invalid, today=date(2026, 8, 28))


class RemediEncounterReconstructionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.patients = parse_patients(
            FIXTURES / "remedi_patients.synthetic.csv",
            today=date(2026, 8, 28),
        )

    def test_parses_day_first_attendance_as_malaysia_time_and_requires_patient_match(self) -> None:
        fragments = parse_note_fragments(
            FIXTURES / "remedi_notes.synthetic.csv",
            self.patients,
            now=datetime(2026, 8, 28, 23, 59, tzinfo=ZoneInfo("Asia/Kuala_Lumpur")),
        )

        self.assertEqual(len(fragments), 4)
        self.assertEqual(
            fragments[0].visit_at,
            datetime(2026, 8, 13, 9, 15, tzinfo=ZoneInfo("Asia/Kuala_Lumpur")),
        )
        self.assertEqual(fragments[0].patient_ui_id, "UI001")

        source = (FIXTURES / "remedi_notes.synthetic.csv").read_text(encoding="utf-8")
        with TemporaryDirectory() as directory:
            unmatched = Path(directory) / "unmatched.csv"
            unmatched.write_text(source.replace("ui-002", "ui-999", 1), encoding="utf-8")
            with self.assertRaisesRegex(ClinicalSourceError, "row 5.*UI999.*not found"):
                parse_note_fragments(unmatched, self.patients)

    def test_rejects_invalid_or_future_visit_dates(self) -> None:
        source = (FIXTURES / "remedi_notes.synthetic.csv").read_text(encoding="utf-8")
        with TemporaryDirectory() as directory:
            invalid = Path(directory) / "invalid.csv"
            invalid.write_text(source.replace("13/08/2026 09:15", "32/08/2026 09:15", 1), encoding="utf-8")
            future = Path(directory) / "future.csv"
            future.write_text(source.replace("13/08/2026 09:15", "29/08/2026 09:15", 1), encoding="utf-8")

            with self.assertRaisesRegex(ClinicalSourceError, "row 2.*visit_date.*invalid"):
                parse_note_fragments(invalid, self.patients)
            with self.assertRaisesRegex(ClinicalSourceError, "row 2.*visit_date.*future"):
                parse_note_fragments(
                    future,
                    self.patients,
                    now=datetime(2026, 8, 28, 23, 59, tzinfo=ZoneInfo("Asia/Kuala_Lumpur")),
                )

    def test_merges_complementary_fragments_without_duplicating_exact_rows(self) -> None:
        fragments = parse_note_fragments(
            FIXTURES / "remedi_notes.synthetic.csv",
            self.patients,
        )
        encounters = reconstruct_encounters(fragments)

        self.assertEqual(len(encounters), 2)
        first = encounters[0]
        self.assertEqual(first.patient_ui_id, "UI001")
        self.assertEqual(first.source_rows, (2, 3, 4))
        self.assertEqual(first.text["symptoms"], "Fever")
        self.assertEqual(first.text["diagnosis"], "Viral fever")
        self.assertEqual(first.text["procedure"], "Nebuliser")
        self.assertEqual(first.text["on_examination"], "Chest clear")
        self.assertEqual(first.text["lab_findings"], "CBC normal")
        self.assertEqual(first.vitals["sbp"], "120")
        self.assertNotIn("temperature", first.vitals)
        self.assertEqual(first.vital_conflicts["temperature"], ("37.0", "38.0"))
        self.assertNotIn("sbp", first.vital_conflicts)

    def test_hash_and_provenance_are_stable_when_fragment_output_order_changes(self) -> None:
        fragments = parse_note_fragments(
            FIXTURES / "remedi_notes.synthetic.csv",
            self.patients,
        )
        forward = reconstruct_encounters(fragments)
        reverse = reconstruct_encounters(list(reversed(fragments)))

        self.assertEqual(
            [encounter.encounter_hash for encounter in forward],
            [encounter.encounter_hash for encounter in reverse],
        )
        verify_fragment_provenance(fragments, forward)

        forward[0].source_rows = forward[0].source_rows + (2,)
        with self.assertRaisesRegex(ClinicalSourceError, "provenance.*duplicated"):
            verify_fragment_provenance(fragments, forward)


if __name__ == "__main__":
    unittest.main()
