import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

const { textCalls, fakePdf } = vi.hoisted(() => {
  const calls: Array<{ text: string | string[]; x: number; y: number }> = [];
  const pdf = {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    addImage: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    text: vi.fn((text: string | string[], x: number, y: number) => {
      calls.push({ text, x, y });
    }),
    addPage: vi.fn(),
    autoPrint: vi.fn(),
    output: vi.fn(() => 'blob:document'),
    internal: {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    },
  };
  return { textCalls: calls, fakePdf: pdf };
});

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => fakePdf),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { printDocument } from '@/lib/clinic/printDocument';

const settings: ClinicSettings = {
  id: 'settings-1',
  clinic_name: 'Klinik Header Test',
  address_line_1: '1 Jalan Letterhead',
  address_line_2: '43000 Kajang',
  phone: '03-1234 5678',
  email: 'hello@example.test',
  logo_url: '',
  logo_height_px: 64,
  letterhead_text_px: 12,
  content_margin_top: 120,
  sst_number: null,
  bank_name: null,
  bank_account_no: null,
  bank_account_holder: null,
  queue_call_by: 'number',
  tv_youtube_id: null,
  tv_ticker_text: null,
  tts_language: 'ms-MY',
  procurement_urgent_days: 7,
  procurement_surge_trend: 20,
  procurement_surge_lift: 1.5,
  procurement_surge_days_cover: 30,
  forecast_top_diagnoses: 5,
  forecast_top_items: 3,
  updated_at: '2026-07-24T00:00:00.000Z',
};

const document: ConsultationDocument = {
  id: 'document-1',
  consultation_id: 'consultation-1',
  patient_id: 'patient-1',
  template_id: 'template-1',
  template_name: 'Referral Letter',
  type: 'referral',
  content: 'DEDICATED DOCUMENT BODY',
  paper_size: 'A4',
  orientation: 'portrait',
  created_by: 'user-1',
  created_at: '2026-07-24T00:00:00.000Z',
};

describe('document PDF letterhead', () => {
  let printWindow: { location: { href: string }; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    textCalls.length = 0;
    vi.clearAllMocks();
    printWindow = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(printWindow as unknown as Window);
  });

  it('prints the clinic-wide document header before the dedicated template body', async () => {
    await printDocument(document, settings);

    const flattened = textCalls.map(({ text }) =>
      Array.isArray(text) ? text.join('\n') : text,
    );
    const headerIndex = flattened.indexOf('Klinik Header Test');
    const bodyIndex = flattened.indexOf('DEDICATED DOCUMENT BODY');

    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(bodyIndex).toBeGreaterThan(headerIndex);
    expect(textCalls[bodyIndex].y).toBeGreaterThan(textCalls[headerIndex].y);
  });

  it('opens the print tab before waiting for the clinic logo', async () => {
    let finishFetch: ((value: { ok: boolean }) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<{ ok: boolean }>((resolve) => {
            finishFetch = resolve;
          }),
      ),
    );

    const printing = printDocument(document, {
      ...settings,
      logo_url: 'https://example.test/logo.png',
    });

    expect(window.open).toHaveBeenCalledTimes(1);

    finishFetch?.({ ok: false });
    await printing;
    expect(printWindow.location.href).toBe('blob:document');
  });
});
