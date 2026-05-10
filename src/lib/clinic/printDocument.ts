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

const DIMS: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

function resolveDims(size: string, orientation: string): { width: number; height: number } {
  const base = DIMS[size] ?? DIMS.A4;
  if (orientation === 'landscape') return { width: base.h, height: base.w };
  return { width: base.w, height: base.h };
}

export function printDocument(doc: ConsultationDocument): void {
  if (typeof document === 'undefined') return;

  const size = (doc.paper_size || 'A4').toUpperCase();
  const orientation = (doc.orientation || 'portrait').toLowerCase();
  const { width, height } = resolveDims(size, orientation);
  const padding = size === 'A6' ? 15 : 25;

  toast("Pro-tip: set Margins to ‘None’ in the print dialog for best fit.", {
    duration: 6000,
  });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.template_name || 'Document')}</title>
<style>
  @page {
    size: ${width}mm ${height}mm;
    margin: 0 !important;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${width}mm;
    height: ${height}mm;
    overflow: hidden;
    background: white;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 100%;
    height: 100%;
    padding: ${padding}mm;
    display: flex;
    flex-direction: column;
  }
  pre {
    font-family: sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
</head>
<body>
  <div class="sheet"><pre>${escapeHtml(doc.content || '')}</pre></div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  let printed = false;
  const cleanup = () => {
    URL.revokeObjectURL(url);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    const cw = iframe.contentWindow;
    try {
      cw?.focus();
      cw?.print();
    } catch (e) {
      console.error('Print failed', e);
    }
    if (cw) cw.onafterprint = cleanup;
    setTimeout(cleanup, 2000);
  };

  iframe.onload = () => setTimeout(triggerPrint, 100);
  iframe.src = url;
  document.body.appendChild(iframe);

  // Safety fallback if onload never fires
  setTimeout(triggerPrint, 1500);
}
