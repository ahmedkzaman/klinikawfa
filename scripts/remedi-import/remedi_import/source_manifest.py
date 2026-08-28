from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable, Mapping


class SourceValidationError(ValueError):
    pass


LOCKED_PROFILE: dict[str, Any] = {
    "patient_rows": 3040,
    "note_fragments": 6111,
    "sales_physical_rows": 4521,
    "sales_gross_rm": "609759.50",
    "sales_patient_collection_rm": "338119.50",
    "sales_corporate_rm": "266623.00",
    "sales_outstanding_amount_rm": "0.00",
    "sales_outstanding_payment_rm": "0.00",
    "sales_months": [
        {
            "label": "sales_2026_01",
            "pages": 36,
            "physical_rows": 627,
            "gross_rm": "77571.60",
            "patient_collection_rm": "43588.50",
            "corporate_rm": "32957.10",
        },
        {
            "label": "sales_2026_02",
            "pages": 35,
            "physical_rows": 621,
            "gross_rm": "79094.10",
            "patient_collection_rm": "46204.00",
            "corporate_rm": "31316.10",
        },
        {
            "label": "sales_2026_03",
            "pages": 33,
            "physical_rows": 574,
            "gross_rm": "66507.80",
            "patient_collection_rm": "38773.00",
            "corporate_rm": "27450.80",
        },
        {
            "label": "sales_2026_04",
            "pages": 30,
            "physical_rows": 533,
            "gross_rm": "79015.80",
            "patient_collection_rm": "43348.00",
            "corporate_rm": "34326.80",
        },
        {
            "label": "sales_2026_05",
            "pages": 32,
            "physical_rows": 567,
            "gross_rm": "80186.40",
            "patient_collection_rm": "45951.00",
            "corporate_rm": "33830.40",
        },
        {
            "label": "sales_2026_06",
            "pages": 29,
            "physical_rows": 484,
            "gross_rm": "63673.90",
            "patient_collection_rm": "32696.00",
            "corporate_rm": "30977.90",
        },
        {
            "label": "sales_2026_07",
            "pages": 30,
            "physical_rows": 523,
            "gross_rm": "77218.90",
            "patient_collection_rm": "41986.00",
            "corporate_rm": "35009.90",
        },
        {
            "label": "sales_2026_08_01_to_28",
            "pages": 33,
            "physical_rows": 592,
            "gross_rm": "86491.00",
            "patient_collection_rm": "45573.00",
            "corporate_rm": "40754.00",
        },
    ],
}


_LOCKED_SOURCE_DATA: tuple[tuple[str, str, int, str], ...] = (
    (
        "patients_csv",
        "pt awfa.csv",
        693071,
        "a87e3b919473a8836b312dd142c4cc8183afe02d8ae8f34a6b0a3c3fb79d5908",
    ),
    (
        "clinical_notes_csv",
        "awfa_notes.csv",
        3879639,
        "f45cdc1d2be7a81d1ab51a2c776c4d1357686e21ebd5286a24bdd07442dc1748",
    ),
    (
        "sales_2026_01",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-01-2026 to 31-01-2026.pdf",
        222967,
        "85d569e435349e3d36edfcaf6836d7f89816cbb0721d2c11372318ae0c5ddd86",
    ),
    (
        "sales_2026_02",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-02-2026 to 28-02-2026.pdf",
        221584,
        "58eb2f8ef3e2fdb21c1007a41b6eb9b003d7839e60ef44a8b8169ef9b1b2fd47",
    ),
    (
        "sales_2026_03",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-03-2026 to 31-03-2026.pdf",
        204628,
        "a0bf36d57ea9995c5fbe770d6f11ad1bad9ac014239dd34c4e1200d0aed5a5a0",
    ),
    (
        "sales_2026_04",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-04-2026 to 30-04-2026.pdf",
        193101,
        "0f436af87a7ca5417d25309a27620773b35be56129d3ad2f9a3d97513918c36d",
    ),
    (
        "sales_2026_05",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-05-2026 to 31-05-2026.pdf",
        206307,
        "d7df234ed1868176cb3e9abdfd16d08038807fd35e42567815d529388b93ad45",
    ),
    (
        "sales_2026_06",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-06-2026 to 30-06-2026.pdf",
        186480,
        "111bec0f25c5c30aff7b435c7213563d5b56fa8abadd9c2a6c1fb0b93be72464",
    ),
    (
        "sales_2026_07",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-07-2026 to 31-07-2026 (1).pdf",
        196411,
        "3517ad44a2d682a308d3fc3c9920452b7497a4261c457b155b6abd49a1ee4e92",
    ),
    (
        "sales_2026_08_01_to_28",
        "SALES DATE RANGE REPORT BY INVOICE DATE, MASTER - 01-08-2026 to 28-08-2026.pdf",
        206958,
        "bed342d66b58caf2e59aeca9a739b277315c56569d45b112e958f9633cb4a997",
    ),
)


