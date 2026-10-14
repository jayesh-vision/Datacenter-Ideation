/* Planner hub (Plan & Build, 13-Oct-2026): the P2B planner's features on our screens — analytics strip, then tabs Overview · Plans ·
   Templates · Benchmarks & rules. Plans are evaluated by the planner engine (src/planner/lib) against our estate. */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Panel, Tabs, Chip } from '../../ui/kit';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Part } from '../../ui/Analytics';
import { BarList } from '../../charts/BarList';
import { useBenchmarks, useEstate, usePlans, useTemplates } from '../../planner/lib/usePlanner';
import { usePlannerData } from '../../planner/lib/plannerData';
import { evaluate, type Evaluation } from '../../planner/lib/engine';
import type * as T from '../../planner/p2b/types';
import { PlanStatusChip, PlannerToasts, SCOPE_LABEL, SCOPE_ICON, date, kw, money, num } from './common';
import { PlansTab } from './Plans';
import { TemplatesTab } from './Templates';
import { BenchmarksTab } from './Benchmarks';
import '../../styles/planning.css';

type Tab = 'overview' | 'plans' | 'templates' | 'benchmarks';
export interface PlanRow { id: string; plan: T.PlannerPlan; ev: Evaluation; site: string; capex: number }
const ACTIVE: T.PlannerPlanStatus[] = ['Draft', 'In review', 'Approved', 'Executing', 'On hold'];

/** every plan evaluated on the platform data (in-site plans cost from their bill of materials) */
export function usePlanRows(): { rows: PlanRow[]; ready: boolean } {
  const plans = usePlans(), templates = useTemplates(), benchmarks = useBenchmarks(), estate = useEstate(), data = usePlannerData();
  return useMemo(() => {
    if (!templates.length) return { rows: [], ready: false };
    const dc = new Map(estate.dataCenters.map(d => [d.id, d])), campus = new Map(estate.campuses.map(c => [c.id, c])), region = new Map(estate.regions.map(r => [r.id, r]));
    const rows = plans.map(plan => {
      const ev = evaluate(plan, null, templates, benchmarks, undefined, data.ready ? data : undefined);
      const site = plan.dataCenterId ? dc.get(plan.dataCenterId)?.name : undefined;
      return { id: plan.id, plan, ev, site: site ?? plan.newSiteName ?? (plan.campusId ? campus.get(plan.campusId)?.name : undefined) ?? (plan.regionId ? region.get(plan.regionId)?.name : undefined) ?? '—', capex: ev.estimate.capexTotal };
    });
    return { rows, ready: true };
  }, [plans, templates, benchmarks, estate, data]);
}

