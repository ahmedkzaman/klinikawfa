import type { CSSProperties, ReactNode } from 'react';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { cn } from '@/lib/utils';

interface LetterheadProps {
  settings: ClinicSettings;
}

export function ConsultationDocumentLetterhead({ settings }: LetterheadProps) {
  const baseTextPx = settings.letterhead_text_px ?? 12;

  return (
    <div className="flex items-start gap-3 border-b-2 border-slate-900 pb-4">
      {settings.logo_url ? (
        <img
          src={settings.logo_url}
          alt={settings.clinic_name || 'Clinic logo'}
          style={{ height: `${settings.logo_height_px ?? 64}px` }}
          className="w-auto max-w-[40%] object-contain"
          crossOrigin="anonymous"
        />
      ) : null}
      <div
        className="min-w-0 text-slate-900"
        style={{ fontSize: `${baseTextPx}px`, lineHeight: 1.3 }}
      >
        <div
          className="font-bold"
          style={{ fontSize: `${Math.round(baseTextPx * 1.4)}px` }}
        >
          {settings.clinic_name || 'Klinik Awfa'}
        </div>
        {settings.address_line_1 && <div>{settings.address_line_1}</div>}
        {settings.address_line_2 && <div>{settings.address_line_2}</div>}
        {settings.phone && <div>Tel: {settings.phone}</div>}
        {settings.email && <div>{settings.email}</div>}
      </div>
    </div>
  );
}

interface PageProps {
  settings: ClinicSettings;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}

export function ConsultationDocumentPage({
  settings,
  children,
  style,
  className,
  testId,
}: PageProps) {
  return (
    <div
      data-testid={testId}
      className={cn('bg-white text-slate-900', className)}
      style={style}
    >
      <ConsultationDocumentLetterhead settings={settings} />
      <div style={{ paddingTop: `${settings.content_margin_top ?? 24}px` }}>
        {children}
      </div>
    </div>
  );
}