_MONEY = re.compile(r"(?<!\w)-?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)\.\d{2}(?!\w)")
_MAIN_ROW = re.compile(r"^\s*\d+\s+\d{2}/\d{2}/\d{4}\s+\d{1,2}:\d{2}\s+[AP]M\s+")
_CENTS = Decimal("0.01")


@dataclass(frozen=True)
class SourceSpec:
    label: str
    path: Path
    expected_bytes: int
    expected_sha256: str


def locked_source_specs(source_root: Path) -> list[SourceSpec]:
    return [
        SourceSpec(
            label=label,
            path=source_root / filename,
            expected_bytes=expected_bytes,
            expected_sha256=expected_sha256,
        )
        for label, filename, expected_bytes, expected_sha256 in _LOCKED_SOURCE_DATA
    ]


def summarize_sales_layout_pages(page_texts: Iterable[str]) -> dict[str, Any]:
    page_count = 0
    row_count = 0
    gross = Decimal("0")
    patient_collection = Decimal("0")
    corporate = Decimal("0")
    outstanding_amount = Decimal("0")
    outstanding_payment = Decimal("0")

    for page_text in page_texts:
        page_count += 1
        for line in page_text.splitlines():
            if not _MAIN_ROW.match(line):
                continue
            tokens = _MONEY.findall(line[125:])
            if len(tokens) != 10:
                raise SourceValidationError(
                    "sales layout row did not contain exactly 10 monetary columns"
                )
            try:
                amounts = [Decimal(token.replace(",", "").replace(" ", "")) for token in tokens]
            except InvalidOperation as error:
                raise SourceValidationError("sales layout contained invalid money") from error
            row_count += 1
            corporate += amounts[0]
            gross += amounts[2]
            patient_collection += amounts[7]
            outstanding_amount += amounts[8]
            outstanding_payment += amounts[9]

    def money(value: Decimal) -> str:
        return str(value.quantize(_CENTS))

    return {
        "pages": page_count,
        "physical_rows": row_count,
        "gross_rm": money(gross),
        "patient_collection_rm": money(patient_collection),
        "corporate_rm": money(corporate),
        "outstanding_amount_rm": money(outstanding_amount),
        "outstanding_payment_rm": money(outstanding_payment),
    }


def verify_profile(actual: Mapping[str, Any], expected: Mapping[str, Any]) -> None:
    def first_mismatch(left: Any, right: Any, path: str) -> str | None:
        if isinstance(left, Mapping) and isinstance(right, Mapping):
            keys = sorted(set(left) | set(right))
            for key in keys:
                child = f"{path}.{key}" if path else str(key)
                if key not in left or key not in right:
                    return child
                mismatch = first_mismatch(left[key], right[key], child)
                if mismatch is not None:
                    return mismatch
            return None
        if isinstance(left, list) and isinstance(right, list):
            if len(left) != len(right):
                return f"{path}.length"
            for index, (left_item, right_item) in enumerate(zip(left, right, strict=True)):
                mismatch = first_mismatch(left_item, right_item, f"{path}[{index}]")
                if mismatch is not None:
                    return mismatch
            return None
        return None if left == right else path

    mismatch = first_mismatch(actual, expected, "")
    if mismatch is not None:
        raise SourceValidationError(f"profile mismatch at {mismatch}")


