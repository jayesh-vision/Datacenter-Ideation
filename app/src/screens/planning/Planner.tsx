/* Planner hub (Plan & Build, 13-Oct-2026): the P2B planner's features on our screens — analytics strip, then tabs Overview · Plans ·
   Templates · Benchmarks & rules. Plans are evaluated by the planner engine (src/planner/lib) against our estate. */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { usePage, PageHead, Loading } from '../../shell/page';
import { Btn, Panel, Tabs, Chip } from '../../ui/kit';
import { Facts, SoftMeter, Split, StatGrid, StatTile, type Part } from '../../ui/Analytics';
import { useBenchmarks, useEstate, usePlanReviews, usePlans, useReviewComments, useTemplates } from '../../planner/lib/usePlanner';
import { requestState, reviewerState } from '../../planner/lib/reviews';
import { useAuth } from '../../planner/compat/auth';
import { usePlannerData } from '../../planner/lib/plannerData';
import { evaluate, type Evaluation } from '../../planner/lib/engine';
import type * as T from '../../planner/p2b/types';
import { DC_TYPE_CATALOG } from '../../planner/p2b/dcTypes';
import { PlanStatusChip, PlannerToasts, SCOPE_LABEL, SCOPE_ICON, date, kw, money, num } from './common';
import { BarRows } from './charts/library';
import { SERIES } from './charts/chartKit';
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
  const late = rows.filter(r => r.ev.schedule.some(s => s.late) && ['Approved', 'Executing'].includes(r.plan.status));
  const goPlans = (patch: Record<string, string>) => { const n = new URLSearchParams({ tab: 'plans', ...patch }); setSp(n, { replace: true }); };

  return (
    <div className="page planning">
      <PageHead title="Planner" sub="Plan anything from one rack to a new datacenter: a plan type fixes the questions, the rules and who approves; every figure is sized against the estate."
        actions={<Btn variant="filled" icon={I.Plus} onClick={() => nav('/planning/new')}>New plan</Btn>} />
      {(tab === 'overview' || tab === 'plans') && <StatGrid>
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
          <Facts items={[{ n: num(late.filter(r => r.plan.status === 'Executing').length), label: 'with late items', tone: late.some(r => r.plan.status === 'Executing') ? 'warn' : undefined }, { n: num(by('Completed').length), label: 'completed' }, { n: money(executing.reduce((a, r) => a + r.capex, 0)), label: 'CapEx in delivery' }]} />
        </StatTile>
        <StatTile label="Planned IT load" value={kw(itKw)} sub="active plans" info="Design IT power of every active plan (draft, in review, approved, executing, on hold).">
          <SoftMeter pct={itKw ? Math.min(100, (executing.reduce((a, r) => a + r.plan.designPowerKw, 0) / itKw) * 100) : 0} tone="info" />
          <Facts items={[{ n: kw(review.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'in review' }, { n: kw(approved.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'approved' }, { n: kw(executing.reduce((a, r) => a + r.plan.designPowerKw, 0)), label: 'executing' }]} />
        </StatTile>
        <StatTile label="CapEx in pipeline" value={money(capex)} sub="active plans" info="Base-case CapEx of every active plan (committed = approved or executing): plant and fit-out from benchmarks or the bill of materials, plus owned IT where the business model buys it.">
          <SoftMeter pct={capex ? Math.min(100, ((approved.reduce((a, r) => a + r.capex, 0) + executing.reduce((a, r) => a + r.capex, 0)) / capex) * 100) : 0} tone="success" />
          <Facts items={[{ n: money(approved.reduce((a, r) => a + r.capex, 0) + executing.reduce((a, r) => a + r.capex, 0)), label: 'committed' }, { n: money(review.reduce((a, r) => a + r.capex, 0)), label: 'awaiting approval' }, { n: money(by('Draft').reduce((a, r) => a + r.capex, 0)), label: 'in drafts' }]} />
        </StatTile>
      </StatGrid>}

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'plans', label: 'Plans', count: rows.length }, { id: 'templates', label: 'Templates', count: templates.length }, { id: 'benchmarks', label: 'Benchmarks & rules', count: benchmarks.length }]} />

      {tab === 'overview' && <Overview rows={rows} />}
      {tab === 'plans' && <PlansTab rows={rows} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'benchmarks' && <BenchmarksTab />}
      <PlannerToasts />
    </div>
  );
}

type AttnKind = 'mine' | 'decision' | 'review' | 'stalled' | 'condition' | 'fail' | 'late';
const ATTN: Record<AttnKind, { label: string; tone: 'warning' | 'error' | 'orange' | 'info'; tab?: string; to?: (id: string) => string; rank: number; noun: string }> = {
  mine: { label: 'Your review', tone: 'info', to: id => `/planning/plans/${id}/review`, rank: -1, noun: 'waiting for your review' },
  decision: { label: 'Awaiting decision', tone: 'warning', tab: 'approvals', rank: 0, noun: 'awaiting a decision' },
  review: { label: 'Review sent', tone: 'info', to: id => `/planning/plans/${id}/review`, rank: 0.5, noun: 'with review comments or requests' },
  stalled: { label: 'Execution stopped', tone: 'error', rank: 1, noun: 'execution stopped' },
  condition: { label: 'Open condition', tone: 'warning', tab: 'approvals', rank: 2, noun: 'with an open condition' },
  fail: { label: 'Hard fail', tone: 'error', tab: 'rules', rank: 3, noun: 'failing a hard rule' },
  late: { label: 'Late to order', tone: 'orange', tab: 'schedule', rank: 4, noun: 'late to order' },
};
const ATTN_SHOWN = 8;
const dcTypeName = (k?: string) => DC_TYPE_CATALOG.find(p => p.key === k)?.name;

