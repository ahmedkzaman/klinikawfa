import { Link } from 'react-router-dom';

import type { CommandAction, CommandActionSeverity } from '@/lib/clinic/insight/commandCentre';

const GROUPS = ['Money', 'Panels', 'Billing', 'Clinical records', 'Inventory'] as const;

const SEVERITY_STYLES: Record<CommandActionSeverity, string> = {
  critical: 'bg-rose-600 text-white',
  high: 'bg-orange-100 text-orange-800',
  warning: 'bg-amber-100 text-amber-800',
  medium: 'bg-slate-100 text-slate-700',
  low: 'bg-slate-100 text-slate-600',
  info: 'bg-slate-100 text-slate-600',
};

const SEVERITY_RANK: Record<CommandActionSeverity, number> = {
  critical: 0, high: 1, warning: 2, medium: 2, low: 3, info: 4,
};

function money(value: number | null): string | null {
  if (value === null) return null;
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CommandActionCentre({ actions }: { actions: CommandAction[] }) {
  if (actions.length === 0) {
    return (
      <section aria-labelledby="command-actions-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 id="command-actions-heading" className="text-base font-semibold text-slate-900">Action centre</h2>
        <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-5 text-sm text-emerald-800">No critical actions for this period.</p>
      </section>
    );
  }

  // Group by workflow, order groups by their worst severity so urgent
  // categories lead the card, then distribute blocks across two balanced
  // columns so neither side ends with a ragged empty gap.
  const groupBlocks = GROUPS
    .map((group) => ({ group, groupActions: actions.filter((action) => action.group === group && action.count > 0) }))
    .filter((block) => block.groupActions.length > 0)
    .map((block) => ({
      ...block,
      worstSeverity: Math.min(...block.groupActions.map((action) => SEVERITY_RANK[action.severity])),
    }))
    .sort((left, right) => left.worstSeverity - right.worstSeverity);

  const columns: Array<Array<{ group: string; groupActions: CommandAction[] }>> = [[], []];
  const columnTotals = [0, 0];
  for (const block of groupBlocks) {
    const target = columnTotals[0] <= columnTotals[1] ? 0 : 1;
    columns[target].push(block);
    columnTotals[target] += block.groupActions.length;
  }

  const renderBlock = ({ group, groupActions }: { group: string; groupActions: CommandAction[] }) => {
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
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${SEVERITY_STYLES[action.severity]}`}>{action.severity}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    );
  };

  return (
    <section aria-labelledby="command-actions-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="command-actions-heading" className="text-base font-semibold text-slate-900">Action centre</h2>
      <p className="mt-1 text-xs text-slate-500">Only non-zero issues are shown; open an item to continue in its source workflow.</p>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {columns.map((column, index) => (
          <div key={index} className="space-y-4">
            {column.map(renderBlock)}
          </div>
        ))}
      </div>
    </section>
  );
}
