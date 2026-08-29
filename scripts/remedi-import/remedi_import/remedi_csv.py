from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

from .models import (
    ClinicalEncounter,
    ClinicalFragment,
    PatientIndex,
    PatientRecord,
)


class ClinicalSourceError(ValueError):
    pass


MYT = ZoneInfo("Asia/Kuala_Lumpur")
TEXT_FIELDS = (
    "diagnosis",
    "procedure",
    "medication",
    "symptoms",
    "on_examination",
    "other_vital_sign",
    "lab_findings",
    "lab_imaging",
    "patient_plan_care",
    "mc_issued",
    "mc_day_no",
    "mc_start",
    "payment",
    "visit_type",
)
VITAL_FIELDS = (
    "sbp",
    "dbp",
    "pulse_rate",
    "weight",
    "height",
    "spo2",
    "temperature",
)


def normalize_identifier(value: str | None) -> str:
    return "".join(character for character in (value or "").upper() if character.isalnum())


def _trim(value: str | None) -> str:
    return (value or "").strip()


def _parse_date(
    value: str | None,
    *,
    row_number: int,
    field: str,
    today: date,
) -> date | None:
    raw = _trim(value)
    if not raw:
        return None
    parsed: date | None = None
    for pattern in (
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d",
        "%d-%m-%Y",
    ):
        try:
            parsed = datetime.strptime(raw, pattern).date()
            break
        except ValueError:
            continue
    if parsed is None:
        raise ClinicalSourceError(f"row {row_number} {field} is invalid")
    if parsed > today:
        raise ClinicalSourceError(f"row {row_number} {field} is future")
    return parsed


def _require_unique(
    records: Iterable[PatientRecord],
    *,
    attribute: str,
    label: str,
) -> dict[str, PatientRecord]:
    result: dict[str, PatientRecord] = {}
    for record in records:
        value = getattr(record, attribute)
        if not value:
            raise ClinicalSourceError(f"row {record.source_row} {label} is missing")
        if value in result:
            raise ClinicalSourceError(f"row {record.source_row} duplicate {label}: {value}")
        result[value] = record
    return result


def parse_patients(path: Path, *, today: date | None = None) -> PatientIndex:
    effective_today = today or date.today()
    records: list[PatientRecord] = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        for row_number, row in enumerate(reader, start=2):
            if row.get(None):
                raise ClinicalSourceError(f"row {row_number} has unexpected columns")
            name = _trim(row.get("NAME"))
            if not name:
                raise ClinicalSourceError(f"row {row_number} NAME is missing")
            records.append(
                PatientRecord(
                    source_row=row_number,
                    name=name,
                    ui_id=normalize_identifier(row.get("UI ID")),
                    mrn=normalize_identifier(row.get("MRN NO")),
                    national_id=normalize_identifier(row.get("ID NO")),
                    id_type=_trim(row.get("ID TYPE")),
                    date_of_birth=_parse_date(
                        row.get("DATE OF BIRTH"),
                        row_number=row_number,
                        field="DATE OF BIRTH",
                        today=effective_today,
                    ),
                    gender=_trim(row.get("GENDER")),
                    address=_trim(row.get("ADDRESS")),
                    email=_trim(row.get("EMAIL")),
                    phone=_trim(row.get("PHONE NO")),
                    first_visit_date=_parse_date(
                        row.get("FIRST VISIT DATE"),
                        row_number=row_number,
                        field="FIRST VISIT DATE",
                        today=effective_today,
                    ),
                )
            )

    by_ui_id = _require_unique(records, attribute="ui_id", label="UI ID")
    by_mrn = _require_unique(records, attribute="mrn", label="MRN NO")
    national_counts = Counter(record.national_id for record in records if record.national_id)
    duplicated_national_ids = frozenset(
        national_id for national_id, count in national_counts.items() if count > 1
    )
    unique_by_national_id = {
        record.national_id: record
        for record in records
        if record.national_id and national_counts[record.national_id] == 1
    }
    return PatientIndex(
        records=tuple(records),
        by_ui_id=by_ui_id,
        by_mrn=by_mrn,
        unique_by_national_id=unique_by_national_id,
        duplicated_national_ids=duplicated_national_ids,
    )


