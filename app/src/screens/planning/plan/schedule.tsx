/* Schedule tab (redesigned 14-Oct-2026, user: "the schedule is not intuitive"). Both apps showed one flat list of 70–100 items; here the
   plan reads phase by phase: a strip of what needs attention (late, order in the next 90 days, ordered, longest lead), a board with one
   collapsible group per phase (gates are milestones on the phase line, items sorted by order date, every bar says "order in N weeks" or
   "N weeks late"), filters for late / due in 90 days / ordered, a click on a row highlights its bar and its line in the items table, and
   the purchase orders come from Delivery once the plan is handed over. A "Timeline" view shows the same items on the plan pack's
   lead-time drawing. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { Chip, Panel, Seg } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { StatTile } from '../../../ui/Analytics';
import type * as T from '../../../planner/p2b/types';
import { datedPhases, withDeliveryOrders, type Evaluation, type ScheduleItem } from '../../../planner/lib/engine';
import { clockMs } from '../../../planner/compat/clock';
import { useDelivery } from '../../../planner/lib/usePlanner';
import { LeadTimes, Legend } from '../pack/drawings';
import { date } from '../common';
import { TileStrip } from './figures';
import type { TabProps } from './tabs';

const WEEK = 7 * 864e5, DAY = 864e5;
const C = {
  ink: 'var(--vw-color-slate-900)', slate: 'var(--vw-color-slate-500)', slateLight: 'var(--vw-color-slate-300)', slateDark: 'var(--vw-color-slate-700)', grid: 'var(--vw-color-slate-200)',
  surface: 'var(--vw-color-white)', blue: 'var(--vw-color-blue-500)', blueLight: 'var(--vw-color-blue-200)', violet: 'var(--vw-color-violet-500)',
  emerald: 'var(--vw-color-emerald-500)', amber: 'var(--vw-color-amber-500)', amberLight: 'var(--vw-color-amber-300)', red: 'var(--vw-color-red-500)',
};

/** The plan's schedule with Delivery's purchase orders laid over it (once the plan is in Delivery). */
export function useSchedule(plan: T.PlannerPlan | undefined, ev: Evaluation | undefined): ScheduleItem[] {
  const d = useDelivery(plan?.plnId);
  return useMemo(() => (ev && plan ? (d?.purchaseOrders.length ? withDeliveryOrders(ev.schedule, d.purchaseOrders, plan.phases.map(p => p.name)) : ev.schedule) : []), [ev, plan, d]);
}

