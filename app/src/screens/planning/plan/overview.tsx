/* Plan Overview (15-Oct-2026 cleanup): a real summary in the Delivery project page's dashboard rhythm — what and why, where the plan is in
   its life and what happens next, key dates, what needs attention (rules, late orders, conditions, decisions, review comments), the
   phases, the numbers (cost, capacity, readiness), inputs changed from the template and what the plan produces. The header and the status
   line carry the id, status and type, so nothing here repeats them. */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { Btn, Chip, Panel } from '../../../ui/kit';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation, ScheduleItem } from '../../../planner/lib/engine';
import { datedPhases } from '../../../planner/lib/engine';
import { COOLING_LABEL, type Blocker } from '../../../planner/lib/wizardModel';
import * as G from '../../../planner/lib/governance';
import { clockMs } from '../../../planner/compat/clock';
import { usePlanReviews, useReviewComments } from '../../../planner/lib/usePlanner';
import { requestState } from '../../../planner/lib/reviews';
import type { DeliveryProjectView } from '../../../api/types';
import { ASPECT_LABEL, SOURCE_LABEL, date, fmtValue, kw, money, num, pct } from '../common';
import { reviewUrl } from '../pack/review/lazy';
import { LifeTracker } from './header';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** A label for an input the template does not define (wizard bookkeeping such as targetHallId). */
const ACRO: Record<string, string> = { kw: 'kW', pue: 'PUE', it: 'IT', ups: 'UPS', ip: 'IP', mw: 'MW', bgp: 'BGP', dci: 'DCI' };
const humanKey = (k: string) => { const w = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/ Id$/, '').trim().toLowerCase().split(' ').map(x => ACRO[x] ?? x); const s = w.join(' '); return s.charAt(0).toUpperCase() + s.slice(1); };

interface Attn { k: string; tone: 'bad' | 'warn' | 'info'; title: ReactNode; sub?: ReactNode; tab?: string; to?: string }

export interface OverviewProps {
  plan: T.PlannerPlan; ev: Evaluation; template?: T.PlannerTemplate; deliverables?: ReactNode; delivery?: DeliveryProjectView | null;
  schedule: ScheduleItem[]; submitBlockers: Blocker[]; where: ReactNode; onTab: (t: string) => void;
}