export function Planner() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const setTab = (t: Tab) => { const n = new URLSearchParams(sp); t === 'overview' ? n.delete('tab') : n.set('tab', t); setSp(n, { replace: true }); };
  usePage([{ label: 'Plan & Build' }, { label: 'Planner', to: '/planning' }, ...(tab !== 'overview' ? [{ label: tab === 'benchmarks' ? 'Benchmarks & rules' : tab[0].toUpperCase() + tab.slice(1) }] : [])]);
  const { rows, ready } = usePlanRows();
  const templates = useTemplates(), benchmarks = useBenchmarks();
  if (!ready) return <Loading />;

  const by = (s: T.PlannerPlanStatus) => rows.filter(r => r.plan.status === s);
  const active = rows.filter(r => ACTIVE.includes(r.plan.status));
  const review = by('In review'), approved = by('Approved'), executing = by('Executing');
  const decisions = review.reduce((a, r) => a + r.plan.approvals.filter(x => x.decision === 'Pending').length, 0);
  const itKw = active.reduce((a, r) => a + r.plan.designPowerKw, 0);
  const capex = active.reduce((a, r) => a + r.capex, 0);
  const failing = rows.filter(r => r.ev.hardFails > 0 && ['Draft', 'In review'].includes(r.plan.status));
  const late = rows.filter(r => r.ev.schedule.some(s => s.late) && ['Approved', 'Executing'].includes(r.plan.status));
  const goPlans = (patch: Record<string, string>) => { const n = new URLSearchParams({ tab: 'plans', ...patch }); setSp(n, { replace: true }); };

  return (
    <div className="page planning">
      <PageHead title="Planner" sub="Plan anything from one rack to a new datacenter: a plan type fixes the questions, the rules and who approves; every figure is sized against the estate."
        actions={<Btn variant="filled" icon={I.Plus} onClick={() => nav('/planning/new')}>New plan</Btn>} />
      <StatGrid>
        <StatTile label="Plans" value={num(rows.length)} sub={`${active.length} active`} onClick={() => goPlans({})} info="Every plan in the planner, by status. Click a status to open the list filtered to it.">
          <Split parts={([{ key: 'Draft', label: 'Draft', n: by('Draft').length, tone: 'neutral' }, { key: 'In review', label: 'In review', n: review.length, tone: 'info' }, { key: 'Approved', label: 'Approved', n: approved.length, tone: 'success' }, { key: 'Executing', label: 'Executing', n: executing.length, tone: 'warning' }, { key: 'Completed', label: 'Completed', n: by('Completed').length, tone: 'purple' }] as Part[]).filter(p => p.n)} onPick={k => goPlans({ status: k })} />
        </StatTile>
        <StatTile label="In review" value={num(review.length)} sub={`${decisions} decision${decisions === 1 ? '' : 's'} pending`} subTone={decisions ? 'warn' : undefined} onClick={() => goPlans({ status: 'In review' })} info="Plans waiting for an approval step. The approval path comes from the plan's template; the finance step depends on the CapEx band.">
          <SoftMeter pct={rows.length ? (review.length / rows.length) * 100 : 0} tone="info" />
          <Facts items={[{ n: num(review.filter(r => r.plan.approvals.some(a => a.decision === 'Approved')).length), label: 'past the first step' }, { n: num(review.filter(r => r.ev.hardFails).length), label: 'with a hard fail', tone: review.some(r => r.ev.hardFails) ? 'bad' : undefined }, { n: money(review.reduce((a, r) => a + r.capex, 0)), label: 'CapEx under review' }]} />
        </StatTile>
        <StatTile label="Approved" value={num(approved.length)} sub="ready to execute" onClick={() => goPlans({ status: 'Approved' })} info="Approved plans hold their capacity at the site; Start the build turns them into delivery projects.">
          <SoftMeter pct={rows.length ? (approved.length / rows.length) * 100 : 0} tone="success" />
          <Facts items={[{ n: money(approved.reduce((a, r) => a + (r.plan.baseline?.capexTotal ?? r.capex), 0)), label: 'approved CapEx' }, { n: kw(approved.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'IT power' }, { n: num(late.filter(r => r.plan.status === 'Approved').length), label: 'late to order', tone: late.some(r => r.plan.status === 'Approved') ? 'warn' : undefined }]} />
        </StatTile>
        <StatTile label="Executing" value={num(executing.length)} sub="in delivery" onClick={() => goPlans({ status: 'Executing' })} info="Plans whose build has started: Delivery shows them as projects with work orders, purchase orders and commissioning.">
          <SoftMeter pct={rows.length ? (executing.length / rows.length) * 100 : 0} tone="warning" />
          <Facts items={[{ n: num(late.length), label: 'with late items', tone: late.length ? 'warn' : undefined }, { n: num(by('Completed').length), label: 'completed' }, { n: money(executing.reduce((a, r) => a + r.capex, 0)), label: 'CapEx in delivery' }]} />
        </StatTile>
        <StatTile label="Planned IT load" value={kw(itKw)} sub="active plans" info="Design IT power of every active plan (draft, in review, approved, executing, on hold).">
          <SoftMeter pct={itKw ? Math.min(100, (executing.reduce((a, r) => a + r.plan.designPowerKw, 0) / itKw) * 100) : 0} tone="info" />
          <Facts items={[{ n: kw(review.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'in review' }, { n: kw(approved.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'approved' }, { n: kw(executing.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'executing' }]} />
        </StatTile>
        <StatTile label="CapEx in pipeline" value={money(capex)} sub="active plans" info="Base-case CapEx of every active plan (committed = approved or executing): plant and fit-out from benchmarks or the bill of materials, plus owned IT where the business model buys it.">
          <SoftMeter pct={capex ? Math.min(100, ((approved.reduce((a, r) => a + r.capex, 0) + executing.reduce((a, r) => a + r.capex, 0)) / capex) * 100) : 0} tone="success" />
          <Facts items={[{ n: money(approved.reduce((a, r) => a + r.capex, 0) + executing.reduce((a, r) => a + r.capex, 0)), label: 'committed' }, { n: money(review.reduce((a, r) => a + r.capex, 0)), label: 'awaiting approval' }, { n: money(by('Draft').reduce((a, r) => a + r.capex, 0)), label: 'in drafts' }]} />
        </StatTile>
      </StatGrid>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'plans', label: 'Plans', count: rows.length }, { id: 'templates', label: 'Templates', count: templates.length }, { id: 'benchmarks', label: 'Benchmarks & rules', count: benchmarks.length }]} />

      {tab === 'overview' && <Overview rows={rows} failing={failing} late={late} />}
      {tab === 'plans' && <PlansTab rows={rows} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'benchmarks' && <BenchmarksTab />}
      <PlannerToasts />
    </div>
  );
}

