export const INSIGHT_SECTIONS = ['command', 'finance', 'performance', 'planning'] as const;

export type InsightSection = typeof INSIGHT_SECTIONS[number];

export function parseInsightSection(search: string): InsightSection {
  const section = new URLSearchParams(search).get('section');
  return INSIGHT_SECTIONS.includes(section as InsightSection) ? (section as InsightSection) : 'command';
}

export function withInsightSection(search: string, section: InsightSection): string {
  const params = new URLSearchParams(search);
  params.set('section', section);
  return `?${params.toString()}`;
}
