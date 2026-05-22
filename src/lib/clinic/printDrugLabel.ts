import jsPDF from 'jspdf';
import { format } from 'date-fns';
import type { DrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';
import { getPrinterOffsets } from '@/hooks/clinic/usePrinterSettings';
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
const BASE_START_Y = 2;


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

/** Draw text centred within the page width (or an explicit centre). */
function drawCentered(doc: jsPDF, text: string, y: number, centerX = PAGE_W / 2) {
  const w = doc.getTextWidth(text);
  doc.text(text, centerX - w / 2, y);
}

/** Draw text right-aligned against an explicit anchor. */
function drawRight(doc: jsPDF, text: string, y: number, rightAnchor: number) {
  const w = doc.getTextWidth(text);
  doc.text(text, rightAnchor - w, y);
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

  const { offsetX, offsetY } = getPrinterOffsets();
  const BASE_MARGIN_L = 1;
  const BASE_MARGIN_R = 3; // thicker right buffer for hardware dead zone
  const MARGIN_X = Math.max(0, BASE_MARGIN_L + offsetX);
  const RIGHT_ANCHOR = Math.min(PAGE_W - 1, PAGE_W - BASE_MARGIN_R + offsetX);
  const SAFE_W = RIGHT_ANCHOR - MARGIN_X;
  const CENTER_X = MARGIN_X + SAFE_W / 2;

  let y = BASE_START_Y + offsetY;


  // ── 1. Header (centered) ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fsClinic);
  drawCentered(doc, (clinic.name || 'Clinic').toUpperCase(), y, CENTER_X);
  y += lh(fsClinic);

  if (toggles.show_tel_number && clinic.phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    drawCentered(doc, `Tel: ${clinic.phone}`, y, CENTER_X);
    y += 2;
  }

  if (toggles.show_address && clinic.addressFull) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const addrLines = doc.splitTextToSize(clinic.addressFull, SAFE_W) as string[];
    addrLines.slice(0, 2).forEach((line) => {
      drawCentered(doc, line, y, CENTER_X);
      y += 2;
    });
  }

  // ── 2. Divider ───────────────────────────────────────────────────────────
  y += 0.6;
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, y, RIGHT_ANCHOR, y);
  y += 2.6;

  // ── 3. Patient block (NAME left bold, DATE right) ────────────────────────
  const dateText = toggles.show_date ? `Date: ${format(new Date(), 'd/M/yyyy')}` : '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  const dateW = dateText ? doc.getTextWidth(dateText) : 0;

  const safePatientName = (patientName || 'WALK-IN').toUpperCase();
  {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    let name = safePatientName;
    const nameMax = SAFE_W - (dateW > 0 ? dateW + 2 : 0);
    while (name && doc.getTextWidth(name) > nameMax && name.length > 3) {
      name = name.slice(0, -2) + '…';
    }
    if (name) doc.text(name, MARGIN_X, y);
    if (dateText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      drawRight(doc, dateText, y, RIGHT_ANCHOR);
    }
    y += 1.6;

    // Second divider beneath patient row
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X, y, RIGHT_ANCHOR, y);
    y += 2.6;
  }


  // ── Pre-compute footer geometry (now only duration + age/gender). ────────
  const footerLines: string[] = [];
  if (item.age_gender?.trim()) footerLines.push(item.age_gender.trim());
  if (toggles.show_duration && item.duration?.trim()) {
    footerLines.push(`Duration: ${item.duration}`);
  }
  const footerBlockH = footerLines.length * 2.4;
  const dividerY = PAGE_H - footerBlockH - (footerLines.length ? 2.2 : 1.2);
  const bodyBottom = dividerY - 0.6;
  const fits = (blockH: number) => y + blockH <= bodyBottom;

  // ── 4. Medicine name (left) + QTY / EXP (right) ──────────────────────────
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  const rightW = Math.max(
    qtyText ? doc.getTextWidth(qtyText) : 0,
    expText ? doc.getTextWidth(expText) : 0,
  );
  const leftW = SAFE_W - rightW - (rightW > 0 ? 2 : 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fsMed);
  const allMedLines = doc.splitTextToSize(
    item.item_name.toUpperCase(),
    leftW,
  ) as string[];
  const medLineH = fsMed * 0.5;
  const dosageReserve = lh(fsInstr) + 0.4;
  let medLines = allMedLines.slice(0, 2);
  if (
    medLines.length === 2 &&
    y + medLineH * 2 + 1.2 + dosageReserve > bodyBottom
  ) {
    medLines = allMedLines.slice(0, 1);
  }

  const medTop = y;
  medLines.forEach((line, i) => {
    doc.text(line, MARGIN_X, medTop + medLineH * (i + 1) - medLineH * 0.2);
  });
  const medBlockH = medLineH * medLines.length;

  if (qtyText || expText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    let ry = medTop + 1.6;
    if (qtyText) {
      drawRight(doc, qtyText, ry, MARGIN_X);
      ry += 2;
    }
    if (expText) {
      drawRight(doc, expText, ry, MARGIN_X);
    }
  }


  y = medTop + Math.max(medBlockH, 4.4) + 1.2;

  // ── 5. Centered body ─────────────────────────────────────────────────────
  const dosageLine = buildDosageLine(item);
  const freqLine = formatFrequency(item.frequency);

  if (dosageLine) {
    let dosagePt = fsInstr;
    while (!fits(lh(dosagePt) + 0.4) && dosagePt > fsInstr - 1.5) {
      dosagePt -= 0.5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(dosagePt);
    drawCentered(doc, dosageLine, y);
    y += lh(dosagePt) + 0.4;
  }

  if (freqLine) {
    let freqPt = fsInstr;
    while (!fits(lh(freqPt)) && freqPt > fsInstr - 1.5) freqPt -= 0.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(freqPt);
    let freqLines = (doc.splitTextToSize(
      freqLine.toUpperCase(),
      SAFE_W,
    ) as string[]).slice(0, 2);
    if (!fits(lh(freqPt) * freqLines.length)) {
      freqLines = freqLines.slice(0, 1);
    }
    if (fits(lh(freqPt) * freqLines.length)) {
      freqLines.forEach((line) => {
        drawCentered(doc, line, y);
        y += lh(freqPt);
      });
    }
  }

  if (toggles.show_indication && item.indication?.trim()) {
    let indPt = 5;
    while (!fits(2.2) && indPt > 4) indPt -= 0.5;
    if (fits(2.2)) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(indPt);
      let text = `For: ${item.indication}`;
      while (doc.getTextWidth(text) > SAFE_W && text.length > 6) {
        text = text.slice(0, -2) + '…';
      }
      drawCentered(doc, text, y);
      y += 2.2;
    }
  }

  if (toggles.show_precaution && item.precaution?.trim()) {
    let prePt = 5;
    while (!fits(2.2) && prePt > 4) prePt -= 0.5;
    if (fits(2.2)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(prePt);
      let precLines = (doc.splitTextToSize(
        item.precaution.toUpperCase(),
        SAFE_W,
      ) as string[]).slice(0, 2);
      if (!fits(2.2 * precLines.length)) precLines = precLines.slice(0, 1);
      if (fits(2.2 * precLines.length)) {
        precLines.forEach((line) => {
          drawCentered(doc, line, y);
          y += 2.2;
        });
      }
    }
  }

  // ── 6. Footer: divider + (age/gender, duration) only ─────────────────────
  if (footerLines.length > 0) {
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X, dividerY, PAGE_W - MARGIN_X, dividerY);

    let fy = dividerY + 2.4;
    footerLines.forEach((line) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.text(line, MARGIN_X, fy);
      fy += 2.4;
    });
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
