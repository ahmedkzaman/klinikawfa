import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { INSIGHT_SECTIONS, type InsightSection } from '@/lib/clinic/insight/insightSections';
import { InsightExportMenu, type InsightExportItem } from './shared/InsightExportMenu';
import { getInsightQuickRanges } from '@/lib/clinic/insight/periods';

const labels: Record<InsightSection, string> = {
  command: 'Command Centre',
  finance: 'Finance',
  performance: 'Performance',
  planning: 'Planning',
};

const InsightExportRegistrationContext = createContext<((id: string, items: InsightExportItem[]) => () => void) | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useInsightExportRegistration(id: string, items: InsightExportItem[]) {
  const register = useContext(InsightExportRegistrationContext);
  useEffect(() => {
    if (!register) return;
    return register(id, items);
  }, [id, items, register]);
  return Boolean(register);
}

type InsightShellProps = {
  section: InsightSection;
  onSectionChange: (section: InsightSection) => void;
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  comparisonEnabled: boolean;
  onComparisonChange: (enabled: boolean) => void;
  onRefresh: () => void;
  exportItems: InsightExportItem[];
  confidence: string;
  children: React.ReactNode;
};

export function InsightShell({
  section,
  onSectionChange,
  range,
  onRangeChange,
  comparisonEnabled,
  onComparisonChange,
  onRefresh,
  exportItems,
  confidence,
  children,
}: InsightShellProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [registeredExports, setRegisteredExports] = useState<Record<string, InsightExportItem[]>>({});
  const registerExports = useCallback((id: string, items: InsightExportItem[]) => {
    setRegisteredExports((current) => ({ ...current, [id]: items }));
    return () => setRegisteredExports((current) => {
      const { [id]: _removed, ...remaining } = current;
      return remaining;
    });
  }, []);
  const menuItems = useMemo(() => [...exportItems, ...Object.values(registeredExports).flat()], [exportItems, registeredExports]);
  const period = range?.from
    ? range.to
      ? `${format(range.from, 'd MMM yyyy')} – ${format(range.to, 'd MMM yyyy')}`
      : format(range.from, 'd MMM yyyy')
    : 'Select a period';

  return (
    <InsightExportRegistrationContext.Provider value={registerExports}>
    <div data-insight-shell className="min-h-full max-w-full overflow-x-hidden bg-slate-50 -m-4 p-4 md:-m-6 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Clinic Insight</h1>
            <p className="text-sm text-slate-500">{period}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" aria-label="Quick date ranges">
              {getInsightQuickRanges().map(({ label, range: quickRange }) => (
                <Button key={label} variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onRangeChange(quickRange)}>{label}</Button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="max-w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{period}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="max-w-[calc(100vw-2rem)] rounded-2xl p-0" align="start">
                <Calendar mode="range" selected={range} onSelect={onRangeChange} numberOfMonths={2} defaultMonth={range?.from} className="max-w-full p-3" />
              </PopoverContent>
            </Popover>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Switch checked={comparisonEnabled} onCheckedChange={onComparisonChange} aria-label="Compare periods" />
              Compare
            </label>
            <Button variant="outline" size="sm" onClick={onRefresh} aria-label="Refresh active section">
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
            <span className="text-xs text-slate-500">Confidence: {confidence}</span>
            <InsightExportMenu items={menuItems} />
          </div>
        </header>

        <div className="rounded-2xl border border-slate-100 bg-white p-1">
          <div role="tablist" aria-label="Clinic Insight sections" className="flex min-w-0 flex-wrap gap-1">
            {INSIGHT_SECTIONS.map((item) => (
              <button
                key={item}
                ref={(element) => { tabRefs.current[INSIGHT_SECTIONS.indexOf(item)] = element; }}
                id={`clinic-insight-tab-${item}`}
                type="button"
                role="tab"
                aria-selected={section === item}
                tabIndex={section === item ? 0 : -1}
                aria-controls={`clinic-insight-panel-${item}`}
                onClick={() => onSectionChange(item)}
                onKeyDown={(event) => {
                  const index = INSIGHT_SECTIONS.indexOf(item);
                  const nextIndex = event.key === 'ArrowRight' ? (index + 1) % INSIGHT_SECTIONS.length
                    : event.key === 'ArrowLeft' ? (index - 1 + INSIGHT_SECTIONS.length) % INSIGHT_SECTIONS.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? INSIGHT_SECTIONS.length - 1 : null;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  onSectionChange(INSIGHT_SECTIONS[nextIndex]);
                  tabRefs.current[nextIndex]?.focus();
                }}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  section === item ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {labels[item]}
              </button>
            ))}
          </div>
        </div>
        <main id={`clinic-insight-panel-${section}`} role="tabpanel" aria-labelledby={`clinic-insight-tab-${section}`} className="min-w-0">{children}</main>
      </div>
    </div>
    </InsightExportRegistrationContext.Provider>
  );
}
