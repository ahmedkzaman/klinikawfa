import * as React from 'react';

const KEY_X = 'printer_offset_x';
const KEY_Y = 'printer_offset_y';
const EVT = 'printer-offsets-change';

export interface PrinterOffsets {
  offsetX: number;
  offsetY: number;
}

function safeNum(v: string | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function getPrinterOffsets(): PrinterOffsets {
  if (typeof window === 'undefined') return { offsetX: 0, offsetY: 0 };
  return {
    offsetX: safeNum(localStorage.getItem(KEY_X)),
    offsetY: safeNum(localStorage.getItem(KEY_Y)),
  };
}

export function setPrinterOffsets({ offsetX, offsetY }: PrinterOffsets) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_X, String(offsetX));
  localStorage.setItem(KEY_Y, String(offsetY));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function usePrinterOffsets() {
  const [offsets, setOffsets] = React.useState<PrinterOffsets>(getPrinterOffsets);

  React.useEffect(() => {
    const refresh = () => setOffsets(getPrinterOffsets());
    window.addEventListener(EVT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    offsetX: offsets.offsetX,
    offsetY: offsets.offsetY,
    setOffsets: setPrinterOffsets,
  };
}
