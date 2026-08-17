import type { InsightSection } from '@/lib/clinic/insight/insightSections';

export type InsightQueryFlags = Record<InsightSection, boolean>;
export type InsightQueryOptions = { enabled?: boolean };

export const ALL_INSIGHT_QUERY_ROOTS = [
  ['clinic-health'],
  ['bank-health'],
  ['financial-control'],
  ['clinical-attendance-heatmap'],
  ['panel-billed-insights'],
  ['sales-insights'],
  ['financial-insights'],
  ['insight-performance'],
  ['insight-performance-detail'],
  ['doctor-clinical-activity'],
] as const;

export function insightQueryFlags(section: InsightSection): InsightQueryFlags {
  return {
    command: section === 'command',
    finance: section === 'finance',
    performance: section === 'performance',
    planning: section === 'planning',
  };
}

export function insightQueryKeyPrefixes(section: InsightSection): readonly (readonly string[])[] {
  switch (section) {
    case 'command':
      return [['clinic-health'], ['bank-health'], ['financial-control'], ['clinical-attendance-heatmap']];
    case 'finance':
      return [['financial-control'], ['financial-insights'], ['sales-insights'], ['panel-billed-insights']];
    case 'performance':
      return [
        ['insight-performance'],
        ['insight-performance-detail'],
        ['doctor-clinical-activity'],
      ];
    case 'planning':
      return [['clinical-attendance-heatmap']];
  }
}
