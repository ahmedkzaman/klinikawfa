import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import type { ClinicHealthAlert } from '@/lib/clinic/insight/alerts';

export function HealthAlertsList({ alerts }: { alerts: ClinicHealthAlert[] }) {
  const actionableAlerts = alerts.filter((alert) => alert.count > 0);
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-slate-900">What needs attention</h3>
        {actionableAlerts.length === 0 ? <p className="mt-3 text-sm text-emerald-700">No priority issues detected.</p> : (
          <div className="mt-3 space-y-2">
            {actionableAlerts.map((alert) => (
              <Link key={alert.id} to={alert.href} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-800">{alert.title}</span>
                  <span className={`text-[10px] font-bold uppercase ${alert.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'}`}>{alert.severity}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{alert.detail}</p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
