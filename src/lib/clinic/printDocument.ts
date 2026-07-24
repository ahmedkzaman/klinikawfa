import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';

type PdfFormat = 'a4' | 'a5' | 'a6';

const PX_TO_MM = 25.4 / 96;
const PX_TO_PT = 72 / 96;

async function loadImageDataUrl(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = dataUrl;
      },
    );
    if (!dimensions.width || !dimensions.height) return null;
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

async function renderLetterhead(
  pdf: jsPDF,
  settings: ClinicSettings,
  margin: number,
  pageWidth: number,
): Promise<number> {
  const headerTop = margin;
  const baseTextPx = settings.letterhead_text_px ?? 12;
  const baseTextPt = Math.max(6, baseTextPx * PX_TO_PT);
  const nameTextPt = Math.max(8, Math.round(baseTextPx * 1.4) * PX_TO_PT);
  const infoLineHeight = Math.max(3.2, baseTextPt * 0.3528 * 1.3);

  const logo = settings.logo_url
    ? await loadImageDataUrl(settings.logo_url)
    : null;
  const requestedLogoHeight = Math.max(
    0,
    (settings.logo_height_px ?? 64) * PX_TO_MM,
  );
  const maxLogoWidth = (pageWidth - margin * 2) * 0.4;
  let logoHeight = requestedLogoHeight;
  let logoWidth = 0;

  if (logo) {
    logoWidth = (logo.width / logo.height) * logoHeight;
    if (logoWidth > maxLogoWidth) {
      const scale = maxLogoWidth / logoWidth;
      logoWidth *= scale;
      logoHeight *= scale;
    }
    pdf.addImage(
      logo.dataUrl,
      'PNG',
      margin,
      headerTop,
      logoWidth,
      logoHeight,
    );
  }

  const textX = margin + (logoWidth > 0 ? logoWidth + 4 : 0);
  let textY = headerTop + nameTextPt * 0.3528;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(nameTextPt);
  pdf.text(settings.clinic_name || 'Klinik Awfa', textX, textY);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(baseTextPt);
  const infoLines = [
    settings.address_line_1,
    settings.address_line_2,
    settings.phone ? `Tel: ${settings.phone}` : '',
    settings.email,
  ].filter(Boolean) as string[];

  for (const line of infoLines) {
    textY += infoLineHeight;
    pdf.text(line, textX, textY);
  }

  const headerBottom =
    Math.max(textY, headerTop + logoHeight, headerTop + infoLineHeight) + 3;
  pdf.setLineWidth(0.5);
  pdf.line(margin, headerBottom, pageWidth - margin, headerBottom);
  return headerBottom;
}

export async function printDocument(
  doc: ConsultationDocument,
  settings: ClinicSettings,
): Promise<void> {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Pop-up blocked — allow pop-ups to print.');
    return;
  }

  try {
    const sizeRaw = (doc.paper_size || 'A4').toUpperCase();
    const size: PdfFormat = (
      ['A4', 'A5', 'A6'].includes(sizeRaw)
        ? sizeRaw.toLowerCase()
        : 'a4'
    ) as PdfFormat;
    const orientation: 'p' | 'l' =
      doc.orientation === 'landscape' ? 'l' : 'p';

    const pdf = new jsPDF({ orientation, unit: 'mm', format: size });
    const margin = size === 'a6' ? 15 : 25;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const lineHeight = 5;

    const headerBottom = await renderLetterhead(
      pdf,
      settings,
      margin,
      pageWidth,
    );
    const requestedBodyY =
      headerBottom + (settings.content_margin_top ?? 24) * PX_TO_MM;
    let bodyY = Math.min(
      requestedBodyY,
      pageHeight - margin - lineHeight,
    );

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);

    const lines = pdf.splitTextToSize(
      doc.content || '',
      usableWidth,
    ) as string[];

    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const linesAvailable = Math.max(
        1,
        Math.floor((pageHeight - margin - bodyY) / lineHeight),
      );
      const chunk = lines.slice(lineIndex, lineIndex + linesAvailable);
      pdf.text(chunk, margin, bodyY);
      lineIndex += chunk.length;

      if (lineIndex < lines.length) {
        pdf.addPage(size, orientation);
        bodyY = margin + lineHeight;
      }
    }

    pdf.autoPrint();
    const url = pdf.output('bloburl');
    printWindow.location.href = url;
  } catch (error) {
    printWindow.close();
    console.error('Print failed', error);
    toast.error('Failed to generate print preview');
  }
}
