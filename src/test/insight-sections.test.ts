import { describe, expect, it } from 'vitest';
import {
  parseInsightSection,
  withInsightSection,
} from '@/lib/clinic/insight/insightSections';

describe('Insight section URL contract', () => {
  it('accepts each supported section from the query string', () => {
    expect(parseInsightSection('?section=performance')).toBe('performance');
    expect(parseInsightSection('?section=planning')).toBe('planning');
  });

  it('defaults invalid and absent sections to Command Centre', () => {
    expect(parseInsightSection('?section=unknown')).toBe('command');
    expect(parseInsightSection('?range=month')).toBe('command');
  });

  it('replaces the section while preserving other search parameters', () => {
    expect(withInsightSection('?range=month&section=finance', 'planning')).toBe(
      '?range=month&section=planning',
    );
  });
});
