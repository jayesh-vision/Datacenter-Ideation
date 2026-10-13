/* Figures shared by the wizard and the plan page: the order-by / need-by bars of the long-lead items and the cash-flow bars. */
import { Chip } from '../../../ui/kit';
import type { CashflowYear, ScheduleItem } from '../../../planner/lib/engine';
import { clockMs } from '../../../planner/compat/clock';
import { date, money } from '../common';

export function ScheduleGantt({ items, target }: { items: ScheduleItem[]; target: string }) {
  const rows = items.filter(i => i.kind === 'equipment' || i.late).sort((a, b) => a.orderBy.localeCompare(b.orderBy));
  if (!rows.length) return <p className="vw-label">Nothing to order for this plan.</p>;
  const now = clockMs();
  const t0 = Math.min(now, ...rows.map(r => new Date(r.orderBy).getTime()));
  const t1 = Math.max(new Date(target).getTime(), ...rows.map(r => new Date(r.needBy).getTime()));
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - t0) / Math.max(1, t1 - t0)) * 100))}%`;
  return (
    <div className="pn-gantt">
      <div className="pn-g-row vw-label" style={{ fontSize: 11.5 }}><span>Item · order by → need by</span><span className="row" style={{ justifyContent: 'space-between' }}><span>{date(new Date(t0).toISOString())}</span><span>{date(new Date(t1).toISOString())}</span></span><span style={{ textAlign: 'right' }}>Lead time</span></div>
      {rows.map((r, i) => { const a = new Date(r.orderBy).getTime(), b = new Date(r.needBy).getTime(); return (
        <div key={i} className="pn-g-row" title={`${r.item}: order by ${date(r.orderBy)}, needed ${date(r.needBy)} (${r.phase})${r.note ? ` · ${r.note}` : ''}`}>
          <span>{r.late && <Chip tone="error" size="xs">Late</Chip>} {r.item}<small className="vw-label"> · {r.phase}</small></span>
          <span className="pn-g-track"><i className={r.late ? 'late' : r.source === 'stock' || r.source === 'site' ? 'stock' : ''} style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})` }} /><em className="today" style={{ left: x(now) }} /><em style={{ left: x(new Date(target).getTime()) }} /></span>
          <b>{r.leadWeeks} wk{r.bufferWeeks ? ` +${r.bufferWeeks}` : ''}</b>
        </div>); })}
      <div className="row wrap vw-label" style={{ gap: 12, fontSize: 11.5, marginTop: 4 }}><span><i style={{ display: 'inline-block', width: 10, height: 8, background: 'var(--primaryColor400)', borderRadius: 2, marginRight: 4 }} />to buy</span><span><i style={{ display: 'inline-block', width: 10, height: 8, background: 'var(--vw-color-emerald-400)', borderRadius: 2, marginRight: 4 }} />from stock or site</span><span><i style={{ display: 'inline-block', width: 10, height: 8, background: 'var(--vw-color-red-400)', borderRadius: 2, marginRight: 4 }} />late: the order date has passed</span><span>| today · | go-live</span></div>
    </div>
  );
}

export function CashflowBars({ years }: { years: CashflowYear[] }) {
  const rows = years.slice(0, 11);
  const max = Math.max(1, ...rows.map(y => Math.abs(y.net)));
  return (
    <div className="pn-cash">{rows.map(y => <div key={y.year} title={`${y.label}: CapEx ${money(y.capex)}, OpEx ${money(y.opex)}, revenue ${money(y.revenue)}${y.benefit ? `, benefit ${money(y.benefit)}` : ''} → net ${money(y.net)}, cumulative ${money(y.cumulative)}`}><i className={y.net >= 0 ? 'up' : 'down'} style={{ height: `${(Math.abs(y.net) / max) * 50}%` }} /><small>{y.label.replace(/^Year\s*/i, 'Y')}</small></div>)}</div>
  );
}