def profile_sources(
    patients_csv: Path,
    notes_csv: Path,
    sales_pdfs: Iterable[tuple[str, Path]],
    *,
    pdf_page_loader: Any,
) -> dict[str, Any]:
    def count_csv_records(path: Path) -> int:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            return sum(1 for _row in csv.DictReader(stream))

    monthly: list[dict[str, Any]] = []
    physical_rows = 0
    gross = Decimal("0")
    patient_collection = Decimal("0")
    corporate = Decimal("0")
    outstanding_amount = Decimal("0")
    outstanding_payment = Decimal("0")

    for label, path in sales_pdfs:
        summary = summarize_sales_layout_pages(pdf_page_loader(path))
        physical_rows += int(summary["physical_rows"])
        gross += Decimal(summary["gross_rm"])
        patient_collection += Decimal(summary["patient_collection_rm"])
        corporate += Decimal(summary["corporate_rm"])
        outstanding_amount += Decimal(summary["outstanding_amount_rm"])
        outstanding_payment += Decimal(summary["outstanding_payment_rm"])
        monthly.append(
            {
                "label": label,
                "pages": summary["pages"],
                "physical_rows": summary["physical_rows"],
                "gross_rm": summary["gross_rm"],
                "patient_collection_rm": summary["patient_collection_rm"],
                "corporate_rm": summary["corporate_rm"],
            }
        )

    def money(value: Decimal) -> str:
        return str(value.quantize(_CENTS))

    return {
        "patient_rows": count_csv_records(patients_csv),
        "note_fragments": count_csv_records(notes_csv),
        "sales_physical_rows": physical_rows,
        "sales_gross_rm": money(gross),
        "sales_patient_collection_rm": money(patient_collection),
        "sales_corporate_rm": money(corporate),
        "sales_outstanding_amount_rm": money(outstanding_amount),
        "sales_outstanding_payment_rm": money(outstanding_payment),
        "sales_months": monthly,
    }


def compile_counts_only_batch(
    specs: Iterable[SourceSpec],
    *,
    destination: Path,
    expected_profile: Mapping[str, Any],
    pdf_page_loader: Any,
) -> dict[str, Any]:
    spec_list = list(specs)
    source_records = validate_sources(spec_list)
    by_label = {spec.label: spec for spec in spec_list}
    if len(by_label) != len(spec_list):
        raise SourceValidationError("source labels must be unique")
    for required in ("patients_csv", "clinical_notes_csv"):
        if required not in by_label:
            raise SourceValidationError(f"required source label is missing: {required}")

    sales = [
        (spec.label, spec.path)
        for spec in spec_list
        if spec.label.startswith("sales_")
    ]
    profile = profile_sources(
        by_label["patients_csv"].path,
        by_label["clinical_notes_csv"].path,
        sales,
        pdf_page_loader=pdf_page_loader,
    )
    verify_profile(profile, expected_profile)
    manifest = build_counts_only_manifest(source_records, profile)
    write_counts_only_manifest(destination, manifest)
    return manifest


def load_pdf_layout_pages(path: Path) -> list[str]:
    from pypdf import PdfReader

    reader = PdfReader(path)
    return [
        page.extract_text(extraction_mode="layout") or ""
        for page in reader.pages
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate locked Remedi sources and emit a counts-only manifest."
    )
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    manifest = compile_counts_only_batch(
        locked_source_specs(args.source_dir),
        destination=args.output,
        expected_profile=LOCKED_PROFILE,
        pdf_page_loader=load_pdf_layout_pages,
    )
    print(json.dumps(manifest["profile"], sort_keys=True))
    return 0


def validate_sources(specs: Iterable[SourceSpec]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for spec in specs:
        if not spec.path.is_file():
            raise SourceValidationError(f"{spec.label}: source is missing")

        actual_bytes = spec.path.stat().st_size
        if actual_bytes != spec.expected_bytes:
            raise SourceValidationError(
                f"{spec.label}: byte size mismatch "
                f"(expected {spec.expected_bytes}, found {actual_bytes})"
            )

        digest = hashlib.sha256()
        with spec.path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        actual_sha256 = digest.hexdigest()
        if actual_sha256 != spec.expected_sha256.lower():
            raise SourceValidationError(f"{spec.label}: SHA-256 mismatch")

        records.append(
            {
                "label": spec.label,
                "bytes": actual_bytes,
                "sha256": actual_sha256,
            }
        )
    return records


def build_counts_only_manifest(
    source_records: list[dict[str, Any]], profile: Mapping[str, Any]
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "sources": source_records,
        "profile": dict(profile),
    }


def write_counts_only_manifest(destination: Path, manifest: Mapping[str, Any]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
