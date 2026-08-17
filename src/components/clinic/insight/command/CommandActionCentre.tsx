import { Link } from 'react-router-dom';

import type { CommandAction, CommandActionGroup } from '@/lib/clinic/insight/commandCentre';

const GROUPS: CommandActionGroup[] = ['Money', 'Panels', 'Billing', 'Clinical records', 'Inventory'];

function money(value: number | null): string | null {
  if (value === null) return null;
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CommandActionCentre({ actions }: { actions: CommandAction[] }) {
  return (
    <section aria-labelledby="command-actions-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="command-actions-heading" className="text-base font-semibold text-slate-900">Action centre</h2>
      <p className="mt-1 text-xs text-slate-500">Only non-zero issues are shown; open an item to continue in its source workflow.</p>
      {actions.length === 0 ? (
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-5 text-sm text-emerald-800">No critical actions for this period.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {GROUPS.map((group) => {
            const groupActions = actions.filter((action) => action.group === group && action.count > 0);
            if (groupActions.length === 0) return null;
            const groupId = `command-action-${group.replace(/ /g, '-').toLowerCase()}`;
            return (
              <section key={group} aria-labelledby={groupId}>
                <h3 id={groupId} className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
                <div className="mt-2 space-y-2">
                  {groupActions.map((action) => (
                    <Link
                      key={action.key}
                      to={action.href}
                      tabIndex={0}
                      aria-label={`${action.title}, ${action.count}`}
                      className="block rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{action.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {action.count} {action.count === 1 ? 'item' : 'items'}
                            {money(action.amount) ? ` · ${money(action.amount)}` : ''}
                            {action.oldestDate ? ` · oldest ${action.oldestDate}` : ''}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-600">{action.severity}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
