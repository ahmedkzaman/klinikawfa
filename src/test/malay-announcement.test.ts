import { describe, expect, it } from 'vitest';
import { buildMalayAnnouncement } from '@/lib/tv/malayAnnouncement';

describe('buildMalayAnnouncement', () => {
  it('calls a patient by name in natural Malay wording', () => {
    expect(buildMalayAnnouncement({ callBy: 'name', display: 'Siti Aminah', roomLabel: 'Bilik 2' }))
      .toBe('Panggilan untuk Siti Aminah, sila ke Bilik 2 sekarang.');
  });

  it('calls a queue number when the TV is configured for numbers', () => {
    expect(buildMalayAnnouncement({ callBy: 'number', display: 'A-12', roomLabel: 'Kaunter Utama' }))
      .toBe('Nombor giliran A-12, sila ke Kaunter Utama sekarang.');
  });
});
