import { memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OverviewTab } from './OverviewTab';
import { LedgerTab } from './LedgerTab';
import { CorrelationTab } from './CorrelationTab';

type AnalysisSection = 'movement' | 'ledger' | 'correlation';

const SECTIONS: Array<{ key: AnalysisSection; label: string }> = [
  { key: 'movement', label: 'Inventory Movement' },
  { key: 'ledger', label: 'Movement Ledger' },
  { key: 'correlation', label: 'Diagnosis Correlation' },
];

interface AnalysisTabProps {
  onOpenLogic?: (section: 'correlation' | 'planning') => void;
}

/**
 * Secondary workspace for the detailed tools: inventory movement, movement
 * ledger, and diagnosis correlation. Each child keeps its own independent
 * error state; the seasonal forecast remains a link out.
 */
export const AnalysisTab = memo(function AnalysisTab({ onOpenLogic }: AnalysisTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('analysis');
  const section: AnalysisSection = SECTIONS.some((s) => s.key === sectionParam)
    ? (sectionParam as AnalysisSection)
    : 'movement';

  const setSection = (next: AnalysisSection) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'movement') params.delete('analysis');
    else params.set('analysis', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Analysis
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <a href="/clinic/forecast">Seasonal Forecast</a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Analysis sections">
          {SECTIONS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={section === s.key ? 'default' : 'outline'}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div role="region" aria-label={`${SECTIONS.find((s) => s.key === section)?.label} analysis`}>
          {section === 'movement' && <OverviewTab />}
          {section === 'ledger' && <LedgerTab />}
          {section === 'correlation' && <CorrelationTab onOpenLogic={onOpenLogic} />}
        </div>
      </CardContent>
    </Card>
  );
});
