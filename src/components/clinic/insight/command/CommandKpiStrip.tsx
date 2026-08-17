import { Card, CardContent } from '@/components/ui/card';

export type CommandKpi = {
  key: string;
  label: string;
  value: string;
  definition: string;
};

export function CommandKpiStrip({ kpis }: { kpis: CommandKpi[] }) {
  return (
    <section aria-label="Command Centre KPIs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {kpis.map((kpi) => (
        <Card key={kpi.key}>
          <article>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{kpi.definition}</p>
            </CardContent>
          </article>
        </Card>
      ))}
    </section>
  );
}
