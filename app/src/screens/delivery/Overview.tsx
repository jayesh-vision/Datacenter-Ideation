/* Delivery command centre (14-Oct-2026, dashboard redesign): KPI tiles with sparklines, project health matrix, programme progress
   (work vs time), needs attention, work throughput, change outcomes, a 14-day change calendar with freezes, portfolio cost curve
   with budget / forecast at completion, next 14 days and recent activity — filterable by programme. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getChangeRegister, getDelivery, getProgrammes, useQuery } from '../../api';
import { Loading } from '../../shell/page';
import { Panel } from '../../ui/kit';
import { SevDot } from '../../ui/status';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import { CostCurve } from './parts';
import { ChangeCalendar, ChangeOutcomes, HealthMatrix, KpiTile, ProgrammeProgress, Throughput } from './dash';

const DAY = 864e5, WEEK = 7 * DAY;
type Item = { key: string; sev: 'critical' | 'major' | 'minor' | 'warning'; title: string; sub: string; to: string };

export function DeliveryOverview() {
  const nav = useNavigate();
  const { data: d } = useQuery(getDelivery, []);
  const { data: progs } = useQuery(getProgrammes, []);
  const { data: reg } = useQuery(getChangeRegister, []);
  const [pg, setPg] = useState('');
  const now = clockNow();
  const g = (progs ?? []).find(x => x.programme.id === pg);
  const scope = useMemo(() => (g ? new Set(g.programme.projectIds) : null), [g]);
  if (!d || !progs || !reg) return <Loading />;
  const inS = (pid: string) => !scope || scope.has(pid);
  const ps = d.projects.filter(p => inS(p.id)), live = ps.filter(p => p.state !== 'Delivered'), wos = d.workOrders.filter(w => inS(w.projectId)), pos = d.pos.filter(o => inS(o.projectId));
  const cos = d.changeOrders.filter(c => inS(c.projectId)), tests = d.tests.filter(t => inS(t.projectId));
  const pname = new Map(d.projects.map(p => [p.id, p.name]));
  const curve = g ? g.costCurve : d.costCurve;
  const bac = live.reduce((a, p) => a + p.budgetApproved, 0), ev = live.reduce((a, p) => a + p.earned, 0), ac = live.reduce((a, p) => a + p.actual, 0);
  const cpi = ac ? ev / ac : 1, eac = cpi ? bac / cpi : bac;
  const pastPts = curve.filter(p => p.ev != null && p.ac);
  const cpiSpark = pastPts.slice(-10).map(p => (p.ac ? (p.ev as number) / (p.ac as number) : 1));
  const spiSpark = pastPts.slice(-10).map(p => (p.pv ? (p.ev as number) / p.pv : 1));
  const pv = pastPts.length ? pastPts[pastPts.length - 1].pv : 0, spi = pv ? (pastPts[pastPts.length - 1].ev as number) / pv : 1;
  const weeks = Array.from({ length: 12 }, (_, i) => { const s = now - (8 - i) * WEEK; return { s, done: wos.filter(w => w.state === 'Done' && w.end > s && w.end <= s + WEEK).length, plan: wos.filter(w => w.state !== 'Done' && w.end > s && w.end <= s + WEEK).length, future: s >= now - WEEK / 2 }; });
  const activeSpark = Array.from({ length: 8 }, (_, i) => { const t = now - (7 - i) * WEEK; return ps.filter(p => p.start <= t && p.finish >= t).length; });
  const regChanges = reg.changes.filter(c => !scope || (c.projectId && scope.has(c.projectId)) || (!c.projectId && !scope));

  const items: Item[] = [
    ...live.filter(p => p.health === 'late').map(p => ({ key: `l${p.id}`, sev: 'major' as const, title: `${p.name} is late`, sub: `finish ${fmtDate(p.finish)} · target ${fmtDate(p.target)} · SPI ${p.spi}`, to: `/delivery/projects/${p.id}?tab=schedule` })),
    ...pos.filter(o => o.state === 'Late').map(o => ({ key: o.id, sev: 'major' as const, title: `${o.item} from ${o.supplier} is late`, sub: `${o.id} · now due ${fmtDate(o.due)}`, to: `/delivery/projects/${o.projectId}?tab=procurement` })),
    ...d.risks.filter(r => inS(r.projectId) && r.likelihood * r.impact >= 16 && r.state === 'Open').map(r => ({ key: r.id, sev: 'major' as const, title: r.title, sub: `${r.category} risk · score ${r.likelihood * r.impact} · ${pname.get(r.projectId)}`, to: `/delivery/projects/${r.projectId}?tab=risks` })),
    ...cos.filter(c => c.state === 'Submitted').map(c => ({ key: c.id, sev: 'minor' as const, title: `${c.id} waits for the ${c.approver.toLowerCase()}`, sub: `${c.title} · ${c.budgetDelta >= 0 ? '+' : ''}${fmtMoney(c.budgetDelta)} · ${c.scheduleDays >= 0 ? '+' : ''}${c.scheduleDays} days`, to: `/delivery/projects/${c.projectId}?tab=cost` })),
    ...live.filter(p => p.health === 'at risk').map(p => ({ key: `r${p.id}`, sev: 'minor' as const, title: `${p.name} is at risk`, sub: `CPI ${p.cpi} · SPI ${p.spi}`, to: `/delivery/projects/${p.id}` })),
    ...wos.filter(w => w.state === 'Awaiting change').map(w => ({ key: w.id, sev: 'warning' as const, title: `${w.id} waits for ${w.kit !== 'Ready' ? 'its kit' : 'its change'}`, sub: `${w.title} · window ${fmtDate(w.start)}`, to: `/delivery/projects/${w.projectId}?tab=workorders` })),
    ...ps.filter(p => p.waitsOn?.length).map(p => ({ key: `g${p.id}`, sev: 'warning' as const, title: `${p.name} waits at its gate`, sub: `on ${p.waitsOn!.map(x => pname.get(x) ?? x).join(', ')}`, to: `/delivery/projects/${p.id}` })),
  ];
  const soon = [
    ...wos.filter(w => w.state !== 'Done' && w.start >= now - DAY && w.start <= now + 14 * DAY).map(w => ({ at: w.start, kind: 'Work order', title: w.title, sub: `${w.id} · ${w.crew}`, to: `/delivery/projects/${w.projectId}?tab=workorders`, icon: I.HardHat })),
    ...tests.filter(t => t.state !== 'Passed' && t.due >= now - DAY && t.due <= now + 14 * DAY).map(t => ({ at: t.due, kind: `L${t.level} test`, title: t.name, sub: `${t.projectName} · witness ${t.witness}`, to: `/delivery/projects/${t.projectId}?tab=commissioning`, icon: I.ClipboardCheck })),
    ...d.permits.filter(x => inS(x.projectId) && x.state !== 'Granted' && x.due >= now - DAY && x.due <= now + 14 * DAY).map(x => ({ at: x.due, kind: 'Permit', title: x.name, sub: x.authority, to: `/delivery/projects/${x.projectId}?tab=permits`, icon: I.Stamp })),
  ].sort((a, b) => a.at - b.at);
  let lastDay = '';

  return (
    <div className="dl-dash">
      <div className="dl-filter dl-span-12">
        <span className="vw-label">Programme</span>
        <div className="dl-filter-pills">
          <button type="button" className={!pg ? 'is-on' : ''} onClick={() => setPg('')}>All programmes<b>{d.projects.length}</b></button>
          {progs.map(x => <button key={x.programme.id} type="button" className={pg === x.programme.id ? 'is-on' : ''} onClick={() => setPg(x.programme.id)}><i className={`dl-rag is-${x.rag}`} />{x.programme.name}<b>{x.projects.length}</b></button>)}
        </div>
      </div>

      <div className="dl-kpis dl-span-12">
        <KpiTile label="Live projects" value={live.length} sub={`${ps.filter(p => p.state === 'Mobilising').length} mobilising · ${ps.filter(p => p.state === 'Delivered').length} delivered`} spark={activeSpark} sparkKind="bars" onClick={() => nav('/delivery?tab=projects')} info="Projects not yet handed over; the bars show how many were active each of the last 8 weeks." />
        <KpiTile label="Cost (CPI)" value={cpi.toFixed(2)} sub={`${fmtMoney(ac)} spent`} spark={cpiSpark} tone={cpi < 0.95 ? 'bad' : cpi < 1 ? 'warn' : 'good'} info="Earned value ÷ actual cost across the live projects, and its trend. Below 1 = paying more than the work is worth." />
        <KpiTile label="Schedule (SPI)" value={spi.toFixed(2)} sub={`${live.filter(p => p.health === 'late').length} late project${live.filter(p => p.health === 'late').length === 1 ? '' : 's'}`} spark={spiSpark} tone={spi < 0.9 ? 'bad' : spi < 0.97 ? 'warn' : 'good'} info="Earned value ÷ planned value: below 1 = less work done than the schedule planned by now." />
        <KpiTile label="Work orders done" value={weeks.slice(0, 8).reduce((a, w) => a + w.done, 0)} sub={`8 weeks · ${wos.filter(w => w.state !== 'Done').length} open`} spark={weeks.slice(0, 9).map(w => w.done)} sparkKind="bars" onClick={() => nav('/delivery?tab=workorders')} info="Field work completed per week." />
        <KpiTile label="Forecast cost" value={fmtMoney(eac)} sub={eac > bac ? `${fmtMoney(eac - bac)} over ${fmtMoney(bac)}` : `within ${fmtMoney(bac)}`} tone={eac > bac * 1.05 ? 'bad' : eac > bac ? 'warn' : 'good'} info="Budget at completion ÷ CPI: what the live projects will cost if spending carries on at today's rate." />
        <KpiTile label="Change orders" value={cos.filter(c => c.state === 'Submitted').length} sub={`waiting · ${cos.filter(c => c.state === 'Approved').length} approved`} tone={cos.some(c => c.state === 'Submitted') ? 'warn' : undefined} info="Scope changes that move a budget or a date, waiting for the project manager, the sponsor or the investment committee." />
      </div>

      <Panel className="dl-span-4 dl-h-360" title="Project health" icon={I.Grid3x3} sub="Stage × on track / at risk / late" info="Every project placed by its stage and its health. Click a cell to list those projects.">
        <HealthMatrix projects={ps} onCell={(s, h) => nav(`/delivery?tab=projects&f1=${encodeURIComponent(s)}${s === 'Delivered' ? '' : `&f2=${encodeURIComponent(h)}`}`)} />
      </Panel>
      <Panel className="dl-span-4 dl-h-360" title="Programme progress" icon={I.FolderKanban} count={progs.length} sub="Work done against the time used" info="The bar is work done (budget-weighted); the marker is the share of the programme's time already used. A marker ahead of the bar = behind.">
        <ProgrammeProgress progs={progs.filter(x => !pg || x.programme.id === pg)} onOpen={id => nav(`/delivery/programmes/${id}`)} />
      </Panel>
      <Panel className="dl-span-4 dl-h-360" title="Needs attention" icon={I.TriangleAlert} count={items.length} sub={items.length ? `${items.filter(i => i.sev === 'major').length} major · ${items.filter(i => i.sev !== 'major').length} other` : 'Nothing flagged'} info="Late projects and purchase orders, high risks (16+), change orders waiting for a decision, at-risk projects, work orders waiting on kit or a change, projects waiting at a gate.">
        <ul className="ipam-find">{items.map(x => <li key={x.key}><button type="button" onClick={() => nav(x.to)}><SevDot s={x.sev} /><span className="cell-2"><b>{x.title}</b><small>{x.sub}</small></span><I.ChevronRight size={14} className="ipam-chev" /></button></li>)}
          {!items.length && <li><p className="vw-label" style={{ margin: 0 }}>Every project is on track.</p></li>}</ul>
      </Panel>

      <Panel className="dl-span-4" title="Work throughput" icon={I.BarChart3} sub="Finished per week · planned to finish" info="Work orders finished per week over the last 8 weeks (solid) and planned to finish over the next 4 (outlined).">
        <Throughput weeks={weeks} />
      </Panel>
      <Panel className="dl-span-4" title="Change outcomes" icon={I.GitPullRequestArrow} sub="Changes implemented per week, by class" info="Every change implemented per week (operations, maintenance and delivery) by class; the red number counts failed or rolled-back ones. From Change management.">
        <ChangeOutcomes weeks={reg.weeks} />
      </Panel>
      <Panel className="dl-span-4" title="Change calendar" icon={I.CalendarDays} sub="Next 14 days · windows and freezes" info="Change windows per day for the next two weeks (dots by class, ringed = delivery work) and freeze days (snowflake). Click a day to open Change management's calendar.">
        <ChangeCalendar changes={regChanges} freezes={reg.freezes} onDay={() => nav('/changes?tab=calendar')} />
        <div className="dl-c-legend" style={{ marginTop: 10 }}><span><i className="dl-sw is-s" />Standard</span><span><i className="dl-sw is-n" />Normal</span><span><i className="dl-sw is-e" />Emergency</span><span className="vw-label">number = change windows that day</span></div>
      </Panel>

      <Panel className="dl-span-8" title="Cost performance" icon={I.TrendingUp} sub={g ? g.programme.name : 'Live projects'} info="Planned value (budget spread over each schedule) against earned value and actual cost, with the budget at completion and the forecast at completion (budget ÷ CPI).">
        <CostCurve pts={curve} height={240} bac={bac} eac={eac} />
      </Panel>
      <Panel className="dl-span-4 dl-h-fill" title="Next 14 days" icon={I.CalendarClock} count={soon.length} info="Work orders that start, commissioning tests and permits due in the next two weeks, by day.">
        <ul className="dl-soon">{soon.map((x, i) => { const day = fmtDate(x.at); const head = day !== lastDay; lastDay = day; const Ic = x.icon; return (
          <li key={i}>{head && <span className="dl-soon-day">{x.at < now ? 'Today' : day}</span>}
            <button type="button" onClick={() => nav(x.to)}><span className="dl-soon-ico"><Ic size={14} /></span><span className="cell-2"><b>{x.title}</b><small>{x.kind} · {x.sub}</small></span></button></li>); })}
          {!soon.length && <li><p className="vw-label" style={{ margin: 0 }}>Nothing due in the next two weeks.</p></li>}</ul>
      </Panel>

      <Panel className="dl-span-12" title="Recent activity" icon={I.History} info="The latest moves on the projects: work orders, tests, receipts, change orders, risks.">
        <ul className="dl-act">{d.activity.filter(a => inS(a.projectId) && a.at <= now).slice(0, 10).map((a, i) => <li key={i}><small>{fmtDateTime(a.at)}</small><span><b>{a.who}</b> · {a.text}</span><button type="button" className="ent-link" onClick={() => nav(`/delivery/projects/${a.projectId}?tab=history`)}>{a.projectName}</button></li>)}</ul>
      </Panel>
    </div>
  );
}
