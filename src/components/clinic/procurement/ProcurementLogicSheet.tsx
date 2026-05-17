import { useEffect, useState } from 'react';
import { Activity, Sparkles, TrendingUp, Zap, Snowflake } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export type LogicSection = 'correlation' | 'planning';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultSection?: LogicSection;
}

export function ProcurementLogicSheet({ open, onOpenChange, defaultSection = 'correlation' }: Props) {
  const [tab, setTab] = useState<LogicSection>(defaultSection);

  useEffect(() => {
    if (open) setTab(defaultSection);
  }, [open, defaultSection]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Procurement Intelligence — Logic Guide
          </SheetTitle>
          <SheetDescription>
            Transparent math behind every recommendation. No black-box AI guessing.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LogicSection)} className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="correlation">Correlation Engine</TabsTrigger>
            <TabsTrigger value="planning">Purchase Planning</TabsTrigger>
          </TabsList>

          <TabsContent value="correlation" className="space-y-5 mt-4">
            <Section title="How Diagnosis Correlation Works" icon={<Activity className="h-4 w-4" />}>
              <p>
                The system uses <strong>Association Rule Mining</strong> over the last 90 days of
                clinical activity. Every dispense is joined to the consultation it belongs to, and
                every consultation to its diagnosis group. We then measure how often each item
                co-occurs with each diagnosis.
              </p>
            </Section>

            <Stat label="Confidence" badge="Probability">
              <p>
                Of patients in a given diagnosis group, what % received this item.
              </p>
              <Example>
                If <strong>80 out of 100</strong> Asthma patients receive Salbutamol, confidence is{' '}
                <strong>80%</strong>.
              </Example>
            </Stat>

            <Stat label="Lift Score" badge="True correlation">
              <p>
                Compares item usage <em>within</em> a diagnosis group against its baseline rate{' '}
                across <em>all</em> consultations.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li><strong>Lift = 1.0</strong> — normal / random usage.</li>
                <li><strong>Lift &gt; 1.5</strong> — highly correlated (we flag these).</li>
                <li><strong>Lift &gt; 2.0</strong> — very strong clinical link.</li>
              </ul>
              <Example>
                A Lift of <strong>3.0</strong> means an item is <strong>3× more likely</strong> to
                be dispensed for this diagnosis than for an average visit.
              </Example>
            </Stat>

            <Stat label="Unlinked usage" badge="__UNLINKED__">
              <p>
                Dispenses with no consultation/diagnosis attached — manual adjustments, walk-in
                pharmacy sales, owe-slip fulfillments. Hidden by default to keep the matrix clean;
                toggle <em>"Include unlinked usage"</em> to audit leakage.
              </p>
            </Stat>
          </TabsContent>

          <TabsContent value="planning" className="space-y-5 mt-4">
            <Section title="How Purchase Recommendations are Calculated" icon={<Sparkles className="h-4 w-4" />}>
              <p>
                A strict <strong>deterministic rule engine</strong> evaluates every active item
                against your physical stock and clinical trends. Thresholds are adjustable from
                the gear icon on the Planning tab.
              </p>
            </Section>

            <Stat label="Urgent Reorder" badge="Burn rate" tone="destructive" icon={<Zap className="h-4 w-4" />}>
              <p>
                Triggers when an item is <strong>Fast Moving</strong> AND its days-of-cover drops
                below the <em>Urgent Reorder Buffer</em> (default 7 days).
              </p>
              <Example>
                Use 10 bottles/day, 50 in stock = 5 days cover. Suggested order ≈{' '}
                <strong>(30 × 10) − 50 = 250 bottles</strong> to restore a 30-day buffer.
              </Example>
            </Stat>

            <Stat label="Surge Warning" badge="Clinical signal" tone="amber" icon={<TrendingUp className="h-4 w-4" />}>
              <p>All three conditions must hold:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Diagnosis cases up &gt; <em>Surge Trend %</em> month-over-month.</li>
                <li>Item has Lift &gt; <em>Surge Lift Threshold</em> for that diagnosis.</li>
                <li>Item has less than <em>Surge Days-Cover Limit</em> of stock.</li>
              </ul>
              <Example>
                Asthma cases +35% vs last month, Salbutamol Lift = 2.8, only 18 days cover →
                raise the par level before stockout.
              </Example>
            </Stat>

            <Stat label="Overstock / Dead Stock" badge="Capital saver" tone="muted" icon={<Snowflake className="h-4 w-4" />}>
              <p>
                Items with <strong>0 dispenses in the dead-stock window</strong> (default 90 days)
                but stock still on the shelf. Reordering is frozen and managers are alerted to
                monitor expiry.
              </p>
            </Stat>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
        {icon}
        {title}
      </h3>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function Stat({
  label,
  badge,
  tone,
  icon,
  children,
}: {
  label: string;
  badge: string;
  tone?: 'destructive' | 'amber' | 'muted';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const border =
    tone === 'destructive' ? 'border-destructive/30 bg-destructive/5'
    : tone === 'amber'     ? 'border-amber-500/30 bg-amber-500/5'
    : tone === 'muted'     ? 'border-muted bg-muted/40'
    : 'border-border bg-card';
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold flex items-center gap-2">{icon}{label}</div>
        <Badge variant="secondary" className="text-xs">{badge}</Badge>
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
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