/* ---- what each line needs from the reader */
type StKey = 'late' | 'soon' | 'later' | 'ordered' | 'delivered' | 'stock' | 'granted' | 'gate';
interface St { key: StKey; label: string; tone: 'error' | 'warning' | 'info' | 'neutral' | 'success' | 'purple'; bar: string; text: string }
const weeksTo = (iso: string, now: number) => Math.round((new Date(iso).getTime() - now) / WEEK);
const permitOf = (it: ScheduleItem, permits: T.PlannerPermit[]) => (it.kind === 'permit' ? permits.find(p => it.item.endsWith(p.name)) : undefined);
function statusOf(it: ScheduleItem, now: number, permits: T.PlannerPermit[]): St {
  if (it.kind === 'gate' && it.leadWeeks > 0) {
    const w = weeksTo(it.orderBy, now);
    if (it.late) { const n = Math.max(1, -w); return { key: 'late', label: `${n} wk late`, tone: 'error', bar: C.red, text: `${n} wk late to start` }; }
    // a family gate that records its own progress in the note (consent: Not sent / Sent / Consented)
    if (it.note && /^(consented|accepted|agreed|done|complete)/i.test(it.note)) return { key: 'delivered', label: it.note.split(/[,;]/)[0], tone: 'success', bar: C.slateLight, text: it.note.split(/[,;]/)[0].toLowerCase() };
    if (it.note && /^(sent|notified|requested|in progress)/i.test(it.note)) return { key: 'ordered', label: it.note.split(/[,;]/)[0], tone: 'info', bar: C.slateLight, text: it.note.split(/[,;]/)[0].toLowerCase() };
    if (weeksTo(it.needBy, now) < 0) return { key: 'ordered', label: 'Done', tone: 'success', bar: C.slateLight, text: 'done' };
    return w <= 13 ? { key: 'soon', label: w <= 0 ? 'Start now' : `Start in ${w} wk`, tone: 'warning', bar: C.violet, text: w <= 0 ? 'start now' : `start in ${w} wk` } : { key: 'later', label: `Start in ${w} wk`, tone: 'neutral', bar: C.violet, text: `start in ${w} wk` };
  }
  if (it.kind === 'gate') { const w = weeksTo(it.needBy, now); return { key: 'gate', label: w < 0 ? 'Passed' : 'Milestone', tone: 'purple', bar: C.violet, text: w < 0 ? 'passed' : w === 0 ? 'this week' : `in ${w} wk` }; }
  const w = weeksTo(it.orderBy, now);
  if (it.late) {
    if (it.orders?.length && it.status === 'late' && !it.orders.every(o => o.state === 'Draft')) return { key: 'late', label: 'Delivery late', tone: 'error', bar: C.red, text: 'arrives after the need date' };
    const n = Math.max(1, -w);
    return { key: 'late', label: `${n} wk late`, tone: 'error', bar: C.red, text: `${n} wk late to ${it.kind === 'permit' ? 'apply' : 'order'}` };
  }
  if (it.kind === 'permit') {
    const p = permitOf(it, permits);
    if (p?.status === 'Approved') return { key: 'granted', label: 'Granted', tone: 'success', bar: C.amberLight, text: 'granted' };
    if (p && p.status !== 'Not started') return { key: 'ordered', label: p.status, tone: 'info', bar: C.amber, text: p.status.toLowerCase() };
    return w <= 13 ? { key: 'soon', label: w <= 0 ? 'Apply now' : `Apply in ${w} wk`, tone: 'warning', bar: C.amber, text: w <= 0 ? 'apply now' : `apply in ${w} wk` } : { key: 'later', label: `Apply in ${w} wk`, tone: 'neutral', bar: C.amber, text: `apply in ${w} wk` };
  }
  if (it.source === 'stock') return { key: 'stock', label: 'From stock', tone: 'success', bar: C.emerald, text: `transfer in ${Math.max(0, w)} wk` };
  if (it.status === 'ordered') {
    const all = it.orders ?? [];
    if (all.length && all.every(o => o.state === 'Delivered')) return { key: 'delivered', label: 'Delivered', tone: 'success', bar: C.slateLight, text: 'delivered' };
    return { key: 'ordered', label: all.some(o => o.state === 'In transit') ? 'In transit' : 'Ordered', tone: 'info', bar: C.slateLight, text: it.poId ? `ordered · ${it.poId}` : 'ordered' };
  }
  if (w <= 13) return { key: 'soon', label: w <= 0 ? 'Order now' : `Order in ${w} wk`, tone: 'warning', bar: C.blue, text: w <= 0 ? 'order now' : `order in ${w} wk` };
  return { key: 'later', label: `Order in ${w} wk`, tone: 'neutral', bar: C.blue, text: `order in ${w} wk` };
}
const short = (t: string, n = 38) => { const x = t.replace(/^Permit · /, ''); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
const SOURCE_TEXT: Record<NonNullable<ScheduleItem['source']>, string> = { stock: 'from stock', site: 'from the site', procure: 'to buy', mixed: 'stock and buy' };

type Filter = 'all' | 'late' | 'soon' | 'ordered';
/** `grp` = the dated phase the line belongs to, or its own group (consents, exit…); `ms` = a gate with no lead time, drawn as a diamond. */
type Row = ScheduleItem & { id: string; st: St; grp: string; ms: boolean };
export interface SchedGroup { key: string; name: string; goLive?: string; phase?: T.PlannerPhase }

export function ScheduleTab({ plan, ev }: TabProps) {
  const items = useSchedule(plan, ev);
  const d = useDelivery(plan.plnId);
  const now = clockMs();
  const phases = useMemo(() => datedPhases(plan), [plan]);
  const [phaseId, setPhaseId] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'board' | 'timeline'>('board');
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo<Row[]>(() => items.map((it, i) => ({ ...it, id: `${i}-${it.kind}-${it.phaseId ?? ''}-${it.item}`, st: statusOf(it, now, plan.permits), grp: phases.some(p => p.id === it.phaseId) ? it.phaseId! : `x:${it.phase}`, ms: it.kind === 'gate' && !(it.leadWeeks > 0) })), [items, now, plan.permits, phases]);
  const groupsAll = useMemo<SchedGroup[]>(() => {
    const extra = [...new Set(rows.filter(r => r.grp.startsWith('x:')).map(r => r.grp))].map(k => ({ key: k, name: k.slice(2), first: Math.min(...rows.filter(r => r.grp === k).map(r => new Date(r.orderBy).getTime())) })).sort((a, b) => a.first - b.first);
    return [...phases.map(p => ({ key: p.id, name: p.name, goLive: p.goLive, phase: p })), ...extra.map(x => ({ key: x.key, name: x.name }))];
  }, [rows, phases]);
  const inPhase = useMemo(() => (phaseId === 'all' ? rows : rows.filter(r => r.grp === phaseId)), [rows, phaseId]);
  const work = inPhase.filter(r => !r.ms);
  const pass = (r: Row, f: Filter) => f === 'all' || (f === 'late' ? r.st.key === 'late' : f === 'soon' ? r.st.key === 'soon' : r.st.key === 'ordered' || r.st.key === 'delivered' || r.st.key === 'granted');
  const count = (f: Filter) => work.filter(r => pass(r, f)).length;
  const shown = inPhase.filter(r => (filter === 'all' ? true : !r.ms && pass(r, filter)));
  // tiles (the whole plan, whatever the filters)
  const equipment = rows.filter(r => r.kind === 'equipment');
  const late = rows.filter(r => r.st.key === 'late');
  const soon = rows.filter(r => r.st.key === 'soon').sort((a, b) => a.orderBy.localeCompare(b.orderBy));
  const toBuy = equipment.filter(r => r.source !== 'stock' && r.source !== 'site');
  const ordered = toBuy.filter(r => r.st.key === 'ordered' || r.st.key === 'delivered');
  const longest = equipment.reduce<Row | undefined>((a, r) => (!a || r.leadWeeks + (r.bufferWeeks ?? 0) > a.leadWeeks + (a.bufferWeeks ?? 0) ? r : a), undefined);
  const contingency = ev.params.contingencyPct?.value;
  const inDelivery = !!d;
  const pick = (f: Filter) => { setFilter(cur => (cur === f ? 'all' : f)); };
  const selRow = rows.find(r => r.id === sel);
  const goLive = phaseId === 'all' ? plan.targetGoLive : phases.find(p => p.id === phaseId)?.goLive ?? plan.targetGoLive;

  const cols: Col<Row>[] = useMemo(() => [
    { key: 'item', header: 'Item', wrap: true, render: r => <span className="cell-2 pn-sched-item"><span style={{ color: r.st.key === 'late' ? 'var(--vw-color-red-600)' : undefined, fontWeight: r.kind === 'gate' ? 500 : undefined }}>{r.item}</span>{r.note && <small>{r.note}</small>}</span> },
    { key: 'phase', header: 'Phase', wrap: true, render: r => <span className="pn-sched-ph">{r.phase}</span> },
    { key: 'kind', header: 'Kind', hideBelow: 1400, render: r => <Chip tone={r.kind === 'gate' ? 'purple' : r.kind === 'permit' ? 'orange' : 'info'} size="xs">{r.kind === 'equipment' ? 'equipment' : r.kind}</Chip> },
    { key: 'src', header: 'Source', hideBelow: 1600, render: r => (r.source ? <Chip tone={r.source === 'stock' || r.source === 'site' ? 'success' : r.source === 'mixed' ? 'cyan' : 'neutral'} size="xs">{SOURCE_TEXT[r.source]}</Chip> : <span className="vw-label">—</span>) },
    { key: 'lead', header: 'Lead', render: r => <span className="num nowrap">{r.ms ? '—' : `${r.leadWeeks} wk${r.bufferWeeks ? ` + ${r.bufferWeeks}` : ''}`}</span>, sort: r => r.leadWeeks + (r.bufferWeeks ?? 0) },
    { key: 'order', header: 'Order by', render: r => <span className="nowrap">{r.ms ? '—' : date(r.orderBy)}</span>, sort: r => r.orderBy },
    { key: 'need', header: 'Need by', render: r => <span className="nowrap">{date(r.needBy)}</span>, sort: r => r.needBy },
    { key: 'po', header: 'Purchase order', render: r => (r.orders?.length ? <span className="cell-2">{r.orders.map(o => <Link key={o.id} className="ent-link mono" to={`/delivery/projects/${d?.projectId ?? plan.plnId.replace('PLN-', 'PRJ-')}?tab=procurement`} onClick={e => e.stopPropagation()}>{o.id}</Link>)}</span> : <span className="vw-label">{r.kind === 'equipment' && r.source !== 'stock' && inDelivery ? 'none yet' : '—'}</span>) },
    { key: 'status', header: 'Status', render: r => <Chip tone={r.st.tone} size="xs" dot>{r.st.label}</Chip>, sort: r => ['late', 'soon', 'later', 'ordered', 'stock', 'granted', 'delivered', 'gate'].indexOf(r.st.key) },
  ], [d, inDelivery, plan.plnId]);

  if (!phases.length) return <Panel title="Schedule" icon={I.CalendarClock}><p className="vw-label" style={{ margin: 0 }}>No dated phase yet, so there is nothing to schedule. Add a phase with a go-live date in the wizard.</p></Panel>;
  return (
    <div className="col pn-sched" style={{ gap: 14 }}>
      <TileStrip cols={5}>
        <StatTile label="Late" value={<span className={late.length ? 'pn-bad' : undefined}>{late.length}</span>} sub={late.length ? `${late.slice(0, 2).map(l => short(l.item, 30)).join(', ')}${late.length > 2 ? ` and ${late.length - 2} more` : ''}` : 'everything can still arrive in time'} subTone={late.length ? 'bad' : undefined} onClick={late.length ? () => pick('late') : undefined} active={filter === 'late'} info="Items whose order-by date has passed without an order (or whose delivery Delivery reports after the need date). Click to show only these." />
        <StatTile label="Order in the next 90 days" value={soon.length} sub={soon[0] ? `next: ${short(soon[0].item)}, ${date(soon[0].orderBy)}` : 'nothing due soon'} onClick={soon.length ? () => pick('soon') : undefined} active={filter === 'soon'} info="Items to order, and permits to apply for, whose order-by date falls in the next 13 weeks." />
        <StatTile label="Ordered" value={`${ordered.length} of ${toBuy.length}`} sub={!toBuy.length ? 'nothing to buy: stock and the site cover it' : inDelivery ? `purchase orders from Delivery (${d?.projectId})` : ['Approved', 'Executing', 'Completed'].includes(plan.status) ? 'raised when the build starts' : 'ordered once the plan is approved'} onClick={ordered.length ? () => pick('ordered') : undefined} active={filter === 'ordered'} info="Equipment lines to buy that are covered by a purchase order in Delivery (stock and spare site capacity need no order)." />
        <StatTile label="Longest lead" value={longest ? `${longest.leadWeeks + (longest.bufferWeeks ?? 0)} wk` : '—'} sub={longest ? `${short(longest.item)}${longest.bufferWeeks ? `, incl. ${longest.bufferWeeks} wk buffer` : ''}` : 'no long-lead equipment'} info={`Supplier lead time from the benchmarks plus the schedule contingency${contingency !== undefined ? ` (${contingency}%)` : ''}, held as a buffer before the order date.`} />
        <StatTile label={phases.length > 1 ? `${phases.length} phases` : 'Go-live'} value={date(phases[0].goLive)} sub={phases.length > 1 ? `first live; last ${date(phases[phases.length - 1].goLive)}` : `needed by ${date(plan.targetGoLive)}`} info="Go-live of the first phase; every order date is worked back from the go-live of the phase that needs the item." />
      </TileStrip>
      <Panel title="What to order, apply for and pass, phase by phase" icon={I.CalendarClock} className="pn-sched-panel"
        info="Each line is back-scheduled from its phase's go-live: the bar runs from the order-by date to the need-by date (lead time, with the schedule buffer hatched at the start). Gates are the diamonds on the phase line. Click a line to find it in the items table."
        actions={<Seg size="sm" value={view} onChange={setView} options={[{ id: 'board', label: 'By phase', icon: I.Rows3 }, { id: 'timeline', label: 'Timeline', icon: I.ChartGantt }]} />}>
        <div className="pn-sched-bar">
          {groupsAll.length > 1 ? <Seg size="sm" value={phaseId} onChange={setPhaseId} options={[{ id: 'all', label: 'All phases' }, ...groupsAll.map(g => ({ id: g.key, label: g.name.length > 26 ? `${g.name.slice(0, 25)}…` : g.name, title: g.name }))]} /> : <span className="vw-label">{phases[0].name} · live {date(phases[0].goLive)}</span>}
          <Seg size="sm" value={filter} onChange={setFilter} options={[{ id: 'all', label: `All ${work.length}` }, { id: 'late', label: `Late ${count('late')}` }, { id: 'soon', label: `Due in 90 days ${count('soon')}` }, { id: 'ordered', label: `Ordered or done ${count('ordered')}` }]} />
        </div>
        {view === 'board'
          ? <ScheduleBoard rows={shown} all={inPhase} groups={phaseId === 'all' ? groupsAll : groupsAll.filter(g => g.key === phaseId)} sel={sel} onSel={setSel} now={now} filtered={filter !== 'all'} />
          : shown.length ? <LeadTimes items={shown} goLive={goLive} maxHeight={560} highlight={selRow?.item} onPick={it => { const r = shown.find(x => x.item === it.item && x.phase === it.phase); setSel(r && r.id !== sel ? r.id : null); }} /> : <p className="vw-label">Nothing matches this filter.</p>}
      </Panel>
      <Panel title="Items" icon={I.List} count={shown.length} flush info="The same lines as the board, with lead time, buffer, dates and the purchase order behind each. Click a row to show it on the board.">
        <DataTable rows={shown} cols={cols} pageSize={20} onRow={r => { setSel(r.id); setView('board'); }} rowClass={r => (r.id === sel ? 'pn-row-sel' : '')} empty={<p className="vw-label" style={{ margin: 12 }}>Nothing matches this filter.</p>} />
      </Panel>
      {plan.permits.length > 0 && <Panel title="Permits" icon={I.Stamp} count={plan.permits.length} flush info="Apply-by = needed-before less the authority's lead time. Edit permits on the Risks & permits tab.">
        <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Permit</th><th>Authority</th><th>Lead time</th><th>Apply by</th><th>Needed before</th><th>Status</th></tr></thead>
          <tbody>{plan.permits.map(p => { const apply = new Date(new Date(p.neededBefore).getTime() - p.leadWeeks * WEEK).toISOString(); const overdue = p.status === 'Not started' && new Date(apply).getTime() < now; return <tr key={p.id}><td>{p.name}</td><td>{p.authority}</td><td className="num">{p.leadWeeks} wk</td><td className="nowrap" style={{ color: overdue ? 'var(--vw-color-red-600)' : undefined }}>{date(apply)}{overdue ? ' (passed)' : ''}</td><td className="nowrap">{date(p.neededBefore)}</td><td><Chip tone={p.status === 'Approved' ? 'success' : p.status === 'Expired' ? 'error' : p.status === 'Not started' ? 'neutral' : 'info'} size="xs" dot>{p.status}</Chip></td></tr>; })}</tbody></table>
      </Panel>}
      {selRow && <span className="pn-sr" aria-live="polite">{selRow.item} selected</span>}
    </div>
  );
}

/* ---- the board: a month axis, one collapsible group per phase, one line per item */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(560);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(e => { const n = Math.round(e[0].contentRect.width); if (n > 0) setW(p => (Math.abs(p - n) > 1 ? n : p)); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}
interface Tip { x: number; y: number; title: string; rows: [string, string][] }
const ROW_H = 40, HEAD_H = 44;

function ScheduleBoard({ rows, all, groups: gs, sel, onSel, now, filtered }: { rows: Row[]; all: Row[]; groups: SchedGroup[]; sel: string | null; onSel: (id: string | null) => void; now: number; filtered: boolean }) {
  const [axisRef, tw] = useWidth();
  const wrap = useRef<HTMLDivElement | null>(null), body = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const work = rows.filter(r => !r.ms);
  // collapsed groups: with many lines, open only the phases that need attention (or the first)
  const defaultOpen = useMemo(() => {
    const n = all.filter(r => !r.ms).length;
    if (n <= 24) return new Set(gs.map(g => g.key));
    const hot = gs.filter(g => all.some(r => r.grp === g.key && (r.st.key === 'late' || r.st.key === 'soon'))).map(g => g.key);
    return new Set(hot.length ? hot : gs.slice(0, 1).map(g => g.key));
  }, [all, gs]);
  const [open, setOpen] = useState<Set<string>>(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  // a line picked in the table: open its group and bring it into view
  useEffect(() => {
    if (!sel) return; const r = rows.find(x => x.id === sel); if (!r) return;
    if (!open.has(r.grp) && !r.ms) { setOpen(o => new Set(o).add(r.grp)); return; }
    const el = body.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(sel)}"]`);
    if (el && body.current) { const b = body.current; const top = el.offsetTop - b.offsetTop; if (top < b.scrollTop || top + ROW_H > b.scrollTop + b.clientHeight) b.scrollTo({ top: Math.max(0, top - b.clientHeight / 2), behavior: 'smooth' }); }
  }, [sel, open, rows]);
  if (!all.length) return <p className="vw-label">Nothing to schedule in this phase.</p>;
  // the axis covers every line of the shown phases, so filtering does not move it
  const ts = all.flatMap(r => [new Date(r.orderBy).getTime(), new Date(r.needBy).getTime()]).filter(Number.isFinite);
  const gl = gs.map(g => (g.goLive ? new Date(g.goLive).getTime() : NaN)).filter(Number.isFinite);
  const t0 = Math.min(now, ...ts) - 14 * DAY, t1 = Math.max(...gl, ...ts) + 21 * DAY;
  const X = (t: number) => Math.max(0, Math.min(tw, ((t - t0) / (t1 - t0)) * tw));
  const months: number[] = []; { const dd = new Date(t0); dd.setUTCDate(1); dd.setUTCMonth(dd.getUTCMonth() + 1); for (; dd.getTime() < t1; dd.setUTCMonth(dd.getUTCMonth() + 1)) months.push(dd.getTime()); }
  const pxPerMonth = tw / Math.max(1, months.length);
  const mon = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const nowX = now >= t0 && now <= t1 ? X(now) : null;
  // grid: every month when there is room, else quarters; labels never touch (a year label wins over its neighbours)
  const gridMonths = pxPerMonth >= 12 ? months : months.filter(t => new Date(t).getUTCMonth() % 3 === 0);
  const labels: { t: number; text: string; jan: boolean }[] = [];
  { const step = pxPerMonth >= 40 ? 1 : pxPerMonth >= 22 ? 3 : pxPerMonth >= 11 ? 6 : 12;
    const cand = months.filter(t => new Date(t).getUTCMonth() % step === 0).map(t => { const jan = new Date(t).getUTCMonth() === 0; return { t, jan, text: jan ? (step === 12 ? String(new Date(t).getUTCFullYear()) : `${mon(t)} ${new Date(t).getUTCFullYear()}`) : mon(t) }; });
    let right = -Infinity;
    for (const c of cand) { const x = X(c.t), w = c.text.length * 6.2; const next = cand.find(o => o.t > c.t); if (!c.jan && next?.jan && X(next.t) - next.text.length * 3.1 < x + w / 2 + 8) continue; if (x - w / 2 > right + 8 && x - w / 2 > 0 && x + w / 2 < tw && (nowX === null || Math.abs(x - nowX) > w / 2 + 24)) { labels.push(c); right = x + w / 2; } } }
  const show = (e: React.MouseEvent, title: string, rs: [string, string][]) => { const b = wrap.current?.getBoundingClientRect(); if (!b) return; setTip({ x: e.clientX - b.left, y: e.clientY - b.top, title, rows: rs }); };
  const grid = (h: number, phaseGoLive?: number) => (
    <>
      {gridMonths.map(t => { const jan = new Date(t).getUTCMonth() === 0; return <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={h} stroke={jan ? C.slateLight : C.grid} strokeDasharray={jan ? undefined : '2 3'} />; })}
      {nowX !== null && <line x1={nowX} x2={nowX} y1={0} y2={h} stroke={C.slateDark} strokeDasharray="3 3" />}
      {phaseGoLive !== undefined && Number.isFinite(phaseGoLive) && <line x1={X(phaseGoLive)} x2={X(phaseGoLive)} y1={0} y2={h} stroke={C.emerald} strokeWidth={1.5} />}
    </>
  );
  const tipRows = (r: Row): [string, string][] => r.ms ? [['Date', date(r.needBy)], ['Phase', r.phase], ...(r.note ? [['Note', r.note] as [string, string]] : [])] : [
    ['Kind', r.kind === 'equipment' ? `long-lead equipment${r.source ? `, ${SOURCE_TEXT[r.source]}` : ''}` : 'permit'],
    ['Lead time', `${r.leadWeeks} wk${r.bufferWeeks ? ` + ${r.bufferWeeks} wk buffer` : ''}`], ['Order by', date(r.orderBy)], ['Need by', date(r.needBy)], ['Phase', r.phase],
    ...(r.orders?.length ? [['Purchase order', r.orders.map(o => `${o.id} (${o.state.toLowerCase()})`).join(', ')] as [string, string]] : []), ['Status', r.st.label],
  ];
  const line = (r: Row, goLiveT: number) => {
    const a = X(new Date(r.orderBy).getTime()), b = X(new Date(r.needBy).getTime()), bh = 14, y = (ROW_H - bh) / 2;
    const buf = r.bufferWeeks ? Math.min(b - a, (r.bufferWeeks * WEEK / (t1 - t0)) * tw) : 0;
    const isSel = r.id === sel;
    const label = r.st.text, lw = label.length * 5.9 + 8;
    const after = b + 6 + lw <= tw, before = a - 6 - lw >= 0;
    return (
      <div key={r.id} data-row={r.id} className={`pn-sb-row${isSel ? ' is-sel' : ''}`} onClick={() => onSel(isSel ? null : r.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onSel(isSel ? null : r.id); }}>
        <div className="pn-sb-label"><span className={`pn-sb-name${r.st.key === 'late' ? ' is-bad' : ''}`} title={r.item}>{r.kind === 'permit' ? r.item.replace(/^Permit · /, '') : r.item}</span>
          <small>{r.kind === 'permit' ? 'permit' : r.source === 'stock' ? 'from stock' : r.orders?.length ? r.orders.map(o => o.id).join(', ') : r.source === 'mixed' ? 'stock and buy' : `${r.leadWeeks} wk lead`}{r.kind !== 'permit' && r.bufferWeeks ? ` + ${r.bufferWeeks} buffer` : ''}</small></div>
        <svg width={tw} height={ROW_H} className="pn-sb-track" onMouseMove={e => show(e, r.item, tipRows(r))} onMouseLeave={() => setTip(null)}>
          {grid(ROW_H, goLiveT)}
          {isSel && <rect x={Math.max(0, a - 4)} y={y - 5} width={Math.max(10, b - a + 8)} height={bh + 10} rx={6} fill="none" stroke={C.ink} strokeWidth={1.5} />}
          <rect x={a} y={y} width={Math.max(4, b - a)} height={bh} rx={4} fill={r.st.bar} opacity={r.st.key === 'delivered' || r.st.key === 'granted' ? 0.75 : 0.92} />
          {buf > 2 && <rect x={a} y={y} width={buf} height={bh} rx={4} fill="url(#pn-sb-hatch)" />}
          <text paintOrder="stroke" stroke={after || before ? 'var(--vw-color-white)' : 'none'} strokeWidth={3} strokeLinejoin="round" x={after ? b + 6 : before ? a - 6 : a + Math.max(6, buf + 6)} y={ROW_H / 2} dy="0.35em" textAnchor={after || !before ? 'start' : 'end'} fontSize={11} fontWeight={r.st.key === 'late' || r.st.key === 'soon' ? 600 : 400}
            fill={after || before ? (r.st.key === 'late' ? 'var(--vw-color-red-600)' : r.st.key === 'soon' ? 'var(--vw-color-amber-700)' : C.slateDark) : ['ordered', 'delivered', 'granted'].includes(r.st.key) ? C.ink : C.surface}>{label}</text>
        </svg>
        <div className="pn-sb-meta"><span>{r.kind === 'permit' ? 'apply by' : 'order by'}</span><b>{date(r.orderBy)}</b></div>
      </div>
    );
  };
  const groups = gs.map(g => ({ g, gates: all.filter(r => r.grp === g.key && r.ms).sort((a, b) => a.needBy.localeCompare(b.needBy)), lines: work.filter(r => r.grp === g.key).sort((a, b) => a.orderBy.localeCompare(b.orderBy)), allLines: all.filter(r => r.grp === g.key && !r.ms) }))
    .filter(g => !filtered || g.lines.length);
  return (
    <div className="pn-sb" ref={wrap} onMouseLeave={() => setTip(null)}>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden><defs><pattern id="pn-sb-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={6} height={6} fill="var(--vw-color-white)" opacity={0.35} /><line x1={0} y1={0} x2={0} y2={6} stroke="var(--vw-color-white)" strokeWidth={2.2} /></pattern></defs></svg>
      <div className="pn-sb-body" ref={body}>
        <div className="pn-sb-row is-axis">
          <div className="pn-sb-label"><b>Item</b><small>{filtered ? `${work.length} of ${all.filter(r => !r.ms).length} lines` : `${work.length} line${work.length === 1 ? '' : 's'} · ${all.filter(r => r.ms).length} gate${all.filter(r => r.ms).length === 1 ? '' : 's'}`}</small></div>
          <div ref={axisRef} className="pn-sb-axis">
            <svg width={tw} height={HEAD_H}>
              {gridMonths.map(t => { const jan = new Date(t).getUTCMonth() === 0; const x = X(t); return <line key={t} x1={x} x2={x} y1={HEAD_H - (jan ? 9 : 5)} y2={HEAD_H} stroke={jan ? C.slate : C.slateLight} />; })}
            {labels.map(l => <text key={l.t} x={X(l.t)} y={HEAD_H - 13} textAnchor="middle" fontSize={10.5} fill={l.jan ? C.slateDark : C.slate} fontWeight={l.jan ? 600 : 400}>{l.text}</text>)}
              {nowX !== null && <g><line x1={nowX} x2={nowX} y1={14} y2={HEAD_H} stroke={C.slateDark} strokeDasharray="3 3" /><rect x={Math.min(tw - 46, Math.max(0, nowX - 22))} y={0} width={44} height={15} rx={7.5} fill={C.slateDark} /><text x={Math.min(tw - 24, Math.max(22, nowX))} y={11} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={C.surface}>today</text></g>}
            </svg>
          </div>
          <div className="pn-sb-meta"><b>Key date</b></div>
        </div>
        {!groups.length && <p className="vw-label" style={{ padding: '14px 4px', margin: 0 }}>Nothing matches this filter{gs.length === 1 ? '' : ' in these phases'}.</p>}
        {groups.map(({ g: grp, gates, lines, allLines }) => {
          const isOpen = open.has(grp.key) || filtered;
          const gT = grp.goLive ? new Date(grp.goLive).getTime() : NaN;
          const lateN = allLines.filter(r => r.st.key === 'late').length, soonN = allLines.filter(r => r.st.key === 'soon').length;
          const span = [...allLines.map(r => new Date(r.orderBy).getTime()), ...gates.map(g => new Date(g.needBy).getTime())];
          const s0 = span.length ? X(Math.min(...span)) : X(gT), s1 = Number.isFinite(gT) ? X(gT) : span.length ? X(Math.max(...span, ...allLines.map(r => new Date(r.needBy).getTime()))) : s0;
          const next = gates.find(g => new Date(g.needBy).getTime() >= now);
          return (
            <div key={grp.key} className="pn-sb-group">
              <div className={`pn-sb-row is-phase${isOpen ? ' is-open' : ''}`}>
                <button type="button" className="pn-sb-label pn-sb-toggle" onClick={() => setOpen(o => { const n = new Set(o); if (n.has(grp.key)) n.delete(grp.key); else n.add(grp.key); return n; })} aria-expanded={isOpen} disabled={filtered}>
                  <I.ChevronRight size={15} className="pn-sb-chev" />
                  <span className="cell-2"><b title={grp.name}>{grp.name}</b><small>{allLines.length} line{allLines.length === 1 ? '' : 's'}{lateN ? <em className="is-bad"> · {lateN} late</em> : null}{soonN ? <em className="is-warn"> · {soonN} due soon</em> : null}{gates.length ? ` · ${gates.length} gate${gates.length === 1 ? '' : 's'}` : ''}</small></span>
                </button>
                <svg width={tw} height={ROW_H} className="pn-sb-track">
                  {grid(ROW_H)}
                  <rect x={Math.min(s0, s1)} y={ROW_H / 2 - 2} width={Math.max(2, Math.abs(s1 - s0))} height={4} rx={2} fill={C.blueLight} />
                  {gates.map(g => { const x = X(new Date(g.needBy).getTime()); const isSel = g.id === sel; return <g key={g.id} className="pn-sb-gate" onMouseMove={e => show(e, g.item, tipRows(g))} onMouseLeave={() => setTip(null)} onClick={() => onSel(isSel ? null : g.id)}>
                    <rect x={x - 5} y={ROW_H / 2 - 5} width={10} height={10} rx={1.5} fill={isSel ? C.ink : C.violet} stroke={C.surface} strokeWidth={1.5} transform={`rotate(45 ${x} ${ROW_H / 2})`} /><rect x={x - 8} y={ROW_H / 2 - 10} width={16} height={20} fill="transparent" /></g>; })}
                  {Number.isFinite(gT) && grp.phase && <g onMouseMove={e => show(e, `${grp.name} · go-live`, [['Date', date(grp.goLive)], ['IT', `${grp.phase!.itKw} kW`], ['Status', grp.phase!.status]])} onMouseLeave={() => setTip(null)}>
                    <line x1={s1} x2={s1} y1={6} y2={ROW_H - 6} stroke={C.emerald} strokeWidth={2} /><path d={`M${s1},6 l9,4 l-9,4 z`} fill={C.emerald} />
                    {s1 + 14 + 70 < tw ? <text x={s1 + 12} y={ROW_H / 2 + 4} fontSize={10.5} fontWeight={600} fill="var(--vw-color-emerald-700)">live {date(grp.goLive)}</text> : <text x={s1 - 6} y={ROW_H - 7} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--vw-color-emerald-700)">live {date(grp.goLive)}</text>}
                  </g>}
                </svg>
                <div className="pn-sb-meta">{next ? <><span>next gate</span><b title={next.item}>{date(next.needBy)}</b></> : grp.goLive ? <><span>go-live</span><b>{date(grp.goLive)}</b></> : <><span>last date</span><b>{date(new Date(Math.max(...allLines.map(r => new Date(r.needBy).getTime()), 0) || Date.now()).toISOString())}</b></>}</div>
              </div>
              {isOpen && (lines.length ? lines.map(r => line(r, gT)) : <div className="pn-sb-empty">No equipment or permits in this {grp.phase ? 'phase' : 'group'}{gates.length ? '; its gates are on the line above' : ''}.</div>)}
            </div>
          );
        })}
      </div>
      {tip && <div className="pn-sb-tip" style={{ left: Math.min(tip.x + 14, (wrap.current?.clientWidth ?? 800) - 270), top: tip.y + 16 }}><b>{tip.title}</b>{tip.rows.map(([k, v]) => <span key={k}><em>{k}</em>{v}</span>)}</div>}
      <Legend items={[{ label: 'To order (order-by → need-by)', color: C.blue }, { label: 'Schedule buffer', color: C.blueLight }, { label: 'Ordered or delivered', color: C.slateLight }, { label: 'From stock', color: C.emerald }, { label: 'Late', color: C.red }, { label: 'Permit', color: C.amber }, { label: 'Gate', color: C.violet, kind: 'diamond' }, { label: 'Go-live', color: C.emerald, kind: 'line' }, { label: 'Today', color: C.slateDark, kind: 'dash' }]} />
    </div>
  );
}

