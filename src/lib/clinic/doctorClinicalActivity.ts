export type DoctorActivityKind = 'procedure' | 'mc' | 'quarantine' | 'referral';

export interface DoctorActivityRow {
  activityId: string;
  activityKind: DoctorActivityKind;
  activityDate: string;
  activityName: string;
  consultationId: string;
  queueEntryId: string;
  queueCreatedAt: string;
  queueSequence: number;
  doctorId: string | null;
  doctorName: string;
  patientName: string;
}

export interface DoctorActivitySummary {
  doctorId: string | null;
  doctorName: string;
  procedures: number;
  mc: number;
  quarantine: number;
  referral: number;
  totalDocuments: number;
  rows: DoctorActivityRow[];
}

const unassignedKey = '__unassigned__';

export function aggregateDoctorClinicalActivity(
  rows: DoctorActivityRow[],
): DoctorActivitySummary[] {
  const summaries = new Map<string, DoctorActivitySummary>();

  for (const row of rows) {
    const key = row.doctorId ?? unassignedKey;
    let summary = summaries.get(key);

    if (!summary) {
      summary = {
        doctorId: row.doctorId,
        doctorName: row.doctorName,
        procedures: 0,
        mc: 0,
        quarantine: 0,
        referral: 0,
        totalDocuments: 0,
        rows: [],
      };
      summaries.set(key, summary);
    }

    summary.rows.push(row);
    if (row.activityKind === 'procedure') {
      summary.procedures += 1;
    } else {
      summary[row.activityKind] += 1;
    }
    summary.totalDocuments = summary.mc + summary.quarantine + summary.referral;
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      rows: [...summary.rows].sort((left, right) =>
        right.activityDate.localeCompare(left.activityDate),
      ),
    }))
    .sort((left, right) => {
      if (left.doctorId === null) return 1;
      if (right.doctorId === null) return -1;
      return left.doctorName.localeCompare(right.doctorName);
    });
}

const csvField = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;

export function doctorClinicalActivityCsv(
  summaries: DoctorActivitySummary[],
  doctorId?: string | null,
): string {
  const selectedSummaries = doctorId === undefined
    ? summaries
    : summaries.filter((summary) => summary.doctorId === doctorId);
  const records = selectedSummaries.flatMap((summary) =>
    summary.rows.map((row) => [
      summary.doctorName,
      row.activityDate,
      row.activityKind,
      row.activityName,
      row.patientName,
      row.queueSequence,
    ].map(csvField).join(',')),
  );

  return [
    'Doctor,Date,Activity Type,Activity Name,Patient,Queue Number',
    ...records,
  ].join('\r\n');
}
