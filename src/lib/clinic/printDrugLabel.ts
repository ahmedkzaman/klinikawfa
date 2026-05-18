import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { DrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';
import { FREQUENCY_LABELS } from './prescribingOptions';

/**
 * Clinic identity printed at the top of every label. Values come from
 * `clinic_settings` (Settings → Clinic Profile) and are passed in by the
 * caller, so the marketing-site `CLINIC_INFO` constant never sneaks onto a
 * physical label.
 */
export interface ClinicLabelInfo {
  name: string;
  addressFull: string;
  phone: string;
}

/**
 * Subset of the consultation-item row that the label needs. Kept loose so
 * the helper doesn't depend on the page component's full row type.
 */
export interface DrugLabelItem {
  item_name: string;
  quantity?: number | null;
  indication?: string | null;
  dosage?: string | null;
  dosage_qty?: number | null;
  dosage_unit?: string | null;
  frequency?: string | null;
  instruction?: string | null;
  duration?: string | null;
  precaution?: string | null;
}

export type LabelToggles = Pick<
  DrugLabelSettings,
  | 'show_address'
  | 'show_tel_number'
  | 'show_precaution'
  | 'show_quantity'
  | 'show_date'
  | 'show_expiry_date'
  | 'show_duration'
  | 'show_indication'
  | 'font_size_clinic'
  | 'font_size_medicine'
  | 'font_size_instruction'
>;

const DEFAULT_TOGGLES: LabelToggles = {
  show_address: true,
  show_tel_number: true,
  show_precaution: true,
  show_quantity: true,
  show_date: true,
  show_expiry_date: true,
  show_duration: true,
  show_indication: true,
  font_size_clinic: 8,
  font_size_medicine: 8,
  font_size_instruction: 6.5,
};

// Physical thermal-label dimensions in millimetres.
const PAGE_W = 60;
const PAGE_H = 50;
// Inner safe-area margins so the printer's edge tolerance never clips text.
const MARGIN_X = 2;
const SAFE_W = PAGE_W - MARGIN_X * 2;

/**
 * Map common medical frequency abbreviations to bilingual (EN/BM) strings
 * via the shared {@link FREQUENCY_LABELS} dictionary. Falls back to the raw
 * text verbatim if it isn't a recognised abbreviation, so free-form tapering
 * doses ("2 tabs today, 1 tab tomorrow") still print exactly as the doctor
 * typed them.
 */
function formatFrequency(rawFreq?: string | null): string {
  if (!rawFreq) return '';
  const key = rawFreq.trim().toUpperCase();
  return FREQUENCY_LABELS[key] ?? rawFreq;
}

/** Bold "core dose" line: e.g. "1 TABLET · TDS". */
function buildDoseLine(item: DrugLabelItem): string {
  const qtyUnit =
    item.dosage_qty != null && item.dosage_unit
      ? `${item.dosage_qty} ${item.dosage_unit}`
      : item.dosage ?? null;
  const freq = formatFrequency(item.frequency);
  return [qtyUnit, freq || null]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .map((s) => String(s).toUpperCase())
    .join(' · ');
}

/** Plain "instructions" line: e.g. "AFTER MEAL - AVOID ALCOHOL". */
function buildInstructionLine(
  item: DrugLabelItem,
  includePrecaution: boolean,
): string {
  const parts = [item.instruction, includePrecaution ? item.precaution : null]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .map((s) => String(s).toUpperCase());
  return parts.join(' - ');
}

/**
 * Draws a single 60×50mm label onto the supplied jsPDF doc. Returns the
 * y-cursor position after drawing (unused but useful for debugging).
 */
function drawLabel(
  doc: jsPDF,
  item: DrugLabelItem,
  patientName: string | null,
  toggles: LabelToggles,
  clinic: ClinicLabelInfo,
): void {
  let y = 3; // mm — top edge tolerance

  // ── Header: clinic name (always) ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text((clinic.name || 'Clinic').toUpperCase(), MARGIN_X, y);
  y += 3;

  // ── Address (toggle) ─────────────────────────────────────────────────────
  if (toggles.show_address && clinic.addressFull) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const addrLines = doc.splitTextToSize(
      clinic.addressFull,
      SAFE_W,
    ) as string[];
    addrLines.slice(0, 2).forEach((line) => {
      doc.text(line, MARGIN_X, y);
      y += 2;
    });
  }

  // ── Tel (toggle) ─────────────────────────────────────────────────────────
  if (toggles.show_tel_number && clinic.phone) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text(`Tel: ${clinic.phone}`, MARGIN_X, y);
    y += 2;
  }

  // ── Hairline divider ─────────────────────────────────────────────────────
  y += 0.4;
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 2.5;

  // ── Patient (always when supplied) ───────────────────────────────────────
  if (patientName?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    const nameLines = doc.splitTextToSize(
      patientName.toUpperCase(),
      SAFE_W,
    ) as string[];
    doc.text(nameLines[0], MARGIN_X, y);
    y += 2.5;
  }

  // ── Medication name (always, bold) ───────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const medLines = doc.splitTextToSize(
    item.item_name.toUpperCase(),
    SAFE_W,
  ) as string[];
  // Cap at 2 lines so footer rows can never be pushed off the label.
  medLines.slice(0, 2).forEach((line) => {
    doc.text(line, MARGIN_X, y);
    y += 3;
  });

  // ── Indication (toggle) ──────────────────────────────────────────────────
  if (toggles.show_indication && item.indication?.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.text(`For: ${item.indication}`, MARGIN_X, y);
    y += 2.4;
  }

  // ── Line 1 — Core dose (bold, larger, centred) ───────────────────────────
  const doseLine = buildDoseLine(item);
  if (doseLine) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const doseLines = doc.splitTextToSize(doseLine, SAFE_W) as string[];
    doseLines.slice(0, 2).forEach((line) => {
      const w = doc.getTextWidth(line);
      doc.text(line, (PAGE_W - w) / 2, y);
      y += 3;
    });
  }

  // ── Line 2 — Instructions + Precaution (smaller, wraps up to 3 lines) ────
  const instrLine = buildInstructionLine(
    item,
    Boolean(toggles.show_precaution),
  );
  if (instrLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const instrLines = doc.splitTextToSize(instrLine, SAFE_W) as string[];
    instrLines.slice(0, 3).forEach((line) => {
      doc.text(line, MARGIN_X, y);
      y += 2.4;
    });
  }

  // ── Duration (toggle) ────────────────────────────────────────────────────
  if (toggles.show_duration && item.duration?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(`Duration: ${item.duration}`, MARGIN_X, y);
    y += 2;
  }

  // ── Footer row (QTY · Date · EXP) ────────────────────────────────────────
  const footerY = PAGE_H - 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);

  if (toggles.show_quantity) {
    doc.text(`QTY: ${item.quantity ?? 1}`, MARGIN_X, footerY);
  }
  if (toggles.show_date) {
    const today = format(new Date(), 'dd/MM/yyyy');
    const w = doc.getTextWidth(today);
    doc.text(today, (PAGE_W - w) / 2, footerY);
  }
  if (toggles.show_expiry_date) {
    // No expiry column on consultation_items yet — placeholder of today + 30d.
    const exp = format(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      'dd/MM/yyyy',
    );
    const text = `EXP: ${exp}`;
    const w = doc.getTextWidth(text);
    doc.text(text, PAGE_W - MARGIN_X - w, footerY);
  }

  // ── Bottom regulatory strip (always) ─────────────────────────────────────
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(4.5);
  const reg = 'Ubat Terkawal / Controlled Medicine';
  const regW = doc.getTextWidth(reg);
  doc.text(reg, (PAGE_W - regW) / 2, PAGE_H - 1.2);
}

/**
 * Build a multi-page PDF where each page is a 60×50mm thermal label, and
 * return a `blob:` URL ready to open in a new tab. Callers should `URL.
 * revokeObjectURL(url)` once the new tab has loaded if memory matters,
 * though for one-off prints it's negligible.
 */
export function generateDrugLabelPdf(
  items: DrugLabelItem[],
  patientName: string | null,
  toggles: LabelToggles | null | undefined,
  clinic: ClinicLabelInfo,
): string {
  const doc = new jsPDF({
    unit: 'mm',
    format: [PAGE_W, PAGE_H],
    orientation: 'landscape',
  });

  const t = toggles ?? DEFAULT_TOGGLES;

  items.forEach((item, idx) => {
    if (idx > 0) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    drawLabel(doc, item, patientName, t, clinic);
  });

  return doc.output('bloburl').toString();
}
