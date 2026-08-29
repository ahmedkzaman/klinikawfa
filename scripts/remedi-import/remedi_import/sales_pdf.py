from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

from .models import CanonicalInvoice, SalesParseResult, SalesRow


class SalesSourceError(ValueError):
    pass


MYT = ZoneInfo("Asia/Kuala_Lumpur")
MONEY = re.compile(r"(?<!\w)-?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\.\d{2}(?!\w)")
MAIN_ROW = re.compile(
    r"^\s*(\d+)\s+(\d{2}/\d{2}/\d{4})\s+(\d{1,2}:\d{2}\s+[AP]M)\s+"
)
PAREN_VALUE = re.compile(r"\(([^()]*)\)")
CENTS = Decimal("0.01")


def normalize_identifier(value: str) -> str:
    return "".join(character for character in value.upper() if character.isalnum())


def parse_money(value: str) -> Decimal:
    try:
        return Decimal(value.replace(",", "").replace(" ", "")).quantize(CENTS)
    except InvalidOperation as error:
        raise SalesSourceError("invalid monetary value") from error


def parse_sales_layout_pages(source_label: str, pages: Iterable[str]) -> SalesParseResult:
    rows: list[SalesRow] = []
    page_count = 0

    for page_text in pages:
        page_count += 1
        current: dict[str, object] | None = None

        def finish() -> None:
            nonlocal current
            if current is None:
                return
            identifiers = current["identifiers"]
            assert isinstance(identifiers, list)
            rows.append(
                SalesRow(
                    source_label=source_label,
                    source_row=int(current["source_row"]),
                    invoice_at=current["invoice_at"],
                    bill_number=str(current["bill_number"]),
                    mrn=normalize_identifier(identifiers[0]) if identifiers else "",
                    national_id=(
                        normalize_identifier(identifiers[1]) if len(identifiers) > 1 else ""
                    ),
                    amounts=current["amounts"],
                )
            )
            current = None

        for line in page_text.splitlines():
            match = MAIN_ROW.match(line)
            if match:
                finish()
                money_tokens = MONEY.findall(line)
                if len(money_tokens) != 10:
                    raise SalesSourceError(
                        f"{source_label} row {match.group(1)} expected 10 monetary columns, "
                        f"found {len(money_tokens)}"
                    )
                try:
                    invoice_at = datetime.strptime(
                        f"{match.group(2)} {match.group(3)}", "%d/%m/%Y %I:%M %p"
                    ).replace(tzinfo=MYT)
                except ValueError as error:
                    raise SalesSourceError(
                        f"{source_label} row {match.group(1)} has invalid invoice time"
                    ) from error
                patient_segment = line[57:99]
                current = {
                    "source_row": int(match.group(1)),
                    "invoice_at": invoice_at,
                    "bill_number": line[32:57].strip(),
                    "identifiers": PAREN_VALUE.findall(patient_segment),
                    "amounts": tuple(parse_money(token) for token in money_tokens),
                }
            elif current is not None:
                patient_segment = line[57:99]
                identifiers = current["identifiers"]
                assert isinstance(identifiers, list)
                identifiers.extend(PAREN_VALUE.findall(patient_segment))
        finish()

    return SalesParseResult(page_count, tuple(rows))


def canonicalize_invoices(rows: Iterable[SalesRow]) -> list[CanonicalInvoice]:
    grouped: dict[str, list[SalesRow]] = defaultdict(list)
    for row in rows:
        if not row.bill_number:
            raise SalesSourceError(
                f"{row.source_label} row {row.source_row} has a blank bill number"
            )
        if len(row.amounts) != 10:
            raise SalesSourceError(
                f"{row.source_label} row {row.source_row} does not have 10 monetary columns"
            )
        grouped[row.bill_number].append(row)

    invoices: list[CanonicalInvoice] = []
    for bill_number, group in grouped.items():
        identities = {
            (row.mrn, row.national_id, row.invoice_at)
            for row in group
        }
        if len(identities) != 1:
            raise SalesSourceError(f"{bill_number} duplicate bill patient/time conflict")
        ordered = sorted(
            group,
            key=lambda row: (row.source_label, row.source_row),
        )
        first = ordered[0]
        amounts = tuple(
            sum((row.amounts[index] for row in ordered), Decimal("0")).quantize(CENTS)
            for index in range(10)
        )
        invoices.append(
            CanonicalInvoice(
                source_label=first.source_label,
                source_rows=tuple(row.source_row for row in ordered),
                invoice_at=first.invoice_at,
                bill_number=bill_number,
                mrn=first.mrn,
                national_id=first.national_id,
                amounts=amounts,
            )
        )
    return sorted(invoices, key=lambda invoice: (invoice.invoice_at, invoice.bill_number))


def profile_canonical_invoices(invoices: Iterable[CanonicalInvoice]) -> dict[str, object]:
    invoice_list = list(invoices)
    anomalies = [invoice for invoice in invoice_list if invoice.balance_discrepancy != 0]
    discrepancy = sum(
        (invoice.balance_discrepancy for invoice in anomalies), Decimal("0")
    ).quantize(CENTS)
    return {
        "canonical_invoices": len(invoice_list),
        "self_pay_only": sum(
            invoice.corporate == 0 and invoice.cash_collection > 0
            for invoice in invoice_list
        ),
        "panel_only": sum(
            invoice.corporate > 0 and invoice.cash_collection == 0
            for invoice in invoice_list
        ),
        "mixed": sum(
            invoice.corporate > 0 and invoice.cash_collection > 0
            for invoice in invoice_list
        ),
        "zero_total": sum(invoice.gross == 0 for invoice in invoice_list),
        "invoice_total_anomalies": len(anomalies),
        "invoice_total_discrepancy_rm": str(discrepancy),
    }


def validate_canonical_invoices(
    invoices: Iterable[CanonicalInvoice], *, expected_anomaly_count: int
) -> None:
    invoice_list = list(invoices)
    for invoice in invoice_list:
        if invoice.cash_sales != invoice.cash_collection:
            raise SalesSourceError(
                f"{invoice.bill_number} Cash Sales does not equal Cash Collection"
            )
        channel_total = sum(invoice.amounts[3:7], Decimal("0")).quantize(CENTS)
        if channel_total != invoice.cash_collection:
            raise SalesSourceError(
                f"{invoice.bill_number} channel allocation does not equal Cash Collection"
            )
        if invoice.outstanding_amount != 0 or invoice.outstanding_payment != 0:
            raise SalesSourceError(f"{invoice.bill_number} has non-zero outstanding values")

    actual_anomalies = sum(
        invoice.balance_discrepancy != 0 for invoice in invoice_list
    )
    if actual_anomalies != expected_anomaly_count:
        raise SalesSourceError(
            f"expected {expected_anomaly_count} invoice-total anomalies, found {actual_anomalies}"
        )


def load_pdf_layout_pages(path: Path) -> list[str]:
    from pypdf import PdfReader

    return [
        page.extract_text(extraction_mode="layout") or ""
        for page in PdfReader(path).pages
    ]
