import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { ReceiptData } from '@/components/clinic/billing/ReceiptTemplate';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { formatPaymentMethod } from '@/lib/clinic/paymentMethod';

// Page geometry (mm)
const PAGE = { w: 210, h: 297, margin: 15 } as const;
const CONTENT_W = PAGE.w - PAGE.margin * 2;

/** Fetch an image URL as a data URL, or null on failure (CORS, 404, etc.). */
async function loadImageDataUrl(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = dataUrl;
      },
    );
    if (!dims.width || !dims.height) return null;
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

interface RenderOptions {
  data: ReceiptData;
  settings: ClinicSettings;
}

async function buildReceiptPdf({ data, settings }: RenderOptions): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica', 'normal');

  const shortId = data.paymentId.slice(0, 8).toUpperCase();
  const dt = new Date(data.createdAt);
  const sst = settings.sst_number?.trim() || '';

  let y = PAGE.margin;

  // -------- Header: logo + clinic info (left) / OFFICIAL RECEIPT (right) --------
  const logo = settings.logo_url ? await loadImageDataUrl(settings.logo_url) : null;
  const logoH = logo ? 18 : 0;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;
  const headerTop = y;

  let textX = PAGE.margin;
  if (logo && logoW > 0) {
    pdf.addImage(logo.dataUrl, PAGE.margin, headerTop, logoW, logoH);
    textX = PAGE.margin + logoW + 4;
  }

  // Clinic name + address block
  let ty = headerTop + 4.5;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(settings.clinic_name || 'Klinik Awfa', textX, ty);
  ty += 4.8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const infoLines = [
    settings.address_line_1,
    settings.address_line_2,
    settings.phone ? `Tel: ${settings.phone}` : '',
    settings.email || '',
    sst ? `SST No: ${sst}` : '',
  ].filter(Boolean) as string[];
  infoLines.forEach((line) => {
    pdf.text(line, textX, ty);
    ty += 3.8;
  });

  // Right side: title + meta
  const rightX = PAGE.w - PAGE.margin;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('OFFICIAL RECEIPT', rightX, headerTop + 4.5, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  let ry = headerTop + 10;
  const meta: Array<[string, string]> = [
    ['Receipt No:', shortId],
    ['Date:', format(dt, 'dd MMM yyyy, h:mm a')],
  ];
  if (data.queueLabel) meta.push(['Queue:', data.queueLabel]);
  meta.forEach(([label, value]) => {
    pdf.text(`${label} ${value}`, rightX, ry, { align: 'right' });
    ry += 4;
  });

  y = Math.max(ty, ry, headerTop + logoH) + 3;

  // Divider
  pdf.setLineWidth(0.5);
  pdf.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
  y += 6;

  // -------- Patient block --------
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('RECEIVED FROM:', PAGE.margin, y);
  y += 4.5;
  pdf.setFontSize(10);
  const nameLine =
    data.patientName + (data.patientAge ? `  (Age: ${data.patientAge})` : '');
  pdf.text(nameLine, PAGE.margin, y);
  y += 4.2;
  if (data.patientIc) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`IC/ID: ${data.patientIc}`, PAGE.margin, y);
    y += 4.2;
  }
  y += 3;

  // -------- Items table --------
  // Columns
  const cols = [
    { key: 'no', label: 'No', w: 10, align: 'left' as const },
    { key: 'item', label: 'Item', w: CONTENT_W - 10 - 16 - 30 - 30, align: 'left' as const },
    { key: 'qty', label: 'Qty', w: 16, align: 'right' as const },
    { key: 'unit', label: 'Unit Price (RM)', w: 30, align: 'right' as const },
    { key: 'total', label: 'Total (RM)', w: 30, align: 'right' as const },
  ];
  const colX: number[] = [];
  let cx = PAGE.margin;
  cols.forEach((c) => {
    colX.push(cx);
    cx += c.w;
  });
  const tableRight = cx;
  const cellPadX = 1.5;
  const rowMinH = 6;

  const drawHeader = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    const h = rowMinH;
    pdf.setLineWidth(0.2);
    cols.forEach((c, i) => {
      pdf.rect(colX[i], y, c.w, h);
      const tx =
        c.align === 'right'
          ? colX[i] + c.w - cellPadX
          : colX[i] + cellPadX;
      pdf.text(c.label, tx, y + h / 2 + 1.4, { align: c.align });
    });
    y += h;
  };

  const ensureRoom = (needed: number) => {
    if (y + needed > PAGE.h - PAGE.margin - 30) {
      pdf.addPage();
      y = PAGE.margin;
      drawHeader();
    }
  };

  drawHeader();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  if (data.items.length === 0) {
    ensureRoom(rowMinH);
    cols.forEach((c, i) => pdf.rect(colX[i], y, c.w, rowMinH));
    pdf.setFont('helvetica', 'italic');
    pdf.text('No itemised entries', PAGE.margin + CONTENT_W / 2, y + rowMinH / 2 + 1.4, {
      align: 'center',
    });
    pdf.setFont('helvetica', 'normal');
    y += rowMinH;
  } else {
    data.items.forEach((line, idx) => {
      const itemCol = cols[1];
      const wrapped = pdf.splitTextToSize(
        line.name,
        itemCol.w - cellPadX * 2,
      ) as string[];
      const rowH = Math.max(rowMinH, wrapped.length * 4 + 2);
      ensureRoom(rowH);
      // borders
      cols.forEach((c, i) => pdf.rect(colX[i], y, c.w, rowH));
      // text baselines
      const baseY = y + 4;
      pdf.text(String(idx + 1), colX[0] + cellPadX, baseY);
      pdf.text(wrapped, colX[1] + cellPadX, baseY);
      pdf.text(String(line.quantity), colX[2] + cols[2].w - cellPadX, baseY, {
        align: 'right',
      });
      pdf.text(line.unit_price.toFixed(2), colX[3] + cols[3].w - cellPadX, baseY, {
        align: 'right',
      });
      pdf.text(line.line_total.toFixed(2), colX[4] + cols[4].w - cellPadX, baseY, {
        align: 'right',
      });
      y += rowH;
    });
  }

  // Totals rows (span first 4 cols right-aligned, last col value)
  const totalsLabelX = colX[4] - cellPadX;
  const totalsValueX = tableRight - cellPadX;
  const totalsLabelBoxX = PAGE.margin;
  const totalsLabelBoxW = colX[4] - PAGE.margin;
  const totalsValueBoxW = cols[4].w;

  const drawTotalsRow = (label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) => {
    ensureRoom(rowMinH);
    pdf.rect(totalsLabelBoxX, y, totalsLabelBoxW, rowMinH);
    pdf.rect(colX[4], y, totalsValueBoxW, rowMinH);
    pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    if (opts?.color) pdf.setTextColor(...opts.color);
    pdf.text(label, totalsLabelX, y + rowMinH / 2 + 1.4, { align: 'right' });
    pdf.text(value, totalsValueX, y + rowMinH / 2 + 1.4, { align: 'right' });
    if (opts?.color) pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    y += rowMinH;
  };

  if (data.items.length > 0) {
    drawTotalsRow('Subtotal (RM)', data.subtotal.toFixed(2));
  }
  drawTotalsRow('Invoice Total (RM)', data.invoiceTotal.toFixed(2), { bold: true });
  drawTotalsRow('THIS RECEIPT AMOUNT (RM)', data.amountPaid.toFixed(2), { bold: true });
  if (data.balanceRemaining > 0) {
    drawTotalsRow('Balance Remaining (RM)', data.balanceRemaining.toFixed(2), {
      bold: true,
      color: [176, 32, 32],
    });
  }

  y += 6;

  // -------- Payment box --------
  ensureRoom(16);
  const payBoxH = 14;
  pdf.rect(PAGE.margin, y, CONTENT_W, payBoxH);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Paid via:', PAGE.margin + 2, y + 5);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    formatPaymentMethod(data.paymentMethod, data.amountPaid),
    PAGE.margin + 20,
    y + 5,
  );
  pdf.setFont('helvetica', 'bold');
  pdf.text('Amount Received:', PAGE.margin + 2, y + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`RM ${data.amountPaid.toFixed(2)}`, PAGE.margin + 34, y + 10);
  y += payBoxH + 18;

  // -------- Signature lines --------
  ensureRoom(20);
  const sigW = (CONTENT_W - 20) / 2;
  pdf.setLineWidth(0.3);
  pdf.line(PAGE.margin, y, PAGE.margin + sigW, y);
  pdf.line(PAGE.w - PAGE.margin - sigW, y, PAGE.w - PAGE.margin, y);
  pdf.setFontSize(8);
  pdf.text('Received By', PAGE.margin, y + 4);
  pdf.text(
    'Authorized Signature & Clinic Stamp',
    PAGE.w - PAGE.margin - sigW,
    y + 4,
  );
  y += 12;

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(
    `Generated on ${format(new Date(), 'dd MMM yyyy, HH:mm')} — Thank you for your visit.`,
    PAGE.w / 2,
    PAGE.h - PAGE.margin + 5,
    { align: 'center' },
  );
  pdf.setTextColor(0, 0, 0);

  return pdf;
}

export async function downloadReceiptPdf(
  data: ReceiptData,
  settings: ClinicSettings,
): Promise<void> {
  try {
    const pdf = await buildReceiptPdf({ data, settings });
    const shortId = data.paymentId.slice(0, 8).toUpperCase();
    pdf.save(`Receipt-${shortId}.pdf`);
  } catch (e) {
    console.error('Receipt PDF download failed', e);
    toast.error('Failed to generate PDF');
  }
}

export async function printReceipt(
  data: ReceiptData,
  settings: ClinicSettings,
): Promise<void> {
  try {
    const pdf = await buildReceiptPdf({ data, settings });
    pdf.autoPrint();
    const url = pdf.output('bloburl');
    const win = window.open(url, '_blank');
    if (!win) {
      toast.error('Pop-up blocked — allow pop-ups to print.');
    }
  } catch (e) {
    console.error('Receipt print failed', e);
    toast.error('Failed to generate print preview');
  }
}
