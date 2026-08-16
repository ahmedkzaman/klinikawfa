import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(
  join(process.cwd(), 'src/components/clinic/RegisterAndCheckInDialog.tsx'),
  'utf8',
);

const queueBoardSource = readFileSync(
  join(process.cwd(), 'src/pages/clinic/QueueBoard.tsx'),
  'utf8',
);

describe('Register & Add to Queue backdated queue date', () => {
  it('registers queue entries against the queue board selected date', () => {
    expect(dialogSource).toContain('selectedDate?: string');
    expect(dialogSource).toContain('date.getFullYear() === year');
    expect(dialogSource).toContain('getNextQueueSequenceForDate');
    expect(dialogSource).toContain('dateRangeForLocalDateKey');
    expect(dialogSource).toContain(".gte('created_at', start)");
    expect(dialogSource).toContain(".lt('created_at', end)");
    expect(dialogSource).toContain('queuePayload.created_at = queueCreatedAt');
    expect(dialogSource).toContain('Backdated queue date');

    expect(queueBoardSource).toContain('<RegisterAndCheckInDialog');
    expect(queueBoardSource).toContain('selectedDate={effectiveQueueDate}');
  });
});
