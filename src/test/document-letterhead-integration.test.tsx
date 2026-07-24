import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueDocumentModal } from '@/components/clinic/consultation/IssueDocumentModal';
import type { ClinicSettings } from '@/hooks/clinic/useClinicSettings';
import type { DocumentTemplate } from '@/hooks/clinic/useClinicDocuments';

const clinicSettings: ClinicSettings = {
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

const template: DocumentTemplate = {
  id: 'template-1',
  name: 'Referral Letter',
  type: 'referral',
  content: 'DEDICATED DOCUMENT BODY',
  paper_size: 'A4',
  orientation: 'portrait',
  is_active: true,
  created_at: '2026-07-24T00:00:00.000Z',
  updated_at: '2026-07-24T00:00:00.000Z',
};

const { mutateAsync } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock('@/hooks/clinic/useClinicSettings', () => ({
  useClinicSettings: () => ({
    settings: clinicSettings,
    isLoading: false,
    update: {},
    uploadLogo: {},
  }),
}));

vi.mock('@/hooks/clinic/useCurrentDoctor', () => ({
  useCurrentDoctor: () => ({ data: { name: 'Dr Test' } }),
}));

vi.mock('@/hooks/clinic/useClinicDocuments', () => ({
    useAddConsultationDocument: () => ({
      mutateAsync,
      isPending: false,
    }),
    useUpdateConsultationDocument: () => ({
      mutateAsync,
      isPending: false,
    }),
}));

describe('consultation document letterhead integration', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  it('renders the clinic-wide document header before the dedicated template body', async () => {
    render(
      <IssueDocumentModal
        isOpen
        onClose={() => undefined}
        template={template}
        existingDoc={null}
        patient={{
          id: 'patient-1',
          name: 'Patient Test',
          national_id: '900101-01-1234',
        }}
        consultationId="consultation-1"
      />,
    );

    const preview = await screen.findByTestId('consultation-document-preview');
    await waitFor(() => {
      expect(within(preview).getByText('DEDICATED DOCUMENT BODY')).toBeInTheDocument();
    });

    const header = within(preview).getByText('Klinik Header Test');
    const body = within(preview).getByText('DEDICATED DOCUMENT BODY');

    expect(
      header.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
