from __future__ import annotations

import sys
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(PACKAGE_ROOT))

from remedi_import.models import SalesRow  # noqa: E402
from remedi_import.sales_pdf import (  # noqa: E402
    SalesSourceError,
    canonicalize_invoices,
    parse_sales_layout_pages,
    profile_canonical_invoices,
    validate_canonical_invoices,
)


def layout_row(
    row_number: int,
    bill_number: str,
    patient_segment: str,
    amounts: list[str],
    *,
    date_text: str = "01/01/2026",
    time_text: str = "10:00 AM",
) -> str:
    line = list(f"{row_number} {date_text} {time_text}".ljust(125))
    line[32:57] = list(bill_number.ljust(25)[:25])
    line[57:99] = list(patient_segment.ljust(42)[:42])
    line[99:125] = list("Dr Synthetic".ljust(26))
    return "".join(line) + " " + " ".join(amounts)


def continuation(patient_segment: str) -> str:
    line = list("".ljust(125))
    line[57:99] = list(patient_segment.ljust(42)[:42])
    return "".join(line)


class SalesPdfParsingTest(unittest.TestCase):
    def synthetic_page(self) -> str:
        fixture = (FIXTURES / "sales_report_layout.synthetic.txt").read_text(encoding="utf-8")
        return (
            fixture.replace(
                "{{ROW_1}}",
                layout_row(
                    1,
                    "BILL-001",
                    "Synthetic Patient (mrn-001)",
                    ["50.00", "70.00", "120.00", "70.00", "0.00", "0.00", "0.00", "70.00", "0.00", "0.00"],
                ),
            )
            .replace("{{CONTINUATION_1}}", continuation("(900101-01-0001)"))
            .replace(
                "{{ROW_2}}",
                layout_row(
                    2,
                    "BILL-002",
                    "Anonymous cash patient",
                    ["1 339.00", "-10.00", "1 329.00", "-10.00", "0.00", "0.00", "0.00", "-10.00", "0.00", "0.00"],
                    time_text="11:05 AM",
                ),
            )
        )

    def test_ignores_headers_and_footers_and_reads_continuation_identifiers(self) -> None:
        result = parse_sales_layout_pages("sales_2026_01", [self.synthetic_page()])

        self.assertEqual(result.pages, 1)
        self.assertEqual(len(result.rows), 2)
        first = result.rows[0]
        self.assertEqual(first.source_row, 1)
        self.assertEqual(first.bill_number, "BILL-001")
        self.assertEqual(first.mrn, "MRN001")
        self.assertEqual(first.national_id, "900101010001")
        self.assertEqual(
            first.invoice_at,
            datetime(2026, 1, 1, 10, 0, tzinfo=ZoneInfo("Asia/Kuala_Lumpur")),
        )

    def test_parses_spaced_thousands_negative_values_and_blank_identifiers_as_decimal(self) -> None:
        result = parse_sales_layout_pages("sales_2026_01", [self.synthetic_page()])
        second = result.rows[1]

        self.assertEqual(second.mrn, "")
        self.assertEqual(second.national_id, "")
        self.assertEqual(second.amounts[0], Decimal("1339.00"))
        self.assertEqual(second.amounts[1], Decimal("-10.00"))
        self.assertEqual(second.amounts[2], Decimal("1329.00"))

    def test_rejects_a_main_row_with_unknown_monetary_columns(self) -> None:
        bad = layout_row(
            1,
            "BILL-001",
            "Patient (MRN-001)",
            ["1.00"] * 9,
        )

        with self.assertRaisesRegex(SalesSourceError, "sales_2026_01.*row 1.*10 monetary"):
            parse_sales_layout_pages("sales_2026_01", [bad])


class SalesCanonicalizationTest(unittest.TestCase):
    def row(
        self,
        source_row: int,
        *,
        bill: str = "BILL-001",
        mrn: str = "MRN001",
        minute: int = 0,
        amounts: tuple[Decimal, ...] | None = None,
    ) -> SalesRow:
        return SalesRow(
            source_label="sales_2026_01",
            source_row=source_row,
            invoice_at=datetime(2026, 1, 1, 10, minute, tzinfo=ZoneInfo("Asia/Kuala_Lumpur")),
            bill_number=bill,
            mrn=mrn,
            national_id="900101010001",
            amounts=amounts or (
                Decimal("50.00"), Decimal("70.00"), Decimal("120.00"),
                Decimal("70.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
                Decimal("70.00"), Decimal("0.00"), Decimal("0.00"),
            ),
        )

    def test_aggregates_duplicate_bill_components_only_for_the_same_patient_and_time(self) -> None:
        first = self.row(1)
        second = self.row(
            2,
            amounts=(
                Decimal("5.00"), Decimal("0.00"), Decimal("5.00"),
                Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
                Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
            ),
        )

        invoices = canonicalize_invoices([first, second])

        self.assertEqual(len(invoices), 1)
        self.assertEqual(invoices[0].source_rows, (1, 2))
        self.assertEqual(invoices[0].corporate, Decimal("55.00"))
        self.assertEqual(invoices[0].gross, Decimal("125.00"))

    def test_rejects_duplicate_bill_with_conflicting_patient_or_exact_time(self) -> None:
        with self.assertRaisesRegex(SalesSourceError, "BILL-001.*patient/time conflict"):
            canonicalize_invoices([self.row(1), self.row(2, mrn="MRN999")])
        with self.assertRaisesRegex(SalesSourceError, "BILL-001.*patient/time conflict"):
            canonicalize_invoices([self.row(1), self.row(2, minute=1)])

    def test_profiles_shapes_and_keeps_anomalies_without_forcing_a_balance(self) -> None:
        balanced = canonicalize_invoices([self.row(1)])[0]
        anomalous = canonicalize_invoices([
            self.row(
                2,
                bill="BILL-002",
                amounts=(
                    Decimal("40.00"), Decimal("50.00"), Decimal("100.00"),
                    Decimal("50.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
                    Decimal("50.00"), Decimal("0.00"), Decimal("0.00"),
                ),
            )
        ])[0]

        profile = profile_canonical_invoices([balanced, anomalous])

        self.assertEqual(profile["invoice_total_anomalies"], 1)
        self.assertEqual(profile["invoice_total_discrepancy_rm"], "10.00")
        self.assertEqual(anomalous.balance_discrepancy, Decimal("10.00"))
        validate_canonical_invoices([balanced, anomalous], expected_anomaly_count=1)

    def test_rejects_cash_collection_channel_or_outstanding_mismatch(self) -> None:
        bad_collection = canonicalize_invoices([
            self.row(
                1,
                amounts=(
                    Decimal("50.00"), Decimal("70.00"), Decimal("120.00"),
                    Decimal("60.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
                    Decimal("70.00"), Decimal("0.00"), Decimal("0.00"),
                ),
            )
        ])[0]
        with self.assertRaisesRegex(SalesSourceError, "channel allocation"):
            validate_canonical_invoices([bad_collection], expected_anomaly_count=0)

        outstanding = canonicalize_invoices([
            self.row(
                1,
                amounts=(
                    Decimal("50.00"), Decimal("70.00"), Decimal("120.00"),
                    Decimal("70.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00"),
                    Decimal("70.00"), Decimal("1.00"), Decimal("0.00"),
                ),
            )
        ])[0]
        with self.assertRaisesRegex(SalesSourceError, "outstanding"):
            validate_canonical_invoices([outstanding], expected_anomaly_count=0)


if __name__ == "__main__":
    unittest.main()
