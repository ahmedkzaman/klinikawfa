import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorClinicalActivity } from '@/components/clinic/insight/DoctorClinicalActivity';
import {
  doctorClinicalActivityCsv,
  type DoctorActivitySummary,
} from '@/lib/clinic/doctorClinicalActivity';

const { useDoctorClinicalActivityMock } = vi.hoisted(() => ({
  useDoctorClinicalActivityMock: vi.fn(),
}));

vi.mock('@/hooks/clinic/useDoctorClinicalActivity', () => ({
  useDoctorClinicalActivity: useDoctorClinicalActivityMock,
}));

const summaries: DoctorActivitySummary[] = [
  {
    doctorId: 'doctor-a',
    doctorName: 'Dr A',
    procedures: 2,
    mc: 1,
    quarantine: 0,
    referral: 0,
    totalDocuments: 1,
    rows: [
      {
        activityId: 'procedure-a', activityKind: 'procedure', activityDate: '2026-07-27',
        activityName: 'Dressing', consultationId: 'consultation-a', queueEntryId: 'queue-a',
        queueCreatedAt: '2026-07-27T09:00:00.000Z', queueSequence: 1, doctorId: 'doctor-a',
        doctorName: 'Dr A', patientName: 'Aminah Patient',
      },
      {
        activityId: 'procedure-a2', activityKind: 'procedure', activityDate: '2026-07-26',
        activityName: 'Nebuliser', consultationId: 'consultation-a2', queueEntryId: 'queue-a2',
        queueCreatedAt: '2026-07-26T09:00:00.000Z', queueSequence: 2, doctorId: 'doctor-a',
        doctorName: 'Dr A', patientName: 'Aminah Patient',
      },
      {
        activityId: 'mc-a', activityKind: 'mc', activityDate: '2026-07-25',
        activityName: 'Medical certificate', consultationId: 'consultation-a3', queueEntryId: 'queue-a3',
        queueCreatedAt: '2026-07-25T09:00:00.000Z', queueSequence: 3, doctorId: 'doctor-a',
        doctorName: 'Dr A', patientName: 'Aminah Patient',
      },
    ],
  },
  {
    doctorId: 'doctor-b', doctorName: 'Dr B', procedures: 1, mc: 0, quarantine: 0, referral: 0,
    totalDocuments: 0,
    rows: [{
      activityId: 'procedure-b', activityKind: 'procedure', activityDate: '2026-07-26',
      activityName: 'Wound care', consultationId: 'consultation-b', queueEntryId: 'queue-b',
      queueCreatedAt: '2026-07-26T09:00:00.000Z', queueSequence: 4, doctorId: 'doctor-b',
      doctorName: 'Dr B', patientName: 'Badrul Patient',
    }],
  },
  {
    doctorId: null, doctorName: 'Unassigned', procedures: 0, mc: 0, quarantine: 1, referral: 0,
    totalDocuments: 1,
    rows: [{
      activityId: 'quarantine-c', activityKind: 'quarantine', activityDate: '2026-07-24',
      activityName: 'Quarantine order', consultationId: 'consultation-c', queueEntryId: 'queue-c',
      queueCreatedAt: '2026-07-24T09:00:00.000Z', queueSequence: 5, doctorId: null,
      doctorName: 'Unassigned', patientName: 'Chong Patient',
    }],
  },
];

