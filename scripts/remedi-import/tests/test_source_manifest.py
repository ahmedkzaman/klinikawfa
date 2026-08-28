from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.source_manifest import (  # noqa: E402
    LOCKED_PROFILE,
    SourceSpec,
    SourceValidationError,
    build_counts_only_manifest,
    compile_counts_only_batch,
    locked_source_specs,
    profile_sources,
    summarize_sales_layout_pages,
    validate_sources,
    verify_profile,
    write_counts_only_manifest,
)


class SourceManifestTest(unittest.TestCase):
    def make_spec(self, path: Path, data: bytes, *, label: str = "patients") -> SourceSpec:
        return SourceSpec(
            label=label,
            path=path,
            expected_bytes=len(data),
            expected_sha256=hashlib.sha256(data).hexdigest(),
        )

    def test_validates_exact_size_and_sha256_without_exposing_source_path(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "patient-name-is-phi.csv"
            data = b"locked source bytes"
            source.write_bytes(data)

            result = validate_sources([self.make_spec(source, data)])

            self.assertEqual(
                result,
                [
                    {
                        "label": "patients",
                        "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest(),
                    }
                ],
            )
            self.assertNotIn(str(source), json.dumps(result))

    def test_rejects_a_missing_source(self) -> None:
        with TemporaryDirectory() as directory:
            missing = Path(directory) / "missing.csv"
            spec = self.make_spec(missing, b"expected", label="clinical_notes")

            with self.assertRaisesRegex(SourceValidationError, "clinical_notes.*missing"):
                validate_sources([spec])

    def test_rejects_a_resized_source(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "changed.csv"
            expected = b"expected"
            source.write_bytes(expected + b"!")

            with self.assertRaisesRegex(SourceValidationError, "patients.*byte size"):
                validate_sources([self.make_spec(source, expected)])

    def test_rejects_same_size_changed_bytes(self) -> None:
        with TemporaryDirectory() as directory:
            source = Path(directory) / "changed.csv"
            expected = b"expected"
            source.write_bytes(b"EXpEcted")

            with self.assertRaisesRegex(SourceValidationError, "patients.*SHA-256"):
                validate_sources([self.make_spec(source, expected)])

    def test_writes_only_the_fixed_counts_only_schema(self) -> None:
        with TemporaryDirectory() as directory:
            destination = Path(directory) / "manifest.json"
            source_records = [
                {"label": "patients", "bytes": 10, "sha256": "a" * 64},
            ]
            profile = {
                "patient_rows": 3040,
                "note_fragments": 6111,
                "sales_physical_rows": 4521,
                "sales_gross_rm": "609759.50",
                "sales_patient_collection_rm": "338119.50",
                "sales_corporate_rm": "271640.00",
            }

            manifest = build_counts_only_manifest(source_records, profile)
            write_counts_only_manifest(destination, manifest)
            rendered = destination.read_text(encoding="utf-8")

            self.assertEqual(json.loads(rendered), manifest)
            self.assertEqual(set(manifest), {"schema_version", "sources", "profile"})
            self.assertNotIn("path", rendered.lower())
            for forbidden_key in (
                "name",
                "patient_id",
                "mrn",
                "phone",
                "email",
                "address",
                "notes",
                "bill_number",
            ):
                self.assertNotIn(forbidden_key, rendered.lower())

    def test_locked_source_set_contains_exactly_two_csvs_and_eight_monthly_pdfs(self) -> None:
        specs = locked_source_specs(Path("source-root"))

        self.assertEqual(len(specs), 10)
        self.assertEqual(
            [spec.label for spec in specs],
            [
                "patients_csv",
                "clinical_notes_csv",
                "sales_2026_01",
                "sales_2026_02",
                "sales_2026_03",
                "sales_2026_04",
                "sales_2026_05",
                "sales_2026_06",
                "sales_2026_07",
                "sales_2026_08_01_to_28",
            ],
        )
        self.assertTrue(all(spec.path.parent == Path("source-root") for spec in specs))

    def test_summarizes_fixed_layout_sales_rows_with_decimal_totals(self) -> None:
        row = (
            "1 01/01/2026 10:00 AM".ljust(125)
            + "50.00 70.00 120.00 70.00 0.00 0.00 0.00 70.00 0.00 0.00"
        )

        summary = summarize_sales_layout_pages([row])

        self.assertEqual(
            summary,
            {
                "pages": 1,
                "physical_rows": 1,
                "gross_rm": "120.00",
                "patient_collection_rm": "70.00",
                "corporate_rm": "50.00",
                "outstanding_amount_rm": "0.00",
                "outstanding_payment_rm": "0.00",
            },
        )

    def test_profile_verification_rejects_any_locked_count_or_total_change(self) -> None:
        changed = dict(LOCKED_PROFILE)
        changed["patient_rows"] = 3039

        with self.assertRaisesRegex(SourceValidationError, "profile mismatch.*patient_rows"):
            verify_profile(changed, LOCKED_PROFILE)

    def test_profiles_rfc4180_csv_rows_and_sales_pages_without_returning_phi(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            patients = root / "patients.csv"
            notes = root / "notes.csv"
            january = root / "january.pdf"
            patients.write_text(
                'id,name\n1,"Patient, One"\n2,"Patient\nTwo"\n',
                encoding="utf-8",
            )
            notes.write_text("id,note\n1,a\n1,b\n2,c\n", encoding="utf-8")
            january.write_bytes(b"synthetic pdf placeholder")
            sales_row = (
                "1 01/01/2026 10:00 AM".ljust(125)
                + "50.00 70.00 120.00 70.00 0.00 0.00 0.00 70.00 0.00 0.00"
            )

            profile = profile_sources(
                patients,
                notes,
                [("sales_2026_01", january)],
                pdf_page_loader=lambda _path: [sales_row],
            )

            self.assertEqual(profile["patient_rows"], 2)
            self.assertEqual(profile["note_fragments"], 3)
            self.assertEqual(profile["sales_physical_rows"], 1)
            self.assertEqual(profile["sales_gross_rm"], "120.00")
            self.assertEqual(profile["sales_patient_collection_rm"], "70.00")
            self.assertEqual(profile["sales_corporate_rm"], "50.00")
            self.assertEqual(profile["sales_outstanding_amount_rm"], "0.00")
            self.assertEqual(profile["sales_outstanding_payment_rm"], "0.00")
            self.assertEqual(
                profile["sales_months"],
                [
                    {
                        "label": "sales_2026_01",
                        "pages": 1,
                        "physical_rows": 1,
                        "gross_rm": "120.00",
                        "patient_collection_rm": "70.00",
                        "corporate_rm": "50.00",
                    }
                ],
            )
            rendered = json.dumps(profile)
            self.assertNotIn("Patient", rendered)
            self.assertNotIn("synthetic pdf placeholder", rendered)

    def test_compiler_validates_sources_profiles_them_and_writes_the_manifest(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            patients = root / "patients.csv"
            notes = root / "notes.csv"
            sales = root / "sales.pdf"
            destination = root / "manifest.json"
            patients_data = b"id\n1\n"
            notes_data = b"id\n1\n"
            sales_data = b"locked pdf"
            patients.write_bytes(patients_data)
            notes.write_bytes(notes_data)
            sales.write_bytes(sales_data)
            sales_row = (
                "1 01/01/2026 10:00 AM".ljust(125)
                + "50.00 70.00 120.00 70.00 0.00 0.00 0.00 70.00 0.00 0.00"
            )
            specs = [
                self.make_spec(patients, patients_data, label="patients_csv"),
                self.make_spec(notes, notes_data, label="clinical_notes_csv"),
                self.make_spec(sales, sales_data, label="sales_2026_01"),
            ]
            expected_profile = {
                "patient_rows": 1,
                "note_fragments": 1,
                "sales_physical_rows": 1,
                "sales_gross_rm": "120.00",
                "sales_patient_collection_rm": "70.00",
                "sales_corporate_rm": "50.00",
                "sales_outstanding_amount_rm": "0.00",
                "sales_outstanding_payment_rm": "0.00",
                "sales_months": [
                    {
                        "label": "sales_2026_01",
                        "pages": 1,
                        "physical_rows": 1,
                        "gross_rm": "120.00",
                        "patient_collection_rm": "70.00",
                        "corporate_rm": "50.00",
                    }
                ],
            }

            manifest = compile_counts_only_batch(
                specs,
                destination=destination,
                expected_profile=expected_profile,
                pdf_page_loader=lambda _path: [sales_row],
            )

            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), manifest)
            self.assertEqual(manifest["profile"], expected_profile)
            self.assertEqual([source["label"] for source in manifest["sources"]], [
                "patients_csv",
                "clinical_notes_csv",
                "sales_2026_01",
            ])

    def test_script_entry_point_binds_all_helpers_before_running_main(self) -> None:
        script = PACKAGE_ROOT / "remedi_import" / "source_manifest.py"
        with TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "--source-dir",
                    directory,
                    "--output",
                    str(Path(directory) / "manifest.json"),
                ],
                capture_output=True,
                check=False,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("patients_csv: source is missing", result.stderr)
        self.assertNotIn("NameError", result.stderr)


if __name__ == "__main__":
    unittest.main()
