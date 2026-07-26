import { differenceInCalendarDays, format, subDays } from 'date-fns';

export interface InsightPeriod {
  startKey: string;
  endKey: string;
  priorStartKey: string;
  priorEndKey: string;
  days: number;
}

export function buildComparisonPeriod(startDate: Date, endDate: Date): InsightPeriod {
  const days = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  const priorEnd = subDays(startDate, 1);
  const priorStart = subDays(priorEnd, days - 1);
  return {
    startKey: format(startDate, 'yyyy-MM-dd'),
    endKey: format(endDate, 'yyyy-MM-dd'),
    priorStartKey: format(priorStart, 'yyyy-MM-dd'),
    priorEndKey: format(priorEnd, 'yyyy-MM-dd'),
    days,
  };
}
