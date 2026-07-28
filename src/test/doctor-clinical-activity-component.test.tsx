import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DoctorClinicalActivity } from '@/components/clinic/insight/DoctorClinicalActivity';
import type { DoctorActivitySummary } from '@/lib/clinic/doctorClinicalActivity';

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
    expect(screen.getByText('Failed to load doctor clinical activity: Report unavailable')).toBeInTheDocument();

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
    expect(screen.getByRole('link', { name: '260727-01' })).toHaveAttribute('href', '/clinic/visit/queue-a');

    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByText('Medical certificate')).toBeInTheDocument();
    expect(screen.queryByText('Dressing')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dr B' }));
    expect(screen.getByText('Badrul Patient')).toBeInTheDocument();
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
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    renderActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Export all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export Dr A' }));

    const allDoctorsCsv = createObjectURL.mock.calls[0][0] as Blob;
    const drACsv = createObjectURL.mock.calls[1][0] as Blob;
    await expect(readBlob(allDoctorsCsv)).resolves.toContain('"Dr B"');
    await expect(readBlob(allDoctorsCsv)).resolves.toContain('"Unassigned"');
    await expect(readBlob(drACsv)).resolves.toContain('"Dr A"');
    await expect(readBlob(drACsv)).resolves.not.toContain('"Dr B"');
    click.mockRestore();
  });
});
