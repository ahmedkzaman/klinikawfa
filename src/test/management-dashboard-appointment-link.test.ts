import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('internal appointment check-in linkage', () => {
  it('passes the internal appointment id through walk-in intake and links the queue row', () => {
    const hook = readFileSync('src/hooks/clinic/useIntakeAppointment.ts', 'utf8');
    const dialog = readFileSync('src/components/clinic/CheckInWalkInDialog.tsx', 'utf8');
    const page = readFileSync('src/pages/clinic/Appointments.tsx', 'utf8');
    expect(hook).toContain('clinicAppointmentId?: string');
    expect(hook).toContain("link_clinic_appointment_checkin");
    expect(dialog).toContain('clinicAppointmentId');
    expect(page).toContain('clinicAppointmentId={appt.id}');
  });
});