function Overview({ rows }: { rows: PlanRow[] }) {
  const nav = useNavigate();
  const [, setSp] = useSearchParams();
  const [allAttn, setAllAttn] = useState(false);
  const reviews = usePlanReviews(), comments = useReviewComments();
  const { user } = useAuth();
  const byScope = new Map<T.PlannerScope, { n: number; kw: number }>();
  for (const r of rows) { const c = byScope.get(r.plan.scope) ?? { n: 0, kw: 0 }; c.n++; c.kw += r.plan.designPowerKw; byScope.set(r.plan.scope, c); }
  /* five kinds across every active plan, ranked by kind and then by size (as DCOS does); each row opens the plan at the right tab */
  const attention = useMemo(() => {
    const out: { r: PlanRow; kind: AttnKind; text: string }[] = [];
    for (const r of rows) {
      const p = r.plan;
      if (!ACTIVE.includes(p.status)) continue;
      /* review requests (the reviewer portal): one row for the signed-in reviewer who has not answered yet, else one per plan */
      const req = reviews.find(x => x.planId === p.id && requestState(x, p).open);
      const cs = comments.filter(c => c.planId === p.id && !c.parentId);
      const openC = cs.filter(c => c.status === 'Open').length;
      if (req) {
        const states = req.reviewers.map(x => ({ x, s: reviewerState(x.name, req, p, comments) }));
        const mine = user && states.find(st => st.x.name === user.name && st.s.state === 'Awaiting');
        const answered = states.filter(st => st.s.state !== 'Awaiting').length;
        out.push({ r, kind: mine ? 'mine' : 'review', text: `${mine ? `${req.requestedBy} asked you to review ${req.docNumber}` : `${req.revId} sent to ${req.reviewers.map(x => x.name).join(', ')}`} · ${answered} of ${req.reviewers.length} answered${openC ? ` · ${openC} open comment${openC === 1 ? '' : 's'}` : ''}` });
      } else if (openC) out.push({ r, kind: 'review', text: `${openC} open review comment${openC === 1 ? '' : 's'}: ${cs.filter(c => c.status === 'Open').slice(0, 2).map(c => `${c.sectionLabel} (${c.author})`).join('; ')}` });
      const pending = p.approvals.filter(a => a.decision === 'Pending');
      if (p.status === 'In review' && pending.length) out.push({ r, kind: 'decision', text: `${pending.length} decision${pending.length === 1 ? '' : 's'} pending: ${pending.map(a => a.step).join(', ')}` });
      if (p.status === 'Approved' && p.artefacts?.executionId && !p.artefacts.completedAt) out.push({ r, kind: 'stalled', text: `Stopped at ${(p.artefacts.errors ?? []).map(e => e.step).join(', ') || 'a step'}; resume it from the plan page` });
      const blocking = (p.conditions ?? []).filter(c => c.status === 'Open' && c.blocksExecution);
      if (blocking.length && (p.status === 'Approved' || p.status === 'Executing')) out.push({ r, kind: 'condition', text: `${blocking.length} approval condition${blocking.length === 1 ? '' : 's'} open: ${blocking.slice(0, 2).map(c => c.text).join('; ')}` });
      if (r.ev.hardFails) out.push({ r, kind: 'fail', text: `${r.ev.hardFails} hard rule${r.ev.hardFails === 1 ? '' : 's'} fail: ${r.ev.findings.filter(f => f.status === 'fail').slice(0, 2).map(f => f.rule.title).join('; ')}${r.ev.hardFails > 2 ? '…' : ''}` });
      const late = r.ev.schedule.filter(s => s.late);
      if (late.length) out.push({ r, kind: 'late', text: `${late.length} long-lead item${late.length === 1 ? '' : 's'} past the order date: ${late.slice(0, 3).map(l => l.item).join(', ')}${late.length > 3 ? '…' : ''}` });
    }
    return out.sort((a, b) => ATTN[a.kind].rank - ATTN[b.kind].rank || b.r.plan.designPowerKw - a.r.plan.designPowerKw);
  }, [rows, reviews, comments, user]);
  const recent = [...rows].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt)).slice(0, 6);
  const totalKw = rows.reduce((a, r) => a + r.plan.designPowerKw, 0);
  const counts = (Object.keys(ATTN) as AttnKind[]).map(k => [k, attention.filter(a => a.kind === k).length] as const).filter(([, n]) => n);
  const shownAttn = allAttn ? attention : attention.slice(0, ATTN_SHOWN);
  const toPlans = () => setSp(new URLSearchParams({ tab: 'plans' }), { replace: true });
  return (
    <div className="pn-home">
      <div className="pn-home-top">
        <Panel title="IT power in the pipeline" icon={I.BarChart3} sub={`${kw(totalKw)} of design IT power across all ${rows.length} plans (every status), by plan type`} info="Every plan of every status, grouped by plan type: the upper bar is the number of plans, the lower bar the design IT power. Click a type to open the plan list filtered to it.">
          <BarRows labelWidth={180} items={[...byScope.entries()].sort((a, b) => b[1].kw - a[1].kw).map(([scope, c]) => ({ key: scope, label: SCOPE_LABEL[scope], values: { n: c.n, kw: c.kw }, onClick: () => setSp(new URLSearchParams({ tab: 'plans', scope }), { replace: true }), note: 'Click to list these plans.' }))}
            series={[{ key: 'n', label: 'Plans', color: SERIES[1], format: v => num(v) }, { key: 'kw', label: 'IT power', color: SERIES[0], format: v => kw(v) }]} />
        </Panel>
        <Panel title="Plans that need action" icon={I.TriangleAlert} count={attention.length} sub={counts.length ? counts.map(([k, n]) => `${n} ${ATTN[k].noun}`).join(' · ') : 'Nothing waiting'} info="Across every active plan: reviews waiting for you (the signed-in reviewer) and review requests or open review comments, pending decisions, stopped executions, open approval conditions that block the build, hard rule fails and long-lead items past their order date. Ranked by kind, then by size. Click a row to open the plan at the right tab."
          foot={attention.length > ATTN_SHOWN ? <Btn variant="ghost" size="sm" iconRight={allAttn ? I.ChevronUp : I.ChevronDown} onClick={() => setAllAttn(v => !v)}>{allAttn ? 'Show fewer' : `Show all ${attention.length}`}</Btn> : undefined}>
          {attention.length ? <ul className="pn-list pn-attn">{shownAttn.map((a, i) => <li key={`${a.r.id}-${a.kind}-${i}`}><button type="button" className="pn-rowbtn" onClick={() => nav(ATTN[a.kind].to?.(a.r.plan.id) ?? `/planning/plans/${a.r.plan.id}${ATTN[a.kind].tab ? `?tab=${ATTN[a.kind].tab}` : ''}`)}><span className="cell-2"><span className="pn-attn-head"><Chip tone={ATTN[a.kind].tone} size="xs" dot>{ATTN[a.kind].label}</Chip><b>{a.r.plan.title}</b><small className="mono" style={{ flex: 'none' }}>{a.r.plan.plnId}</small></span><small>{a.text}</small></span><I.ChevronRight size={15} className="muted" /></button></li>)}</ul>
            : <p className="vw-label">Nothing waiting: no pending decisions, stopped executions, open conditions, hard fails or late orders.</p>}
        </Panel>
      </div>
      <Panel title="Recently updated plans" icon={I.Clock} sub="The six latest changes: status, plan type, site type, IT power, CapEx and readiness" info="The six most recently changed plans. Click a plan to open it; All plans opens the full list with filters."
        actions={<Btn variant="ghost" size="sm" iconRight={I.ChevronRight} onClick={toPlans}>All {rows.length} plans</Btn>}>
        <div className="pn-recent">{recent.map(r => { const Ico = SCOPE_ICON[r.plan.scope]; const rp = r.ev.readinessPct; const dt = dcTypeName(r.plan.dcTypeKey); return (
          <button key={r.plan.id} type="button" className="pn-recent-card" onClick={() => nav(`/planning/plans/${r.plan.id}`)}>
            <span className="pn-recent-ico"><Ico size={16} /></span>
            <span className="pn-recent-main">
              <span className="pn-recent-top"><b>{r.plan.title}</b><PlanStatusChip s={r.plan.status} /></span>
              <small className="pn-recent-meta"><span className="mono">{r.plan.plnId}</span> · {r.site}</small>
              <span className="pn-recent-chips"><Chip tone="info" size="xs">{SCOPE_LABEL[r.plan.scope]}</Chip>{dt && <Chip tone="neutral" size="xs">{dt}</Chip>}</span>
              <span className="pn-recent-figs">
                <span><small>IT power</small><b>{kw(r.plan.designPowerKw)}</b></span>
                <span><small>CapEx</small><b>{money(r.plan.baseline?.capexTotal ?? r.capex)}</b></span>
                <span><small>Readiness</small><span className="pn-recent-ready"><i><em style={{ width: `${rp}%`, background: rp >= 80 ? 'var(--vw-color-emerald-500)' : 'var(--vw-color-amber-500)' }} /></i><b>{rp}%</b></span></span>
              </span>
              <span className="pn-recent-foot"><span><I.User size={11} />{r.plan.ownerName}</span><span><I.Clock size={11} />Updated {date(r.plan.updatedAt)}</span></span>
            </span>
          </button>); })}</div>
      </Panel>
    </div>
  );
}
