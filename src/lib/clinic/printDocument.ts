import { toast } from 'sonner';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DIMS: Record<string, { w: string; h: string }> = {
  A4: { w: '210mm', h: '297mm' },
  A5: { w: '148mm', h: '210mm' },
  A6: { w: '105mm', h: '148mm' },
};

function resolveDims(size: string, orientation: string): { width: string; height: string } {
  const base = DIMS[size] ?? DIMS.A4;
  if (orientation === 'landscape') return { width: base.h, height: base.w };
  return { width: base.w, height: base.h };
}

export function printDocument(doc: ConsultationDocument): void {
  if (typeof document === 'undefined') return;

  const size = (doc.paper_size || 'A4').toUpperCase();
  const orientation = (doc.orientation || 'portrait').toLowerCase();
  const { width, height } = resolveDims(size, orientation);
  const padding = size === 'A6' ? '15mm' : '25mm';

  toast("Pro-tip: set Margins to ‘None’ in the print dialog for best fit.", {
    duration: 6000,
  });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.template_name || 'Document')}</title>
<style>
  @page {
    size: ${width} ${height};
    margin: 0 !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${width};
    height: ${height};
    background: #fff;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: ${width};
    height: ${height};
    padding: ${padding};
    box-sizing: border-box;
    overflow: hidden;
  }
  pre {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 12pt;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  }
</style>
</head>
<body>
  <div class="sheet"><pre>${escapeHtml(doc.content || '')}</pre></div>
</body>
</html>`;

  const cw = iframe.contentWindow;
  const cd = iframe.contentDocument || cw?.document;
  if (!cw || !cd) {
    iframe.remove();
    return;
  }

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      cw.focus();
      cw.print();
    } catch (e) {
      console.error('Print failed', e);
    }
    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    if (cw) {
      cw.onafterprint = cleanup;
    }
    setTimeout(cleanup, 1500);
  };

  iframe.onload = () => setTimeout(triggerPrint, 50);

  cd.open();
  cd.write(html);
  cd.close();

  setTimeout(triggerPrint, 300);
}
