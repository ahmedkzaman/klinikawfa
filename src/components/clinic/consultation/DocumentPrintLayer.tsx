import React from 'react';
import { getPaperStyle, type PaperSize, type PaperOrientation } from '@/lib/clinic/paperStyle';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

interface Props {
  doc: ConsultationDocument | null;
}

export function DocumentPrintLayer({ doc }: Props) {
  if (!doc) return null;

  const size = (doc.paper_size as PaperSize) ?? 'A4';
  const orientation = (doc.orientation as PaperOrientation) ?? 'portrait';
  const paperStyle = getPaperStyle(size, orientation);

  const printCss = `
    @page {
      size: ${size} ${orientation};
      margin: 0mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body > *:not(.doc-print-root) {
        display: none !important;
      }
      .doc-print-root {
        display: block !important;
        position: absolute;
        inset: 0;
        background: white;
      }
    }
  `;

  return (
    <>
      <style media="print" dangerouslySetInnerHTML={{ __html: printCss }} />
      <div className="doc-print-root hidden print:block">
        <div
          className="bg-white text-slate-900 print:w-full print:max-w-none print:min-w-full print:h-full print:min-h-full print:shadow-none print:m-0 print:border-0 print:p-[10mm]"
          style={paperStyle}
        >
          <pre className="whitespace-pre-wrap font-sans text-[12pt] leading-relaxed text-slate-900 m-0">
            {doc.content}
          </pre>
        </div>
      </div>
    </>
  );
}
