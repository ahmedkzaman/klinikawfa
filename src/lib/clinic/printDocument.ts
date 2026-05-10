import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printDocument(doc: ConsultationDocument): void {
  if (typeof document === 'undefined') return;

  const size = (doc.paper_size || 'A4').toUpperCase();
  const orientation = (doc.orientation || 'portrait').toLowerCase();
  const padding = size === 'A6' ? '15mm' : '25mm';

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
  @page { size: ${size} ${orientation}; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { padding: ${padding}; box-sizing: border-box; }
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

  // Fallback in case onload doesn't fire (some browsers)
  setTimeout(triggerPrint, 300);
}
