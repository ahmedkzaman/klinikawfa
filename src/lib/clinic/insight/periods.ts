import { differenceInCalendarDays, endOfMonth, format, startOfMonth, startOfQuarter, startOfYear, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

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

export function getInsightQuickRanges(today = new Date()): Array<{ label: string; range: DateRange }> {
  const thisMonth = startOfMonth(today);
  const previousMonth = subDays(thisMonth, 1);
  return [
    { label: 'Today', range: { from: today, to: today } },
    { label: 'This week', range: { from: subDays(today, today.getDay()), to: today } },
    { label: 'This month', range: { from: thisMonth, to: today } },
    { label: 'Last month', range: { from: startOfMonth(previousMonth), to: endOfMonth(previousMonth) } },
    { label: 'This quarter', range: { from: startOfQuarter(today), to: today } },
    { label: 'Year to date', range: { from: startOfYear(today), to: today } },
  ];
}
