import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

type PdfFormat = 'a4' | 'a5' | 'a6';

export function printDocument(doc: ConsultationDocument): void {
  const sizeRaw = (doc.paper_size || 'A4').toUpperCase();
  const size: PdfFormat = (['A4', 'A5', 'A6'].includes(sizeRaw) ? sizeRaw.toLowerCase() : 'a4') as PdfFormat;
  const orientation: 'p' | 'l' = doc.orientation === 'landscape' ? 'l' : 'p';

  const pdf = new jsPDF({ orientation, unit: 'mm', format: size });

  pdf.setFont('helvetica');
  pdf.setFontSize(11);

  const margin = size === 'a6' ? 15 : 25;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const lineHeight = 5; // mm at 11pt

  const lines = pdf.splitTextToSize(doc.content || '', usableWidth) as string[];
  const linesPerPage = Math.max(1, Math.floor(usableHeight / lineHeight));

  for (let i = 0; i < lines.length; i += linesPerPage) {
    if (i > 0) pdf.addPage(size, orientation);
    const chunk = lines.slice(i, i + linesPerPage);
    pdf.text(chunk, margin, margin + lineHeight);
  }

  try {
    pdf.autoPrint();
    const url = pdf.output('bloburl');
    const win = window.open(url, '_blank');
    if (!win) {
      toast.error('Pop-up blocked — allow pop-ups to print.');
    }
  } catch (e) {
    console.error('Print failed', e);
    toast.error('Failed to generate print preview');
  }
}
