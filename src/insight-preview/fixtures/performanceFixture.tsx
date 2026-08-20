import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock3, FileText, Gauge, ReceiptText, Stethoscope, UsersRound, WalletCards } from 'lucide-react';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';

const formatRM = (value: number | null) => value == null
  ? 'Unavailable'
  : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const clinic = {
  completedVisits: 386,
  uniquePatients: 291,
  rosteredHours: 258,
  patientsPerHour: 1.5,
  visitBilling: 48250,
  revenuePerHour: 187,
  grossProfit: 29100,
  procedures: 86,
  documents: 55,
  selfPayVisits: 268,
  panelVisits: 118,
};

export function ClinicPerformanceOverviewFixture() {
  const selfPayPct = (clinic.selfPayVisits / clinic.completedVisits) * 100;
  const panelPct = (clinic.panelVisits / clinic.completedVisits) * 100;
  const metrics = [
    { label: 'Completed visits', value: String(clinic.completedVisits), icon: Stethoscope },
    { label: 'Unique patients', value: String(clinic.uniquePatients), icon: UsersRound },
    { label: 'Rostered hours', value: `${clinic.rosteredHours.toFixed(1)} h`, icon: Clock3 },
    { label: 'Patients / hour', value: clinic.patientsPerHour.toFixed(2), icon: Gauge },
    { label: 'Visit billing', value: formatRM(clinic.visitBilling), icon: ReceiptText },
    { label: 'Revenue / hour', value: formatRM(clinic.revenuePerHour), icon: WalletCards },
    { label: 'Gross profit', value: formatRM(clinic.grossProfit), icon: WalletCards },
    { label: 'Procedures', value: String(clinic.procedures), icon: Stethoscope },
    { label: 'Documents issued', value: String(clinic.documents), icon: FileText },
    { label: 'Payment mix', value: `${selfPayPct.toFixed(0)}% self-pay · ${panelPct.toFixed(0)}% panel`, icon: ReceiptText },
  ];
  return (
    <Card className={bento}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className={bentoHeader}>Clinic performance</h2><p className="text-xs text-slate-500">Completed clinical activity using Malaysia-local dates and saved charged values.</p></div>
          <Badge variant="outline" className="border-amber-300 text-amber-800">Partial</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-medium text-slate-900"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Data completeness</div>
          <p className="mt-1">4 records missing doctor attribution · 3 items missing cost · 2 voided payments excluded.</p>
          <p className="mt-1 text-xs text-slate-500">Generated 19 Aug 2026, 22:30 · visit completion, document issue, and saved roster sources.</p>
        </div>
      </CardContent>
    </Card>
  );
}