export function PlanOverview({ plan, ev, template, deliverables, delivery, schedule, submitBlockers, where, onTab }: OverviewProps) {
  const now = clockMs();
  const reviews = usePlanReviews(plan.id); const comments = useReviewComments(plan.id);
  const s = plan.status;
  const phases = useMemo(() => datedPhases(plan), [plan]);
  const late = schedule.filter(x => x.late);
  const toOrder = schedule.filter(x => x.kind !== 'gate' && !x.late && x.status !== 'ordered' && x.source !== 'stock' && x.source !== 'site' && new Date(x.orderBy).getTime() >= now).sort((a, b) => a.orderBy.localeCompare(b.orderBy));
  const next = G.nextPendingStep(plan);
  const fails = ev.findings.filter(f => f.status === 'fail'), warns = ev.findings.filter(f => f.status === 'warn');
  const review = reviews.find(x => requestState(x, plan).open);
  const openComments = comments.filter(c => !c.parentId && c.status === 'Open');
  const openConds = (plan.conditions ?? []).filter(c => c.status === 'Open');

  /* ---- the next step in one line (matches the header's primary action) */
  const nextStep: ReactNode =
    plan.supersededBy ? <>Nothing: superseded by <Link className="ent-link mono" to={`/planning/plans/${plan.supersededBy}`}>{plan.supersededBy}</Link></>
    : s === 'Draft' || s === 'Rejected' ? (submitBlockers.length ? `Clear ${plural(submitBlockers.length, 'blocker')}, then submit for review` : 'Submit for review')
    : s === 'In review' ? (next ? `${next.step} decides (${next.person ?? next.role})` : 'Waiting for the decision')
    : s === 'Approved' ? (G.openBlockingConditions(plan).length ? 'Close the blocking conditions, then start the build' : 'Start the build: hand the plan to Delivery')
    : s === 'Executing' ? (delivery ? `Deliver ${delivery.project.id}; complete the plan once close-out is green` : 'Complete the plan once close-out is green')
    : s === 'On hold' ? 'Resume the plan' : s === 'Completed' ? 'Nothing: delivered' : 'Nothing: cancelled';

  /* ---- what needs attention, worst first */
  const attn: Attn[] = [
    // the lead-time rule and the late items say the same thing: keep the late items (they name the items)
    ...fails.filter(f => !(late.length && /lead|schedule|order/i.test(`${f.rule.check} ${f.rule.title}`))).map(f => ({ k: `f${f.rule.id}`, tone: 'bad' as const, title: f.rule.title, sub: f.detail, tab: 'rules' })),
    ...(late.length ? [{ k: 'late', tone: 'bad' as const, title: `${plural(late.length, 'item')} cannot arrive in time`, sub: `${late.slice(0, 2).map(x => `${x.item.replace(/^Permit · /, '')} (${x.phase})`).join(', ')}${late.length > 2 ? ` and ${late.length - 2} more` : ''}`, tab: 'schedule' }] : []),
    ...openConds.map(c => ({ k: `c${c.id}`, tone: c.blocksExecution ? 'bad' as const : 'warn' as const, title: `Condition: ${c.text}`, sub: `owner ${c.owner}${c.dueDate ? `, due ${date(c.dueDate)}` : ''}${c.blocksExecution ? ' · blocks the build' : ''}`, tab: 'approvals' })),
    ...(s === 'In review' && next ? [{ k: 'dec', tone: 'info' as const, title: `Decision due: ${next.step}`, sub: `${next.person ?? next.role}${next.basis ? ` · ${next.basis}` : ''}`, tab: 'approvals' }] : []),
    ...(openComments.length ? [{ k: 'rvc', tone: 'warn' as const, title: `${plural(openComments.length, 'open review comment')}`, sub: openComments.slice(0, 2).map(c => `${c.author}: ${c.text.length > 70 ? `${c.text.slice(0, 67)}…` : c.text}`).join(' · '), to: reviewUrl(plan.id) }] : review ? [{ k: 'rv', tone: 'info' as const, title: `Review ${review.revId} open`, sub: `sent ${date(review.requestedAt)} to ${review.reviewers.map(x => x.name).join(', ')}`, to: reviewUrl(plan.id) }] : []),
    ...((s === 'Draft' || s === 'Rejected') ? submitBlockers.filter(b => !fails.some(f => b.text.includes(f.rule.title))).slice(0, 3).map((b, i) => ({ k: `b${i}`, tone: 'warn' as const, title: b.text, sub: 'blocks submission', tab: 'rules' })) : []),
    ...warns.slice(0, 3).map(f => ({ k: `w${f.rule.id}`, tone: 'warn' as const, title: f.rule.title, sub: f.detail, tab: 'rules' })),
    ...(warns.length > 3 ? [{ k: 'wmore', tone: 'warn' as const, title: `${warns.length - 3} more rules to note`, tab: 'rules' }] : []),
  ];

  /* ---- key dates */
  const firstOrder = toOrder[0];
  const dates: [string, string | undefined, string?][] = [
    ['Needed by', plan.targetGoLive, 'target go-live'],
    ...(phases.length > 1 ? [['First go-live', phases[0].goLive, phases[0].name], ['Last go-live', phases[phases.length - 1].goLive, phases[phases.length - 1].name]] as [string, string, string][] : []),
    ['Next order by', firstOrder?.orderBy, firstOrder ? firstOrder.item.replace(/^Permit · /, '') : undefined],
    ['Submitted', plan.submittedAt, plan.submittedBy],
    ['Approved', plan.baseline?.at, plan.baseline?.by],
    ['Build started', plan.artefacts?.createdAt, delivery?.project.id],
    ['Updated', plan.updatedAt],
  ];

  /* ---- inputs changed from the template */
  const departures = useMemo(() => Object.entries(ev.params).filter(([k, x]) => (x.source === 'user' || x.source === 'ai' || x.source === 'document') && ev.resolved?.params.find(p => p.key === k)?.default !== x.value), [ev.params, ev.resolved]);
  const [allDep, setAllDep] = useState(false);
  const def = (k: string) => ev.resolved?.params.find(p => p.key === k);
  const lastLadder = ev.ladder[ev.ladder.length - 1];
  const weakest = [...ev.aspects].sort((a, b) => a.pct - b.pct).slice(0, 5);
  const e = ev.estimate;

  return (
    <div className="pn-dash">
      <Panel className="pn-span-8" title="What and why" icon={I.Compass} info="What was asked for and why, where the plan is in its life and what happens next.">
        {plan.intent && <p className="pn-intent">{plan.intent}</p>}
        <LifeTracker plan={plan} delivery={delivery} />
        <div className="pn-now">
          <span className="is-wide"><small>Next step</small><b>{nextStep}</b></span>
          <span><small>Where</small><b>{where}</b></span>
          <span><small>Owner</small><b>{plan.ownerName}</b></span>
          <span><small>Requested by</small><b>{plan.requestedBy}</b></span>
          <span><small>Template</small><b>{template?.name ?? plan.templateId}{template ? ` v${plan.templateVersion ?? template.version}` : ''}</b></span>
          {ev.sizing.itKw > 0 && <span><small>Workload</small><b>{plan.demand.gpuPct}% GPU · {plan.demand.computePct}% compute · {plan.demand.storagePct}% storage</b></span>}
          {ev.sizing.itKw > 0 && <span><small>Design</small><b>{String(ev.params.tier?.value ?? '—')} · {String(ev.params.redundancy?.value ?? '—')} · {COOLING_LABEL[ev.params.coolingType?.value as T.PlannerCoolingType] ?? String(ev.params.coolingType?.value ?? '—')}</b></span>}
        </div>
      </Panel>
      <Panel className="pn-span-4" title="Key dates" icon={I.CalendarDays}>
        <ul className="pn-dates">{dates.filter(d => d[1]).map(([l, t, n]) => <li key={l} className={new Date(t!).getTime() < now && l !== 'Needed by' ? 'is-past' : ''}><small>{l}</small><b>{date(t)}</b>{n && <em title={n}>{n}</em>}</li>)}</ul>
      </Panel>

      <Panel className="pn-span-6 pn-h-fill" title="Needs attention" icon={I.OctagonAlert} count={attn.length} info="Failing rules, items that cannot arrive in time, open approval conditions, a decision due, review comments, what blocks submission and the soft rules to note — worst first.">
        {attn.length ? <ul className="pn-attn-list">{attn.map(a => <li key={a.k} className={`is-${a.tone}`}><i />
          <span className="cell-2">{a.to ? <Link className="ent-link" to={a.to}><b>{a.title}</b></Link> : a.tab ? <button type="button" className="pn-linkbtn" onClick={() => onTab(a.tab!)}><b>{a.title}</b></button> : <b>{a.title}</b>}{a.sub && <small>{a.sub}</small>}</span></li>)}</ul>
          : <p className="vw-label" style={{ margin: 0 }}>Nothing needs attention: every rule passes and every order can arrive in time.</p>}
      </Panel>
      <Panel className="pn-span-6 pn-h-fill" title="Phases" icon={I.Flag} sub={`${plural(phases.length, 'phase')} · ${kw(phases.reduce((a, p) => a + p.itKw, 0))}`} actions={<button type="button" className="pn-linkbtn" onClick={() => onTab('schedule')}>Project plan →</button>} info="Each phase's go-live, IT load, racks and halls; adjust them on the Project plan tab.">
        <ol className="pn-phases">{phases.map(p => { const lateIn = late.filter(x => x.phaseId === p.id).length; return (
          <li key={p.id} className={p.status === 'Live' ? 'is-done' : p.status === 'In delivery' ? 'is-active' : ''}><i />
            <span className="cell-2"><b>{p.name}</b><small>{date(p.goLive)} · {kw(p.itKw)}{p.racks ? ` · ${num(p.racks)} racks` : ''}{p.halls ? ` · ${plural(p.halls, 'hall')}` : ''}{lateIn ? <span className="pn-bad"> · {lateIn} late</span> : null}</small></span>
            <Chip tone={p.status === 'Live' ? 'success' : p.status === 'In delivery' ? 'info' : 'neutral'} size="xs" dot>{p.status}</Chip></li>); })}</ol>
      </Panel>

      <Panel className="pn-span-4" title="Cost" icon={I.Wallet} actions={<button type="button" className="pn-linkbtn" onClick={() => onTab('cost')}>Cost →</button>}>
        <dl className="pn-ovfacts">
          <div><dt>{plan.baseline ? 'CapEx (baseline)' : 'CapEx'}</dt><dd>{money(plan.baseline?.capexTotal ?? e.capexTotal)}</dd></div>
          {e.capexPerKw > 0 && <div><dt>Per kW</dt><dd>{money(e.capexPerKw)}</dd></div>}
          <div><dt>OpEx a month</dt><dd>{money(e.opexMonthly)}</dd></div>
          <div><dt>Payback</dt><dd className={e.paybackMonths == null ? 'pn-warn' : undefined}>{e.paybackMonths == null ? 'none in the horizon' : `${e.paybackMonths} months`}</dd></div>
          {e.npvUsd !== undefined && <div><dt>NPV</dt><dd className={e.npvUsd < 0 ? 'pn-warn' : undefined}>{money(e.npvUsd)}</dd></div>}
          {plan.baseline && Math.abs(e.capexTotal - plan.baseline.capexTotal) > 1 && <div><dt>Now vs baseline</dt><dd>{money(e.capexTotal)}</dd></div>}
        </dl>
      </Panel>
      <Panel className="pn-span-4" title="Capacity" icon={I.Gauge} actions={<button type="button" className="pn-linkbtn" onClick={() => onTab('capacity')}>Capacity →</button>}>
        <dl className="pn-ovfacts">
          <div><dt>IT load</dt><dd>{ev.sizing.itKw > 0 ? kw(ev.sizing.itKw) : ev.estimate.capacityEnabledKw ? `${kw(ev.estimate.capacityEnabledKw)} made usable` : 'no IT load'}</dd></div>
          {ev.sizing.racks > 0 && <div><dt>Racks · halls</dt><dd>{num(ev.sizing.racks)} · {ev.sizing.halls}</dd></div>}
          <div><dt>PUE</dt><dd>{ev.sizing.pue.value}</dd></div>
          {lastLadder && <div><dt>Installed at the end</dt><dd>{kw(lastLadder.installedKw)}</dd></div>}
          {lastLadder && <div><dt>Usable headroom</dt><dd className={lastLadder.headroomKw < 0 ? 'pn-bad' : undefined}>{kw(lastLadder.headroomKw)} · {lastLadder.usablePct}%</dd></div>}
          <div><dt>Binds first</dt><dd>{ev.bindingConstraint === 'none' ? 'nothing' : ev.bindingConstraint}</dd></div>
        </dl>
      </Panel>
      <Panel className="pn-span-4" title="Readiness" icon={I.ListChecks} sub={`${pct(ev.readinessPct)} of inputs confirmed${ev.defaultsCount ? ` · ${ev.defaultsCount} on defaults` : ''}`} info="Share of each area's inputs confirmed by the planner, the requirements, a benchmark, an estate actual or a document; the five weakest areas.">
        <ul className="pn-ready">{weakest.map(a => <li key={a.aspect}><span>{ASPECT_LABEL[a.aspect]}</span><span className="pn-ready-bar"><i style={{ width: `${a.pct}%` }} className={a.pct >= 80 ? 'is-ok' : a.pct >= 50 ? 'is-warn' : 'is-bad'} /></span><small className="num">{a.answered}/{a.total}</small></li>)}</ul>
      </Panel>

      <Panel className="pn-span-12" title="Inputs changed from the template" icon={I.SlidersHorizontal} count={departures.length} flush={departures.length > 0}
        info="Every input whose value is not the template default: entered by the planner, proposed and accepted, or read from a document. Approvers read these first."
        actions={departures.length > 6 ? <Btn size="sm" variant="ghost" onClick={() => setAllDep(v => !v)}>{allDep ? 'Show fewer' : `Show all ${departures.length}`}</Btn> : undefined}>
        {departures.length === 0 ? <p className="vw-label" style={{ margin: 0 }}>Every input is at its template value.</p>
          : <table className="nst-table" style={{ width: '100%' }}><thead><tr><th>Input</th><th>Value</th><th>Template</th><th>Set by</th></tr></thead><tbody>{(allDep ? departures : departures.slice(0, 6)).map(([k, x]) => { const d = def(k); return <tr key={k}><td>{d?.label ?? humanKey(k)}</td><td className="num strong-num">{fmtValue(x.value, d?.unit)}</td><td className="num vw-label">{d?.default !== undefined ? fmtValue(d.default, d.unit) : '—'}</td><td>{SOURCE_LABEL[x.source]}</td></tr>; })}</tbody></table>}
      </Panel>
      <Panel className="pn-span-12" title="What the plan produces" icon={I.Package} actions={<button type="button" className="pn-linkbtn" onClick={() => onTab('pack')}>Plan pack →</button>} info="The outputs the template defines (the Plan pack shows each one), and what execution creates in Delivery.">
        {deliverables ?? <div className="row wrap" style={{ gap: 6 }}>{(template?.outputs ?? []).map(o => <Chip key={o} tone="neutral">{o}</Chip>)}</div>}
      </Panel>
    </div>
  );
}