function renderActivity() {
  return render(
    <DoctorClinicalActivity
      startDate={new Date('2026-07-01T00:00:00.000Z')}
      endDate={new Date('2026-07-31T00:00:00.000Z')}
    />,
  );
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  useDoctorClinicalActivityMock.mockReturnValue({
    data: summaries,
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('DoctorClinicalActivity', () => {
  it('shows loading, error, and empty states without misleading activity data', () => {
    useDoctorClinicalActivityMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    const { rerender } = renderActivity();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(document.querySelectorAll('[class*="animate-pulse"]')).toHaveLength(2);

    useDoctorClinicalActivityMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Report unavailable'),
    });
    rerender(
      <DoctorClinicalActivity
        startDate={new Date('2026-07-01T00:00:00.000Z')}
        endDate={new Date('2026-07-31T00:00:00.000Z')}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load doctor clinical activity: Report unavailable',
    );

    useDoctorClinicalActivityMock.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    rerender(
      <DoctorClinicalActivity
        startDate={new Date('2026-07-01T00:00:00.000Z')}
        endDate={new Date('2026-07-31T00:00:00.000Z')}
      />,
    );
    expect(screen.getByText('No doctor clinical activity in this period.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export all' })).toBeDisabled();
  });

  it('shows each doctor summary without exposing patient names before expansion', () => {
    renderActivity();

    for (const heading of ['Doctor', 'Procedures', 'MC', 'Quarantine', 'Referral', 'Total Documents']) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    }
    const drARow = screen.getByRole('button', { name: 'Dr A' }).closest('tr')!;
    const drBRow = screen.getByRole('button', { name: 'Dr B' }).closest('tr')!;
    const unassignedRow = screen.getByRole('button', { name: 'Unassigned' }).closest('tr')!;
    expect(within(drARow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Dr AExport Dr A', '2', '1', '0', '0', '1']);
    expect(within(drBRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Dr BExport Dr B', '1', '0', '0', '0', '0']);
    expect(within(unassignedRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['UnassignedExport Unassigned', '0', '0', '1', '0', '1']);
    expect(screen.queryByText('Aminah Patient')).not.toBeInTheDocument();
    expect(screen.queryByText('Badrul Patient')).not.toBeInTheDocument();
  });

  it('shows one doctor at a time and filters the expanded rows by activity tab', () => {
    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Dr A' }));
    expect(screen.getAllByText('Aminah Patient')).toHaveLength(2);
    expect(screen.getByText('Dressing')).toBeInTheDocument();
    expect(screen.queryByText('Medical certificate')).not.toBeInTheDocument();
    expect(screen.queryByText('Badrul Patient')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '260727-01' })).toHaveAttribute('href', '/clinic/visits/queue-a');

    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByText('Medical certificate')).toBeInTheDocument();
    expect(screen.queryByText('Dressing')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dr B' }));
    expect(screen.getByText('Badrul Patient')).toBeInTheDocument();
    expect(screen.queryByText('Aminah Patient')).not.toBeInTheDocument();
  });

  it('shows exact dates and a separate human-readable type and name for every document kind', () => {
    useDoctorClinicalActivityMock.mockReturnValue({
      data: [{
        doctorId: 'doctor-detail',
        doctorName: 'Dr Detail',
        procedures: 1,
        mc: 1,
        quarantine: 1,
        referral: 1,
        totalDocuments: 3,
        rows: [
          {
            activityId: 'procedure-detail', activityKind: 'procedure', activityDate: '2026-07-21',
            activityName: 'Wound dressing', consultationId: 'consultation-1', queueEntryId: 'queue-1',
            queueCreatedAt: '2026-07-21T09:00:00.000Z', queueSequence: 1, doctorId: 'doctor-detail',
            doctorName: 'Dr Detail', patientName: 'Procedure Patient',
          },
          {
            activityId: 'mc-detail', activityKind: 'mc', activityDate: '2026-07-22',
            activityName: 'Medical certificate', consultationId: 'consultation-2', queueEntryId: 'queue-2',
            queueCreatedAt: '2026-07-22T09:00:00.000Z', queueSequence: 2, doctorId: 'doctor-detail',
            doctorName: 'Dr Detail', patientName: 'MC Patient',
          },
          {
            activityId: 'quarantine-detail', activityKind: 'quarantine', activityDate: '2026-07-23',
            activityName: 'Home isolation fallback', consultationId: 'consultation-3', queueEntryId: 'queue-3',
            queueCreatedAt: '2026-07-23T09:00:00.000Z', queueSequence: null, doctorId: 'doctor-detail',
            doctorName: 'Dr Detail', patientName: 'Quarantine Patient',
          },
          {
            activityId: 'referral-detail', activityKind: 'referral', activityDate: '2026-07-24',
            activityName: 'Cardiology referral', consultationId: 'consultation-4', queueEntryId: 'queue-4',
            queueCreatedAt: '2026-07-24T09:00:00.000Z', queueSequence: 1, doctorId: 'doctor-detail',
            doctorName: 'Dr Detail', patientName: 'Referral Patient',
          },
        ],
      }],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Dr Detail' }));

    const procedureRow = screen.getByText('Wound dressing').closest('tr')!;
    expect(within(procedureRow).getByText('2026-07-21')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    const mcRow = screen.getByText('Medical certificate').closest('tr')!;
    const quarantineRow = screen.getByText('Home isolation fallback').closest('tr')!;
    const referralRow = screen.getByText('Cardiology referral').closest('tr')!;
    expect(within(mcRow).getByText('2026-07-22')).toBeInTheDocument();
    expect(within(mcRow).getByText('Medical Certificate')).toBeInTheDocument();
    expect(within(quarantineRow).getByText('2026-07-23')).toBeInTheDocument();
    expect(within(quarantineRow).getByText('Quarantine')).toBeInTheDocument();
    expect(within(quarantineRow).getByRole('link', { name: '—' })).toBeInTheDocument();
    expect(within(referralRow).getByText('2026-07-24')).toBeInTheDocument();
    expect(within(referralRow).getByText('Referral')).toBeInTheDocument();
  });

  it('opens the Documents tab by default for a documents-only doctor', () => {
    useDoctorClinicalActivityMock.mockReturnValue({
      data: [summaries[2]],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));

    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Quarantine order')).toBeInTheDocument();
  });

  it('collapses details when the reporting date range changes', () => {
    const { rerender } = renderActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Dr A' }));
    expect(screen.getByText('Dressing')).toBeInTheDocument();

    rerender(
      <DoctorClinicalActivity
        startDate={new Date('2026-08-01T00:00:00.000Z')}
        endDate={new Date('2026-08-31T00:00:00.000Z')}
      />,
    );

    expect(screen.queryByText('Dressing')).not.toBeInTheDocument();
    expect(screen.queryByText('Aminah Patient')).not.toBeInTheDocument();
  });

  it('expands unassigned activity using the shared null doctor key', () => {
    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));

    expect(screen.getByText('Chong Patient')).toBeInTheDocument();
    expect(screen.getByText('Quarantine order')).toBeInTheDocument();
  });

  it('exports all doctors or a selected doctor as separate CSV downloads', async () => {
    const createObjectURL = vi.fn(() => 'blob:doctor-clinical-activity');
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Export all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export Dr A' }));

    const allDoctorsCsv = createObjectURL.mock.calls[0][0] as Blob;
    const drACsv = createObjectURL.mock.calls[1][0] as Blob;
    expect(downloads).toEqual([
      'doctor-clinical-activity-2026-07-01-to-2026-07-31.csv',
      'doctor-clinical-activity-dr-a-2026-07-01-to-2026-07-31.csv',
    ]);
    expect(allDoctorsCsv.size).toBe(
      new TextEncoder().encode(doctorClinicalActivityCsv(summaries)).length + 3,
    );
    await expect(readBlob(allDoctorsCsv)).resolves.toContain('"Dr B"');
    await expect(readBlob(allDoctorsCsv)).resolves.toContain('"Unassigned"');
    await expect(readBlob(drACsv)).resolves.toContain('"Dr A"');
    await expect(readBlob(drACsv)).resolves.not.toContain('"Dr B"');
    click.mockRestore();
  });

  it('uses a stable fallback filename for a doctor name without Latin characters', () => {
    const createObjectURL = vi.fn(() => 'blob:doctor-clinical-activity');
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloads.push(this.download);
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    useDoctorClinicalActivityMock.mockReturnValue({
      data: [{
        ...summaries[0],
        doctorId: 'doctor-non-latin',
        doctorName: '李医生',
        rows: summaries[0].rows.map((row) => ({
          ...row,
          doctorId: 'doctor-non-latin',
          doctorName: '李医生',
        })),
      }],
      isLoading: false,
      isError: false,
      error: null,
    });

    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Export 李医生' }));

    expect(downloads).toEqual(['doctor-clinical-activity-doctor-2026-07-01-to-2026-07-31.csv']);
    click.mockRestore();
  });
});
