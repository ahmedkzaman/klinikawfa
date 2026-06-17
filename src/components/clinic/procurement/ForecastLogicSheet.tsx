import { CalendarRange, Activity, Sparkles, Calculator } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ForecastLogicSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            How Seasonal Forecasts are Calculated
          </SheetTitle>
          <SheetDescription>
            Transparent math behind every projection. Three deterministic steps, no guessing.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <Step
            number={1}
            label="Historical Baseline"
            badge="Expected Cases"
            icon={<CalendarRange className="h-4 w-4" />}
          >
            <p>
              The system looks at the <strong>target calendar month</strong> across all previous
              years in your clinic's history, then averages the case counts per diagnosis group.
            </p>
            <Example>
              If there were <strong>40 Dengue cases in Oct 2024</strong> and{' '}
              <strong>60 in Oct 2025</strong>, the Expected Cases for this October is{' '}
              <strong>(40 + 60) ÷ 2 = 50</strong>.
            </Example>
          </Step>

          <Step
            number={2}
            label="Correlation Engine"
            badge="Confidence"
            icon={<Activity className="h-4 w-4" />}
          >
            <p>
              The system cross-references each diagnosis with your clinic's <strong>actual
              dispensing habits over the last 90 days</strong>. The confidence score reflects how
              often patients in that diagnosis group received a given item.
            </p>
            <Example>
              If <strong>80% of Dengue patients received an IV Drip Set</strong> in the last
              90 days, the Confidence for that pairing is <strong>80%</strong>.
            </Example>
          </Step>

          <Step
            number={3}
            label="Projected Need"
            badge="Final Quantity"
            icon={<Calculator className="h-4 w-4" />}
          >
            <p className="font-medium text-foreground">
              Projected Need = Expected Cases × Confidence %
            </p>
            <p>
              The result is rounded up so you never end up short by a single unit on a busy
              clinical day.
            </p>
            <Example>
              <strong>50 Expected Cases × 80% Confidence = 40 IV Drip Sets</strong> needed for
              October.
            </Example>
          </Step>

          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Note:</strong> Forecasts improve as more visit
            history accumulates. A diagnosis group with only one year of data will still produce
            a baseline, but two or more years of history make seasonal patterns far more
            reliable.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({
  number,
  label,
  badge,
  icon,
  children,
}: {
  number: number;
  label: string;
  badge: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold flex items-center gap-2 text-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
            {number}
          </span>
          {icon}
          {label}
        </div>
        <Badge variant="secondary" className="text-xs">{badge}</Badge>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2 pl-8">
        {children}
      </div>
    </div>
  );
}

function Example({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/60 p-2 text-xs text-foreground/80">
      <span className="font-medium text-foreground">Example: </span>
      {children}
    </div>
  );
}
