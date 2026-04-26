/**
 * Bento design tokens — single source of truth for the clinic UI.
 *
 * Lifted from `ConsultationDetail.tsx` so every page in /clinic/* feels
 * cohesive: slate-50 canvas, white rounded-2xl cards with whisper shadows,
 * uppercase section headers, soft slate-50 inputs, blue-600 primary actions.
 *
 * Compose with `cn(...)` to extend.
 */

/** White rounded-2xl card with whisper shadow, no border. */
export const bento =
  'bg-white border-none rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.03)]';

/** Section header — uppercase, bold, slate-800 with wide letter-spacing. */
export const bentoHeader =
  'text-sm font-bold text-slate-800 uppercase tracking-wider mb-3';

/** Field label — smaller uppercase slate-500. */
export const fieldLabel =
  'text-xs font-semibold text-slate-500 uppercase tracking-wide';

/** Soft input: slate-50 fill, transparent border, blue focus ring. */
export const softInput =
  'bg-slate-50 border-transparent focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 rounded-lg';

/** Page outer surface — slate-50 canvas, expands beyond layout padding. */
export const pageShell = 'min-h-full bg-slate-50 -m-4 md:-m-6 p-4 md:p-6';

/** Inner content wrapper — capped width, vertical rhythm. */
export const pageInner = 'max-w-[1600px] mx-auto space-y-4';

/** Primary action — solid blue-600 with rounded-xl. */
export const primaryBtn =
  'rounded-xl bg-blue-600 hover:bg-blue-700 text-white';

/** Secondary action — slate-50 surface, slate text, soft hover. */
export const secondaryBtn =
  'rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 border-none';

/** Soft pill badge — neutral slate. */
export const softBadge =
  'rounded-full bg-slate-50 text-slate-600 border-none';

/** Inset tile (totals strip, list rows) — slate-50 bg, rounded-xl. */
export const softTile = 'rounded-xl bg-slate-50 px-4 py-3';

/** Pill tab (idle). Active: append `bg-blue-600 text-white`. */
export const pillTabIdle =
  'rounded-full px-3 py-1 text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors';
export const pillTabActive =
  'rounded-full px-3 py-1 text-xs font-medium bg-blue-600 text-white transition-colors';

/** Sticky bottom action bar — frosted, ringed. */
export const stickyActionBar =
  'sticky bottom-4 z-10 bg-white/90 backdrop-blur-md border border-slate-100 rounded-2xl shadow-lg p-4';

/** Recharts chrome — pass into <Tooltip contentStyle>, etc. */
export const chartGridStroke = '#e2e8f0';      // slate-200
export const chartAxisStroke = '#94a3b8';      // slate-400
export const chartTickFill = '#64748b';        // slate-500
export const chartTooltipStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  fontSize: '12px',
  boxShadow: '0 4px 20px rgb(0,0,0,0.06)',
} as const;

/** Brand chart palette (kept stable across all clinic surfaces). */
export const chartColors = {
  emerald: '#10b981',
  emeraldDark: '#059669',
  blue: '#2563eb',
  slate: '#94a3b8',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
} as const;
