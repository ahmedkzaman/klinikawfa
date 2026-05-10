export type PaperSize = 'A4' | 'A5' | 'A6';
export type PaperOrientation = 'portrait' | 'landscape';

const DIMS: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

export function getPaperStyle(
  size: PaperSize,
  orientation: PaperOrientation,
): React.CSSProperties {
  const base = DIMS[size] ?? DIMS.A4;
  const isLandscape = orientation === 'landscape';
  const w = isLandscape ? base.h : base.w;
  const h = isLandscape ? base.w : base.h;
  return {
    width: '100%',
    maxWidth: `${w}mm`,
    aspectRatio: `${w} / ${h}`,
    padding: size === 'A6' ? '15mm' : '25mm',
  };
}
