from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.bundle import (  # noqa: E402
    BundleError,
    BundleInputs,
    write_private_bundle,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def synthetic_inputs() -> BundleInputs:
    return BundleInputs(
        batch_id="10000000-0000-4000-8000-000000000001",
        idempotency_key="10000000-0000-4000-8000-000000000002",
        actor_id="10000000-0000-4000-8000-000000000003",
        source_manifest_sha256="a" * 64,
        compiler_version="test-1",
        source_files=(
            {
                "id": "10000000-0000-4000-8000-000000000010",
                "source_kind": "patients_csv",
                "filename": "patients.csv",
                "byte_size": 123,
                "sha256": "b" * 64,
                "page_count": None,
                "row_count": 1,
                "source_start_date": None,
                "source_end_date": None,
            },
        ),
        counts={
            "patients": 1,
            "encounters": 1,
            "canonical_invoices": 1,
            "source_gross_rm": "25.00",
            "source_patient_collection_rm": "25.00",
            "source_corporate_rm": "0.00",
            "quarantined_invoices": 0,
        },
        rows={
            "patients.copy.csv": (
                {
                    "proposed_patient_id": "20000000-0000-4000-8000-000000000001",
                    "remedi_ui_id": "PRIVATE-UI-1",
                    "remedi_mrn": "PRIVATE-MRN-1",
                    "source_row": 2,
                    "source_key_hash": "c" * 64,
                    "id_number_sha256": "d" * 64,
                    "name": "Private Person",
                    "phone": "+60123456789",
                    "email": "private@example.test",
                    "id_type": "mykad",
                    "national_id": "900101010001",
                    "passport_no": None,
                    "date_of_birth": "1990-01-01",
                    "gender": "male",
                    "address": "Private address",
                    "registration_date": "2026-01-01",
                },
            ),
            "queue_entries.copy.csv": (),
            "consultations.copy.csv": (),
            "vital_signs.copy.csv": (),
            "consultation_items.copy.csv": (),
            "payments.staging.copy.csv": (),
            "panel_claims.staging.copy.csv": (),
            "patient_map.copy.csv": (),
            "encounter_map.copy.csv": (),
            "invoice_map.copy.csv": (),
            "conflicts.csv": (),
        },
    )


class PrivateBundleTest(unittest.TestCase):
    def test_refuses_output_inside_repository(self) -> None:
        with self.assertRaisesRegex(BundleError, "outside the Git repository"):
            write_private_bundle(
                PACKAGE_ROOT / "private-output",
                synthetic_inputs(),
                repository_root=PACKAGE_ROOT,
            )

    def test_output_is_deterministic_and_manifest_is_counts_only(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_dir = Path(first) / "batch"
            second_dir = Path(second) / "batch"
            write_private_bundle(first_dir, synthetic_inputs(), repository_root=PACKAGE_ROOT)
            write_private_bundle(second_dir, synthetic_inputs(), repository_root=PACKAGE_ROOT)

            first_hashes = {
                path.name: sha256(path)
                for path in sorted(first_dir.iterdir())
                if path.is_file()
            }
            second_hashes = {
                path.name: sha256(path)
                for path in sorted(second_dir.iterdir())
                if path.is_file()
            }
            self.assertEqual(first_hashes, second_hashes)

            manifest_text = (first_dir / "manifest.json").read_text(encoding="utf-8")
            manifest = json.loads(manifest_text)
            self.assertEqual(manifest["counts"]["patients"], 1)
            self.assertNotIn("Private Person", manifest_text)
            self.assertNotIn("PRIVATE-UI-1", manifest_text)
            self.assertNotIn("900101010001", manifest_text)
            self.assertRegex(manifest["bundle_sha256"], r"^[0-9a-f]{64}$")

    def test_import_and_rollback_are_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "batch"
            write_private_bundle(output, synthetic_inputs(), repository_root=PACKAGE_ROOT)
            import_sql = (output / "import.sql").read_text(encoding="utf-8")
            rollback_sql = (output / "rollback.sql").read_text(encoding="utf-8")

            for required in (
                "\\set ON_ERROR_STOP on",
                "BEGIN;",
                "CREATE TEMP TABLE",
                "\\copy",
                "private.begin_remedi_import_context",
                "private.import_remedi_payment",
                "private.import_remedi_panel_claim",
                "REMEDI_PATIENT_MAP_MANY_TO_ONE_MIGRATION_MISSING",
                "SET CONSTRAINTS ALL DEFERRED",
                "COMMIT;",
            ):
                self.assertIn(required, import_sql)
            self.assertNotIn("DISABLE TRIGGER", import_sql.upper())
            self.assertNotIn("session_replication_role", import_sql)
            self.assertIn("d.destination_identity_count = 1", import_sql)

            self.assertIn("REMEDI_ROLLBACK_DEPENDENCY_CONFLICT", rollback_sql)
            self.assertIn("private.remedi_patient_map", rollback_sql)
            self.assertIn("private.remedi_encounter_map", rollback_sql)
            self.assertIn("private.remedi_invoice_map", rollback_sql)
            self.assertIn("COMMIT;", rollback_sql)

    def test_patient_resolution_handles_duplicate_destination_identity_safely(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "batch"
            write_private_bundle(output, synthetic_inputs(), repository_root=PACKAGE_ROOT)
            import_sql = (output / "import.sql").read_text(encoding="utf-8")

            self.assertIn("strict_destination_match_count", import_sql)
            self.assertIn("normalized_phone", import_sql)
            self.assertIn("normalized_name", import_sql)
            self.assertIn("REMEDI_PATIENT_DUPLICATE_DESTINATION_IDENTITY", import_sql)
            self.assertNotIn("identity_dob_phone_name", import_sql)

    def test_duplicate_identity_prefers_one_established_destination_patient(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "batch"
            write_private_bundle(output, synthetic_inputs(), repository_root=PACKAGE_ROOT)
            import_sql = (output / "import.sql").read_text(encoding="utf-8")

            self.assertIn("destination_patient_usage", import_sql)
            self.assertIn("external_id_count", import_sql)
            self.assertIn("consultation_count", import_sql)
            self.assertIn("queue_entry_count", import_sql)
            self.assertIn("duplicate_usage_rank", import_sql)
            self.assertIn("duplicate_top_rank_count = 1", import_sql)
            self.assertIn("'national_id'::text AS match_method", import_sql)

    def test_multiple_source_records_can_map_to_one_existing_patient(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "batch"
            write_private_bundle(output, synthetic_inputs(), repository_root=PACKAGE_ROOT)
            import_sql = (output / "import.sql").read_text(encoding="utf-8")

            matched_identity = import_sql.split("), matched_identity AS (", 1)[1].split(
                "), strict_duplicate_identity AS (", 1
            )[0]
            self.assertNotIn("s.source_identity_count = 1", matched_identity)
            self.assertIn(
                "HAVING count(*) > 1 AND bool_or(match_method = 'inserted')",
                import_sql,
            )


if __name__ == "__main__":
    unittest.main()