def parse_note_fragments(
    path: Path,
    patients: PatientIndex,
    *,
    now: datetime | None = None,
) -> list[ClinicalFragment]:
    effective_now = now or datetime.now(MYT)
    if effective_now.tzinfo is None:
        effective_now = effective_now.replace(tzinfo=MYT)
    else:
        effective_now = effective_now.astimezone(MYT)

    fragments: list[ClinicalFragment] = []
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        for row_number, row in enumerate(reader, start=2):
            if row.get(None):
                raise ClinicalSourceError(f"row {row_number} has unexpected columns")
            patient_ui_id = normalize_identifier(row.get("patient_id"))
            if patient_ui_id not in patients.by_ui_id:
                raise ClinicalSourceError(
                    f"row {row_number} patient UI {patient_ui_id or '<blank>'} not found"
                )
            raw_visit = _trim(row.get("visit_date"))
            try:
                visit_at = datetime.strptime(raw_visit, "%d/%m/%Y %H:%M").replace(tzinfo=MYT)
            except ValueError as error:
                raise ClinicalSourceError(f"row {row_number} visit_date is invalid") from error
            if visit_at > effective_now:
                raise ClinicalSourceError(f"row {row_number} visit_date is future")

            vitals: dict[str, str] = {}
            for field in VITAL_FIELDS:
                raw = _trim(row.get(field))
                if not raw:
                    continue
                try:
                    Decimal(raw)
                except InvalidOperation as error:
                    raise ClinicalSourceError(
                        f"row {row_number} {field} is not numeric"
                    ) from error
                vitals[field] = raw

            fragments.append(
                ClinicalFragment(
                    source_row=row_number,
                    patient_ui_id=patient_ui_id,
                    visit_at=visit_at,
                    doctor_name=_trim(row.get("doctor_name")),
                    text={field: _trim(row.get(field)) for field in TEXT_FIELDS},
                    vitals=vitals,
                )
            )
    return fragments


def reconstruct_encounters(
    fragments: list[ClinicalFragment],
) -> list[ClinicalEncounter]:
    grouped: dict[tuple[str, datetime], list[ClinicalFragment]] = defaultdict(list)
    for fragment in fragments:
        grouped[(fragment.patient_ui_id, fragment.visit_at)].append(fragment)

    encounters: list[ClinicalEncounter] = []
    for (patient_ui_id, visit_at), group in sorted(
        grouped.items(), key=lambda item: (item[0][1], item[0][0])
    ):
        ordered = sorted(group, key=lambda fragment: fragment.source_row)

        def distinct(values: Iterable[str]) -> tuple[str, ...]:
            seen: set[str] = set()
            result: list[str] = []
            for value in values:
                if value and value not in seen:
                    seen.add(value)
                    result.append(value)
            return tuple(result)

        text: dict[str, str] = {}
        for field in TEXT_FIELDS:
            values = distinct(fragment.text.get(field, "") for fragment in ordered)
            if values:
                text[field] = "\n\n".join(values)

        vitals: dict[str, str] = {}
        vital_conflicts: dict[str, tuple[str, ...]] = {}
        for field in VITAL_FIELDS:
            values = distinct(fragment.vitals.get(field, "") for fragment in ordered)
            if len(values) == 1:
                vitals[field] = values[0]
            elif len(values) > 1:
                vital_conflicts[field] = values

        doctor_names = distinct(fragment.doctor_name for fragment in ordered)
        source_rows = tuple(fragment.source_row for fragment in ordered)
        hash_payload = {
            "patient_ui_id": patient_ui_id,
            "visit_at": visit_at.isoformat(),
            "source_rows": source_rows,
            "text": text,
            "vitals": vitals,
            "vital_conflicts": vital_conflicts,
            "doctor_names": doctor_names,
        }
        encounter_hash = hashlib.sha256(
            json.dumps(hash_payload, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            )
        ).hexdigest()
        encounters.append(
            ClinicalEncounter(
                patient_ui_id=patient_ui_id,
                visit_at=visit_at,
                source_rows=source_rows,
                text=text,
                vitals=vitals,
                vital_conflicts=vital_conflicts,
                doctor_names=doctor_names,
                encounter_hash=encounter_hash,
            )
        )
    return encounters


def verify_fragment_provenance(
    fragments: list[ClinicalFragment],
    encounters: list[ClinicalEncounter],
) -> None:
    expected = Counter(fragment.source_row for fragment in fragments)
    actual = Counter(
        source_row
        for encounter in encounters
        for source_row in encounter.source_rows
    )
    duplicated = sorted(
        source_row for source_row, count in actual.items() if count > expected[source_row]
    )
    if duplicated:
        raise ClinicalSourceError(
            f"provenance source rows duplicated: {duplicated}"
        )
    missing = sorted(
        source_row for source_row, count in expected.items() if actual[source_row] < count
    )
    if missing:
        raise ClinicalSourceError(f"provenance source rows missing: {missing}")
    unexpected = sorted(set(actual) - set(expected))
    if unexpected:
        raise ClinicalSourceError(f"provenance source rows unexpected: {unexpected}")
