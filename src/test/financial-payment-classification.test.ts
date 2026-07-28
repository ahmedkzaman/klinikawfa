import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { classifyFinancialSegment } from '@/hooks/clinic/useFinancialInsights';

describe('corrected payment classification', () => {
  it.each([
    ['cash', 'Self-Pay'], ['qr_pay', 'Self-Pay'], ['card', 'Self-Pay'],
    ['transfer', 'Self-Pay'], ['panel', 'Panel'],
  ])('classifies corrected %s payments as %s', (method, expected) => {
    expect(classifyFinancialSegment(method)).toBe(expected);
  });
});
