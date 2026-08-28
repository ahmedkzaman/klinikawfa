from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable

from .models import CanonicalInvoice, ClinicalEncounter, PatientIndex


class ReconciliationError(ValueError):
    pass


MONEY_TOKEN = re.compile(
    r"(?<![\w.])-?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?(?![\w.])"
)
FINANCIAL_FIELDS = (
    "corporate",
    "cash_sales",
    "gross",
    "cash",
    "online_transfer",
    "credit_card",
    "e_wallet",
    "cash_collection",
    "outstanding_amount",
    "outstanding_payment",
)
CENTS = Decimal("0.01")


@dataclass(frozen=True)
class IdentityResolution:
    invoice: CanonicalInvoice
    patient_ui_id: str | None
    method: str | None
    reason: str | None


@dataclass(frozen=True)
class ReconciledPair:
    encounter: ClinicalEncounter
    invoice: CanonicalInvoice
    patient_ui_id: str
    billing_delay_minutes: float
    payment_status: str
    remedi_payment: Decimal | None
    effective_payment: Decimal
    status: str


@dataclass(frozen=True)
class QuarantinedInvoice:
    invoice: CanonicalInvoice
    reason: str


@dataclass(frozen=True)
class PaymentOnlyInvoice:
    invoice: CanonicalInvoice
    patient_ui_id: str


@dataclass(frozen=True)
class ReconciliationResult:
    candidate_pairs: tuple[ReconciledPair, ...]
    payment_only_invoices: tuple[PaymentOnlyInvoice, ...]
    quarantined_invoices: tuple[QuarantinedInvoice, ...]
    identity_resolutions: tuple[IdentityResolution, ...]
    mismatched_cardinality_groups: int

    @property
    def auto_paired(self) -> tuple[ReconciledPair, ...]:
        return tuple(pair for pair in self.candidate_pairs if pair.status == "auto_paired")


def resolve_invoice_patient(
    invoice: CanonicalInvoice,
    patients: PatientIndex,
) -> IdentityResolution:
    by_mrn = patients.by_mrn.get(invoice.mrn) if invoice.mrn else None
    by_national_id = (
        patients.unique_by_national_id.get(invoice.national_id)
        if invoice.national_id
        else None
    )

    if by_mrn and by_national_id and by_mrn.ui_id != by_national_id.ui_id:
        return IdentityResolution(
            invoice,
            None,
            None,
            "conflicting_identity_signals",
        )
    if by_mrn:
        return IdentityResolution(invoice, by_mrn.ui_id, "mrn", None)
    if by_national_id:
        return IdentityResolution(
            invoice,
            by_national_id.ui_id,
            "national_id",
            None,
        )
    if invoice.national_id in patients.duplicated_national_ids:
        return IdentityResolution(
            invoice,
            None,
            None,
            "duplicated_national_id",
        )
    return IdentityResolution(invoice, None, None, "unresolved_identity")


def parse_remedi_payment(encounter: ClinicalEncounter) -> Decimal | None:
    raw = encounter.text.get("payment", "")
    values: set[Decimal] = set()
    for token in MONEY_TOKEN.findall(raw):
        try:
            values.add(
                Decimal(token.replace(" ", "").replace(",", "")).quantize(CENTS)
            )
        except InvalidOperation as error:
            raise ReconciliationError("Remedi payment contains invalid money") from error
    return next(iter(values)) if len(values) == 1 else None


