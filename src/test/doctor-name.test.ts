import { describe, expect, it } from 'vitest';
import { formatDoctorName, stripDoctorHonorific } from '@/lib/doctorName';

describe('formatDoctorName', () => {
  it('keeps a single Dr. prefix when the name already has one', () => {
    expect(formatDoctorName('Dr. Ahmed bin Kamarulzaman')).toBe('Dr. Ahmed bin Kamarulzaman');
  });

  it('adds the Dr. prefix when missing', () => {
    expect(formatDoctorName('ABDUL HANNAN BIN ABDUL AZIZ')).toBe('Dr. ABDUL HANNAN BIN ABDUL AZIZ');
  });

  it('never duplicates the prefix (handles variant punctuation/casing)', () => {
    expect(formatDoctorName('Dr Ahmed')).toBe('Dr. Ahmed');
    expect(formatDoctorName('DR. Novencia')).toBe('Dr. Novencia');
    expect(formatDoctorName('  dr.  Nur Intan  ')).toBe('Dr. Nur Intan');
  });

  it('returns an empty string for blank input so callers can fall back', () => {
    expect(formatDoctorName('')).toBe('');
    expect(formatDoctorName(null)).toBe('');
    expect(formatDoctorName(undefined)).toBe('');
    expect(formatDoctorName('   ')).toBe('');
  });
});

describe('stripDoctorHonorific', () => {
  it('removes leading honorifics only', () => {
    expect(stripDoctorHonorific('Dr. Aisyah Binti Abas')).toBe('Aisyah Binti Abas');
    expect(stripDoctorHonorific('Akula')).toBe('Akula');
  });
});
