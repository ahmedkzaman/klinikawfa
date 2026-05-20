import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { DrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';
import { FREQUENCY_LABELS } from './prescribingOptions';

/**
 * Clinic identity printed at the top of every label. Values come from
 * `clinic_settings` (Settings → Clinic Profile).
 */
export interface ClinicLabelInfo {
  name: string;
  addressFull: string;
  phone: string;
}

export interface DrugLabelItem {
  item_name: string;
  quantity?: number | null;
  /** Dispensing unit pulled from `inventory_items.unit` (e.g. "Btl", "Tab"). */
  unit?: string | null;
  indication?: string | null;
  dosage?: string | null;
  dosage_qty?: number | null;
  dosage_unit?: string | null;
  frequency?: string | null;
  instruction?: string | null;
  duration?: string | null;
  precaution?: string | null;
  age_gender?: string | null;
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
const MARGIN_X = 2;
const SAFE_W = PAGE_W - MARGIN_X * 2;

/** pt → mm line-height heuristic so dynamic font sizes never overlap. */
const lh = (pt: number) => pt * 0.42;

function formatFrequency(rawFreq?: string | null): string {
  if (!rawFreq) return '';
  const key = rawFreq.trim().toUpperCase();
  return FREQUENCY_LABELS[key] ?? rawFreq;
}

function buildDosageLine(item: DrugLabelItem): string {
  const qtyUnit =
    item.dosage_qty != null && item.dosage_unit
      ? `${item.dosage_qty} ${item.dosage_unit}`
      : item.dosage ?? null;
  return (qtyUnit ?? '').toString().trim().toUpperCase();
}

/** Draw text centred within the page width. */
function drawCentered(doc: jsPDF, text: string, y: number) {
  const w = doc.getTextWidth(text);
  doc.text(text, (PAGE_W - w) / 2, y);
}

/** Draw text right-aligned within `SAFE_W` (offset by MARGIN_X). */
function drawRight(doc: jsPDF, text: string, y: number) {
  const w = doc.getTextWidth(text);
  doc.text(text, PAGE_W - MARGIN_X - w, y);
}

/**
 * Draws a single 60×50mm label that mirrors the on-screen `LabelPreview`
 * component in Settings → Drug Label. Layout order:
 *   1. Centered header (clinic, tel, address)
 *   2. Divider
 *   3. Medicine name (left) + QTY/EXP (right column, stacked)
 *   4. Centered body — dosage, bilingual frequency, indication, precaution
 *   5. Footer divider
 *   6. Patient block (bottom-left) + Date (bottom-right)
 */
function drawLabel(
  doc: jsPDF,
  item: DrugLabelItem,
  patientName: string | null,
  toggles: LabelToggles,
  clinic: ClinicLabelInfo,
): void {
  const fsClinic = toggles.font_size_clinic ?? 8;
  const fsMed = toggles.font_size_medicine ?? 8;
  const fsInstr = toggles.font_size_instruction ?? 6.5;

  let y = 3;

  // ── 1. Header (centered) ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fsClinic);
  drawCentered(doc, (clinic.name || 'Clinic').toUpperCase(), y);
  y += lh(fsClinic);

  if (toggles.show_tel_number && clinic.phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    drawCentered(doc, `Tel: ${clinic.phone}`, y);
    y += 2;
  }

  if (toggles.show_address && clinic.addressFull) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const addrLines = doc.splitTextToSize(clinic.addressFull, SAFE_W) as string[];
    addrLines.slice(0, 2).forEach((line) => {
      drawCentered(doc, line, y);
      y += 2;
    });
  }

  // ── 2. Divider ───────────────────────────────────────────────────────────
  y += 0.6;
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  y += 2.6;

  // ── 3. Medicine name (left) + QTY / EXP (right) ──────────────────────────
  const unitLabel = (item.unit ?? '').trim();
  const qtyText =
    toggles.show_quantity && item.quantity != null
      ? `QTY: ${item.quantity}${unitLabel ? ' ' + unitLabel : ''}`
      : '';
  const expText = toggles.show_expiry_date
    ? `EXP: ${format(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'MM/yyyy',
      )}`
    : '';

  // Right column width — measure both strings at 5pt.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  const rightW = Math.max(
    qtyText ? doc.getTextWidth(qtyText) : 0,
    expText ? doc.getTextWidth(expText) : 0,
  );
  const leftW = SAFE_W - rightW - (rightW > 0 ? 2 : 0);

  // Medicine name (left, bold). Wrap to all required lines first, then cap
  // the drawn count at 2 — but use the *drawn* count for height math so the
  // following content is pushed down honestly.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fsMed);
  const allMedLines = doc.splitTextToSize(
    item.item_name.toUpperCase(),
    leftW,
  ) as string[];
  const medLines = allMedLines.slice(0, 2);

  // Honest line-height for the bold medicine block, proportional to the
  // typography scale from drug_label_settings.
  const medLineH = fsMed * 0.5;
  const medTop = y;
  medLines.forEach((line, i) => {
    doc.text(line, MARGIN_X, medTop + medLineH * (i + 1) - medLineH * 0.2);
  });
  const medBlockH = medLineH * medLines.length;

  // QTY/EXP (right column, stacked, top-aligned with med name)
  if (qtyText || expText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    let ry = medTop + 1.6;
    if (qtyText) {
      drawRight(doc, qtyText, ry);
      ry += 2;
    }
    if (expText) {
      drawRight(doc, expText, ry);
    }
  }

  y = medTop + Math.max(medBlockH, 4.4) + 1;

  // ── 4. Centered body ─────────────────────────────────────────────────────
  const dosageLine = buildDosageLine(item);
  const freqLine = formatFrequency(item.frequency);

  // Combine dosage + a short freq summary on a single bold line when both
  // exist & freq is a recognised short abbreviation (e.g. "1 TABLET, 3X DAILY").
  // Otherwise render them on separate lines for clarity.
  if (dosageLine) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fsInstr);
    drawCentered(doc, dosageLine, y);
    y += lh(fsInstr) + 0.4;
  }

  if (freqLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fsInstr);
    const freqLines = (doc.splitTextToSize(
      freqLine.toUpperCase(),
      SAFE_W,
    ) as string[]).slice(0, 2);
    freqLines.forEach((line) => {
      drawCentered(doc, line, y);
      y += lh(fsInstr);
    });
  }

  if (toggles.show_indication && item.indication?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    drawCentered(doc, `For: ${item.indication}`, y);
    y += 2.2;
  }

  if (toggles.show_precaution && item.precaution?.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5);
    const precLines = (doc.splitTextToSize(
      item.precaution.toUpperCase(),
      SAFE_W,
    ) as string[]).slice(0, 2);
    precLines.forEach((line) => {
      drawCentered(doc, line, y);
      y += 2.2;
    });
  }

  // ── 5. Footer divider + 6. Patient (left) + Date (right) ─────────────────
  // Reserve room for up to 3 lines on the left.
  const footerLines: string[] = [];
  if (patientName?.trim()) footerLines.push(patientName.trim());
  if (item.age_gender?.trim()) footerLines.push(item.age_gender.trim());
  if (toggles.show_duration && item.duration?.trim()) {
    footerLines.push(`Duration: ${item.duration}`);
  }

  const footerBlockH = Math.max(footerLines.length, 1) * 2.4;
  const dividerY = PAGE_H - footerBlockH - 2.2;
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, dividerY, PAGE_W - MARGIN_X, dividerY);

  let fy = dividerY + 2.4;

  // Patient name (first line, bold)
  footerLines.forEach((line, i) => {
    if (i === 0 && patientName?.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
    }
    doc.text(line, MARGIN_X, fy);
    fy += 2.4;
  });

  // Date (bottom-right, aligned with the first footer line)
  if (toggles.show_date) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    drawRight(doc, `Date: ${format(new Date(), 'd/M/yyyy')}`, dividerY + 2.4);
  }
}

/**
 * Build a multi-page PDF where each page is a 60×50mm thermal label, and
 * return a `blob:` URL ready to open in a new tab.
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
