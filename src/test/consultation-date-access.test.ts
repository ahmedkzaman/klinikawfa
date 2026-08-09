import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const consultationSource = readFileSync(
  'src/pages/clinic/Consultation.tsx',
  'utf8',
);
const queueSource = readFileSync('src/hooks/clinic/useQueueEntries.ts', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');
const layoutSource = readFileSync(
  'src/components/clinic/ClinicLayout.tsx',
  'utf8',
);

describe('consultation date browsing', () => {
  it('exports bounded local-date helpers', () => {
    expect(queueSource).toContain(
      'export function dateRangeForLocalDate(date: string)',
    );
    expect(queueSource).toContain('export function todayInputValue()');
  });

  it('wires the selected date into the consultation feed', () => {
    expect(consultationSource).toContain('aria-label="Consultation date"');
    expect(consultationSource).toContain(
      'useConsultationQueueEntries(selectedDate)',
    );
    expect(consultationSource).toContain(
      'canBrowseConsultationDates(role)',
    );
  });

  it('keeps live consultation carry-over bounded so imported history cannot flood today', () => {
    expect(queueSource).toContain('CONSULTATION_CARRY_OVER_DAYS');
    expect(queueSource).not.toContain(
      '`created_at.gte.${start},clinic_status.in.(${ACTIVE_STATUSES.join(",")})`',
    );
  });

  it('opens the dated list to staff without removing the locum live workflow', () => {
    expect(appSource).toMatch(
      /path="consultation"[\s\S]*?requiredRole="any_staff"/,
    );
    expect(layoutSource).toContain(
      "href: '/clinic/consultation', label: 'Consultation', icon: Stethoscope, locumAllowed: true",
    );
  });
});
