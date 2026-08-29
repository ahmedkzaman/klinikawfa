from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True)
class PatientRecord:
    source_row: int
    name: str
    ui_id: str
    mrn: str
    national_id: str
    id_type: str
    date_of_birth: date | None
    gender: str
    address: str
    email: str
    phone: str
    first_visit_date: date | None


@dataclass(frozen=True)
class PatientIndex:
    records: tuple[PatientRecord, ...]
    by_ui_id: dict[str, PatientRecord]
    by_mrn: dict[str, PatientRecord]
    unique_by_national_id: dict[str, PatientRecord]
    duplicated_national_ids: frozenset[str]


@dataclass(frozen=True)
class ClinicalFragment:
    source_row: int
    patient_ui_id: str
    visit_at: datetime
    doctor_name: str
    text: dict[str, str]
    vitals: dict[str, str]


@dataclass
class ClinicalEncounter:
    patient_ui_id: str
    visit_at: datetime
    source_rows: tuple[int, ...]
    text: dict[str, str] = field(default_factory=dict)
    vitals: dict[str, str] = field(default_factory=dict)
    vital_conflicts: dict[str, tuple[str, ...]] = field(default_factory=dict)
    doctor_names: tuple[str, ...] = ()
    encounter_hash: str = ""


@dataclass(frozen=True)
class SalesRow:
    source_label: str
    source_row: int
    invoice_at: datetime
    bill_number: str
    mrn: str
    national_id: str
    amounts: tuple[Decimal, ...]


@dataclass(frozen=True)
class CanonicalInvoice:
    source_label: str
    source_rows: tuple[int, ...]
    invoice_at: datetime
    bill_number: str
    mrn: str
    national_id: str
    amounts: tuple[Decimal, ...]

    @property
    def corporate(self) -> Decimal:
        return self.amounts[0]

    @property
    def cash_sales(self) -> Decimal:
        return self.amounts[1]

    @property
    def gross(self) -> Decimal:
        return self.amounts[2]

    @property
    def cash_collection(self) -> Decimal:
        return self.amounts[7]

    @property
    def outstanding_amount(self) -> Decimal:
        return self.amounts[8]

    @property
    def outstanding_payment(self) -> Decimal:
        return self.amounts[9]

    @property
    def balance_discrepancy(self) -> Decimal:
        return self.gross - self.corporate - self.cash_sales


@dataclass(frozen=True)
class SalesParseResult:
    pages: int
    rows: tuple[SalesRow, ...]