function Overview({ rows, failing, late }: { rows: PlanRow[]; failing: PlanRow[]; late: PlanRow[] }) {
  const nav = useNavigate();
  const [, setSp] = useSearchParams();
  const byScope = new Map<T.PlannerScope, { n: number; kw: number }>();
  for (const r of rows) { const c = byScope.get(r.plan.scope) ?? { n: 0, kw: 0 }; c.n++; c.kw += r.plan.designPowerKw; byScope.set(r.plan.scope, c); }
  const attention = [
    ...rows.filter(r => r.plan.status === 'In review').map(r => ({ r, tone: 'warning' as const, head: 'Awaiting decision', text: `${r.plan.approvals.filter(a => a.decision === 'Pending').length} decision(s) pending: ${r.plan.approvals.filter(a => a.decision === 'Pending').map(a => a.step).join(', ')}`, tab: 'approvals' })),
    ...failing.map(r => ({ r, tone: 'error' as const, head: 'Hard fail', text: `${r.ev.hardFails} hard rule(s) fail: ${r.ev.findings.filter(f => f.status === 'fail').slice(0, 2).map(f => f.rule.title).join('; ')}`, tab: 'rules' })),
    ...late.map(r => ({ r, tone: 'orange' as const, head: 'Late to order', text: `${r.ev.schedule.filter(s => s.late).length} item(s) cannot arrive by the need date`, tab: 'schedule' })),
  ];
  const recent = [...rows].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt));
  const totalKw = rows.reduce((a, r) => a + r.plan.designPowerKw, 0);
  const counts = { decide: attention.filter(a => a.head === 'Awaiting decision').length, fail: failing.length, late: late.length };
  const toPlans = () => setSp(new URLSearchParams({ tab: 'plans' }), { replace: true });
  return (
    <div className="pn-trio">
      <Panel title="IT power in the pipeline" icon={I.BarChart3} sub={`${kw(totalKw)} of design IT power across all ${rows.length} plans (every status), by plan type`} info="Every plan of every status, grouped by plan type; the bar is the design IT power. Click a type to open the plan list filtered to it.">
        <BarList items={[...byScope.entries()].sort((a, b) => b[1].kw - a[1].kw).map(([scope, c]) => ({ key: scope, label: SCOPE_LABEL[scope], value: c.kw, display: kw(c.kw), secondary: `${c.n} plan${c.n === 1 ? '' : 's'}`, onClick: () => setSp(new URLSearchParams({ tab: 'plans', scope }), { replace: true }) }))} />
      </Panel>
      <Panel title="Plans that need action" icon={I.TriangleAlert} count={attention.length} sub={`${counts.decide} awaiting a decision · ${counts.fail} failing a hard rule · ${counts.late} late to order`} info="Pending decisions, plans failing a hard rule and approved plans whose long-lead items are late. Click a row to open the plan at the right tab.">
        {attention.length ? <ul className="pn-list">{attention.map((a, i) => <li key={i}><button type="button" className="pn-rowbtn" onClick={() => nav(`/planning/plans/${a.r.plan.id}${a.tab ? `?tab=${a.tab}` : ''}`)}><span className="cell-2"><span className="row" style={{ gap: 8 }}><Chip tone={a.tone} size="xs" dot>{a.head}</Chip><small className="mono">{a.r.plan.plnId}</small></span><b>{a.r.plan.title}</b><small>{a.text}</small></span><I.ChevronRight size={15} className="muted" /></button></li>)}</ul> : <p className="vw-label">Nothing waiting: no pending decisions, hard fails or late orders.</p>}
      </Panel>
      <Panel title="Recently updated plans" icon={I.Clock} sub="Latest changes first: status, IT power, CapEx and readiness" info="Every plan, most recently changed first. Click a plan to open it; All plans opens the full list with filters."
        foot={<Btn variant="ghost" size="sm" iconRight={I.ChevronRight} onClick={toPlans}>All {rows.length} plans</Btn>}>
        <div className="pn-recent">{recent.map(r => { const Ico = SCOPE_ICON[r.plan.scope]; const rp = r.ev.readinessPct; return (
          <button key={r.plan.id} type="button" className="pn-recent-card" onClick={() => nav(`/planning/plans/${r.plan.id}`)}>
            <span className="pn-recent-ico"><Ico size={16} /></span>
            <span className="pn-recent-main">
              <span className="pn-recent-top"><b title={r.plan.title}>{r.plan.title}</b><PlanStatusChip s={r.plan.status} /></span>
              <small className="pn-recent-meta"><span className="mono">{r.plan.plnId}</span> · {SCOPE_LABEL[r.plan.scope]} · {r.site}</small>
              <span className="pn-recent-figs">
                <span><small>IT power</small><b>{kw(r.plan.designPowerKw)}</b></span>
                <span><small>CapEx</small><b>{money(r.capex)}</b></span>
                <span><small>Readiness</small><span className="pn-recent-ready"><i><em style={{ width: `${rp}%`, background: rp >= 80 ? 'var(--vw-color-emerald-500)' : rp >= 50 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-red-500)' }} /></i><b>{rp}%</b></span></span>
              </span>
              <small className="pn-recent-upd"><I.Clock size={11} />Updated {date(r.plan.updatedAt)}</small>
            </span>
          </button>); })}</div>
      </Panel>
    </div>
  );
}
