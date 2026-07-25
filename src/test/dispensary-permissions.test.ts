import { describe, expect, it } from 'vitest';
import { canEditDispensary } from '@/lib/clinic/dispensaryPermissions';

describe('canEditDispensary', () => {
  it.each(['sent_to_dispensary', 'dispensing_payment'])(
    'allows non-locum staff at the %s stage despite a stale consultation lock',
    (clinicStatus) => {
      expect(canEditDispensary(false, clinicStatus, false)).toBe(true);
    },
  );

  it('always blocks locum users', () => {
    expect(canEditDispensary(true, 'sent_to_dispensary', true)).toBe(false);
    expect(canEditDispensary(true, 'dispensing_payment', true)).toBe(false);
  });

  it('honors the consultation lock outside dispensary stages', () => {
    expect(canEditDispensary(false, 'with_doctor', false)).toBe(false);
    expect(canEditDispensary(false, 'with_doctor', true)).toBe(true);
  });
});
