import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'src/pages/clinic/ConsultationDetail.tsx',
  'utf8',
);

describe('send to dispensary completion-state refresh', () => {
  it('checks freshly fetched queue and consultation statuses before blocking the transition', () => {
    expect(source).toContain('refetch: refetchQueueEntry');
    expect(source).toContain('refetch: refetchConsultation');
    expect(source).toMatch(
      /handleSendToDispensary[\s\S]*Promise\.all\(\[\s*refetchQueueEntry\(\),\s*refetchConsultation\(\),?\s*\]\)[\s\S]*freshConsultation[\s\S]*freshEntry[\s\S]*This consultation is completed and cannot be modified/,
    );
  });
});