def reconcile_encounters_and_invoices(
    patients: PatientIndex,
    encounters: Iterable[ClinicalEncounter],
    invoices: Iterable[CanonicalInvoice],
    *,
    billing_delay_minutes: int = 180,
) -> ReconciliationResult:
    if billing_delay_minutes < 0:
        raise ReconciliationError("billing delay must be non-negative")

    encounter_groups: dict[tuple[str, object], list[ClinicalEncounter]] = defaultdict(list)
    for clinical_encounter in encounters:
        encounter_groups[
            (clinical_encounter.patient_ui_id, clinical_encounter.visit_at.date())
        ].append(clinical_encounter)

    invoice_groups: dict[tuple[str, object], list[CanonicalInvoice]] = defaultdict(list)
    resolutions: list[IdentityResolution] = []
    quarantined: list[QuarantinedInvoice] = []
    payment_only: list[PaymentOnlyInvoice] = []
    for invoice in invoices:
        resolution = resolve_invoice_patient(invoice, patients)
        resolutions.append(resolution)
        if resolution.patient_ui_id is None:
            quarantined.append(
                QuarantinedInvoice(invoice, resolution.reason or "unresolved_identity")
            )
            continue
        invoice_groups[
            (resolution.patient_ui_id, invoice.invoice_at.date())
        ].append(invoice)

    candidate_pairs: list[ReconciledPair] = []
    mismatched_cardinality_groups = 0
    for key in sorted(invoice_groups, key=lambda item: (item[1], item[0])):
        daily_invoices = sorted(
            invoice_groups[key],
            key=lambda invoice: (invoice.invoice_at, invoice.bill_number),
        )
        daily_encounters = sorted(
            encounter_groups.get(key, []),
            key=lambda encounter: (encounter.visit_at, encounter.encounter_hash),
        )
        if not daily_encounters:
            payment_only.extend(
                PaymentOnlyInvoice(invoice, key[0]) for invoice in daily_invoices
            )
            continue
        if len(daily_encounters) != len(daily_invoices):
            mismatched_cardinality_groups += 1
            quarantined.extend(
                QuarantinedInvoice(invoice, "cardinality_mismatch")
                for invoice in daily_invoices
            )
            continue

        patient_ui_id = key[0]
        for clinical_encounter, invoice in zip(
            daily_encounters,
            daily_invoices,
            strict=True,
        ):
            delay = (invoice.invoice_at - clinical_encounter.visit_at).total_seconds() / 60
            remedi_payment = parse_remedi_payment(clinical_encounter)
            if remedi_payment is None:
                payment_status = "not_comparable"
            elif remedi_payment == invoice.gross:
                payment_status = "exact"
            else:
                payment_status = "pdf_wins"
            status = (
                "auto_paired"
                if 0 <= delay <= billing_delay_minutes
                else "quarantined"
            )
            pair = ReconciledPair(
                encounter=clinical_encounter,
                invoice=invoice,
                patient_ui_id=patient_ui_id,
                billing_delay_minutes=delay,
                payment_status=payment_status,
                remedi_payment=remedi_payment,
                effective_payment=invoice.gross,
                status=status,
            )
            candidate_pairs.append(pair)
            if status != "auto_paired":
                quarantined.append(
                    QuarantinedInvoice(invoice, "billing_delay_out_of_window")
                )

    candidate_pairs.sort(
        key=lambda pair: (
            pair.encounter.visit_at,
            pair.patient_ui_id,
            pair.invoice.bill_number,
        )
    )
    quarantined.sort(
        key=lambda item: (item.invoice.invoice_at, item.invoice.bill_number, item.reason)
    )
    payment_only.sort(
        key=lambda item: (item.invoice.invoice_at, item.patient_ui_id, item.invoice.bill_number)
    )
    resolutions.sort(
        key=lambda item: (item.invoice.invoice_at, item.invoice.bill_number)
    )
    return ReconciliationResult(
        candidate_pairs=tuple(candidate_pairs),
        payment_only_invoices=tuple(payment_only),
        quarantined_invoices=tuple(quarantined),
        identity_resolutions=tuple(resolutions),
        mismatched_cardinality_groups=mismatched_cardinality_groups,
    )


def summarize_financials(
    invoices: Iterable[CanonicalInvoice],
) -> dict[str, Decimal | int]:
    invoice_list = list(invoices)
    result: dict[str, Decimal | int] = {"count": len(invoice_list)}
    for index, field in enumerate(FINANCIAL_FIELDS):
        result[field] = sum(
            (invoice.amounts[index] for invoice in invoice_list),
            Decimal("0"),
        ).quantize(CENTS)
    return result


def verify_financial_partition(
    source: Iterable[CanonicalInvoice],
    importable: Iterable[CanonicalInvoice],
    quarantined: Iterable[CanonicalInvoice],
) -> dict[str, dict[str, Decimal | int]]:
    source_list = list(source)
    importable_list = list(importable)
    quarantined_list = list(quarantined)
    source_bills = [invoice.bill_number for invoice in source_list]
    partition_bills = [
        invoice.bill_number for invoice in importable_list + quarantined_list
    ]
    if len(set(source_bills)) != len(source_bills):
        raise ReconciliationError("source canonical invoice numbers are not unique")
    if sorted(source_bills) != sorted(partition_bills):
        raise ReconciliationError("financial partition does not cover source exactly once")

    totals = {
        "source": summarize_financials(source_list),
        "importable": summarize_financials(importable_list),
        "quarantined": summarize_financials(quarantined_list),
    }
    for field in ("count", *FINANCIAL_FIELDS):
        if totals["importable"][field] + totals["quarantined"][field] != totals["source"][field]:
            raise ReconciliationError(f"financial partition mismatch for {field}")
    return totals
