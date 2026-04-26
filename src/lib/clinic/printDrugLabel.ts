import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { CLINIC_INFO } from '@/lib/constants';
import type { DrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';

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
};

// Physical thermal-label dimensions in millimetres.
const PAGE_W = 60;
const PAGE_H = 50;
// Inner safe-area margins so the printer's edge tolerance never clips text.
const MARGIN_X = 2;
const SAFE_W = PAGE_W - MARGIN_X * 2;

function buildDosageBits(item: DrugLabelItem): string[] {
  const qtyUnit =
    item.dosage_qty != null && item.dosage_unit
      ? `${item.dosage_qty} ${item.dosage_unit}`
      : (item.dosage ?? null);
  return [item.indication, qtyUnit, item.frequency, item.instruction]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .map((s) => String(s).toUpperCase());
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
): void {
  let y = 3; // mm — top edge tolerance

  // ── Header: clinic name (always) ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`${CLINIC_INFO.name.toUpperCase()}, KOTASAS`, MARGIN_X, y);
  y += 3;

  // ── Address (toggle) ─────────────────────────────────────────────────────
  if (toggles.show_address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const addrLines = doc.splitTextToSize(
      CLINIC_INFO.address.full,
      SAFE_W,
    ) as string[];
    addrLines.slice(0, 2).forEach((line) => {
      doc.text(line, MARGIN_X, y);
      y += 2;
    });
  }

  // ── Tel (toggle) ─────────────────────────────────────────────────────────
  if (toggles.show_tel_number) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text(`Tel: ${CLINIC_INFO.phone}`, MARGIN_X, y);
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

  // ── Instruction (centred, bold) ──────────────────────────────────────────
  const dosageBits = buildDosageBits(item);
  if (dosageBits.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const instr = dosageBits.join(' · ');
    const instrLines = doc.splitTextToSize(instr, SAFE_W) as string[];
    instrLines.slice(0, 2).forEach((line) => {
      const w = doc.getTextWidth(line);
      doc.text(line, (PAGE_W - w) / 2, y);
      y += 2.6;
    });
  }

  // ── Precaution (toggle) ──────────────────────────────────────────────────
  if (toggles.show_precaution && item.precaution?.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5);
    const precLines = doc.splitTextToSize(item.precaution, SAFE_W) as string[];
    doc.text(precLines[0], MARGIN_X, y);
    y += 2;
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
): string {
  const doc = new jsPDF({
    unit: 'mm',
    format: [PAGE_W, PAGE_H],
    orientation: 'landscape',
  });

  const t = toggles ?? DEFAULT_TOGGLES;

  items.forEach((item, idx) => {
    if (idx > 0) doc.addPage([PAGE_W, PAGE_H], 'landscape');
    drawLabel(doc, item, patientName, t);
  });

  return doc.output('bloburl').toString();
}
