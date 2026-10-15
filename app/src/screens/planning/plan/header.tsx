/* Plan page header parts (15-Oct-2026, user: "make the plan drill-down cleaner, like the other UX in our product"), in the rhythm of the
   Delivery project page: under PageHead one calm status line (what state the plan is in, what it waits on, where its build lives, an open
   review, an open revision — the old stack of up to five banners), then one hero strip (a ring + five figures) instead of a seven-tile
   strip and a separate "Showing" row. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import type { Evaluation } from '../../../planner/lib/engine';
import * as G from '../../../planner/lib/governance';
import { requestState } from '../../../planner/lib/reviews';
import { usePlanReviews, usePlans, useReviewComments } from '../../../planner/lib/usePlanner';
import type { DeliveryProjectView } from '../../../api/types';
import { date, kw, money, pct } from '../common';
import { projectUrl } from '../pack/records';
import { reviewUrl } from '../pack/review/lazy';
import { openRevisionOf } from './edit/policy';

type Go = (tab: string) => void;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const linkBtn = (label: ReactNode, onClick: () => void) => <button type="button" className="pn-linkbtn" onClick={onClick}>{label}</button>;

/** One line under the header: the plan's state in words, then what needs the reader (links into the tabs or other screens). */
export function PlanStatusLine({ plan, template, delivery, blockersN, closeout, onTab }: { plan: T.PlannerPlan; template?: T.PlannerTemplate; delivery?: DeliveryProjectView | null; blockersN: number; closeout?: { done: number; total: number }; onTab: Go }) {
  const plans = usePlans();
  const reviews = usePlanReviews(plan.id); const comments = useReviewComments(plan.id);
  const review = reviews.find(x => requestState(x, plan).open);
  const openComments = comments.filter(c => !c.parentId && c.status === 'Open').length;
  const s = plan.status;
  const rev = openRevisionOf(plan, plans);
  const editsGo = rev ? (rev.status === 'In review' ? `revision ${rev.revision} is in review` : `edits go into revision ${rev.revision}`) : `edits draft revision ${G.nextRevisionLetter(plan.revision)}`;
  const next = G.nextPendingStep(plan);
  const blocking = G.openBlockingConditions(plan);
  const lastRound = plan.approvalHistory?.[plan.approvalHistory.length - 1];
  const parts: { k: string; warn?: boolean; node: ReactNode }[] = [];
  // the state, in one sentence
  const lead: ReactNode =
    plan.supersededBy ? <>Superseded by <Link className="ent-link mono" to={`/planning/plans/${plan.supersededBy}`}>{plan.supersededBy}</Link>; kept read-only for the record</>
    : s === 'Draft' ? <>Draft{plan.revisionOf ? <> · revision {plan.revision} of <Link className="ent-link mono" to={`/planning/plans/${plan.revisionOf}`}>{plan.revisionOf}</Link>, it supersedes the parent once approved</> : ''} · changes save straight to the plan</>
    : s === 'Rejected' ? <>Rejected{lastRound ? ` in round ${lastRound.round}` : ''}{(() => { const r = lastRound?.approvals.find(a => a.decision === 'Rejected'); return r ? ` by ${r.person ?? r.role}${r.reason ? `: “${r.reason}”` : ''}` : ''; })()} · change it and resubmit</>
    : s === 'In review' ? <>In review{next ? <>, waiting for <b>{next.step}</b>{next.person ? ` (${next.person})` : ''}</> : ''} · edits withdraw it to Draft first</>
    : s === 'Approved' ? <>Approved{plan.baseline ? ` ${date(plan.baseline.at)}` : ''} · baseline frozen; {editsGo}{plan.revisionOf ? <> · supersedes <Link className="ent-link mono" to={`/planning/plans/${plan.revisionOf}`}>{plan.revisionOf}</Link></> : ''}</>
    : s === 'Executing' ? <>In delivery · baseline frozen; {editsGo}</>
    : s === 'Completed' ? <>Completed{plan.closeout ? ` ${date(plan.closeout.completedAt)}` : ''} · the record of what was delivered</>
    : s === 'On hold' ? <>On hold{plan.holdReason ? `: ${plan.holdReason}` : ''} · resume it to carry on</>
    : s === 'Cancelled' ? <>Cancelled{plan.cancelReason ? `: ${plan.cancelReason}` : ''}</>
    : <>{s}</>;
  if (rev) parts.push({ k: 'rev', node: <>Revision {rev.revision} is open ({rev.status.toLowerCase()}): <Link className="ent-link mono" to={`/planning/plans/${rev.id}`}>{rev.plnId}</Link></> });
  if ((s === 'Draft' || s === 'Rejected') && blockersN > 0) parts.push({ k: 'blk', warn: true, node: <>{plural(blockersN, 'item')} block submission · {linkBtn('Rules', () => onTab('rules'))}</> });
  if (blocking.length && (s === 'Approved' || s === 'Executing')) parts.push({ k: 'cond', warn: true, node: <>{plural(blocking.length, 'condition')} block the build · {linkBtn('Approvals', () => onTab('approvals'))}</> });
  const drift = G.templateDrift(plan, template);
  if (drift) parts.push({ k: 'drift', warn: true, node: <>Template moved v{drift.from} → v{drift.to}; a revision adopts it</> });
  if (delivery) parts.push({ k: 'dl', node: <>Build in Delivery as <Link className="ent-link mono" to={projectUrl(plan)}>{delivery.project.id}</Link> ({delivery.project.state.toLowerCase()}, {delivery.project.health}) · <Link className="ent-link" to={projectUrl(plan, 'workorders')}>{plural(delivery.workOrders.length, 'work order')}</Link> · <Link className="ent-link" to={projectUrl(plan, 'procurement')}>{plural(delivery.pos.length, 'purchase order')}</Link>{delivery.workOrders[0] ? <> · <Link className="ent-link mono" to={`/changes/${delivery.workOrders[0].changeId}`}>{delivery.workOrders[0].changeId}</Link>{delivery.workOrders.length > 1 ? ` +${delivery.workOrders.length - 1}` : ''}</> : null}</> });
  if (closeout && s === 'Executing') parts.push({ k: 'close', node: <>Close-out {closeout.done} of {closeout.total} checks</> });
  if (review) parts.push({ k: 'rv', node: <>Review <b>{review.revId}</b> sent {date(review.requestedAt)} to {review.reviewers.map(x => x.name).join(', ')} · {openComments ? plural(openComments, 'open comment') : 'no open comments'} · <Link className="ent-link" to={reviewUrl(plan.id)}>Open the review page</Link></> });
  const warn = parts.some(p => p.warn) || s === 'On hold' || s === 'Rejected';
  const Icon = plan.supersededBy || ['Completed', 'Cancelled'].includes(s) ? I.Lock : s === 'Draft' ? I.PencilLine : s === 'In review' ? I.ClipboardCheck : s === 'On hold' ? I.Pause : s === 'Rejected' ? I.Undo2 : I.ShieldCheck;
  return (
    <div className={`note pn-status ${warn ? 'note--warn' : 'note--info'}`} role="status">
      <Icon size={15} />
      <span className="pn-status-text">
        <span className="pn-status-lead">{lead}</span>
        {parts.map(p => <span key={p.k} className={`pn-status-part${p.warn ? ' is-warn' : ''}`}>{p.warn && <I.TriangleAlert size={13} />}{p.node}</span>)}
      </span>
    </div>
  );
}

/** The hero strip: a ring (readiness while planning, the build's progress in delivery) and five figures; each figure opens its tab. */
export function PlanHero({ plan, ev, lateN, delivery, onTab }: { plan: T.PlannerPlan; ev: Evaluation; lateN: number; delivery?: DeliveryProjectView | null; onTab: Go }) {
  const building = !!delivery && ['Executing', 'Completed'].includes(plan.status);
  const ringPct = building ? Math.round(delivery!.project.progress * 100) : Math.round(ev.readinessPct);
  const r = 34, c = 2 * Math.PI * r;
  const ringTone = building ? (delivery!.project.health === 'late' ? 'red' : delivery!.project.health === 'at risk' ? 'amber' : 'green') : ringPct >= 80 ? 'green' : ringPct >= 50 ? 'amber' : 'red';
  const e = ev.estimate;
  const capex = plan.baseline?.capexTotal ?? e.capexTotal;
  const fig = (key: string, label: string, value: ReactNode, sub: ReactNode, tab: string, tone?: 'bad' | 'warn', info?: string) => (
    <button type="button" key={key} className="pn-hero-f" onClick={() => onTab(tab)} title={info}>
      <small>{label}</small><b className={tone ? `is-${tone}` : undefined}>{value}</b><em className={tone === 'bad' ? 'is-bad' : undefined}>{sub}</em>
    </button>
  );
  return (
    <section className="pn-hero" aria-label="Plan figures">
      <button type="button" className="pn-hero-ring" onClick={() => onTab(building ? 'delivery' : 'rules')} title={building ? 'Share of the build done in Delivery' : 'Share of inputs confirmed by the planner, the requirements, a benchmark, an actual or a document'}>
        <svg width={84} height={84} aria-hidden><circle cx={42} cy={42} r={r} className="pn-ring-bg" />{ringPct > 0 && <circle cx={42} cy={42} r={r} className={`pn-ring-fg is-${ringTone}`} strokeDasharray={`${(c * ringPct) / 100} ${c}`} transform="rotate(-90 42 42)" />}</svg>
        <span><b>{ringPct}%</b><small>{building ? 'built' : 'ready'}</small></span>
      </button>
      {fig('kw', 'IT capacity', ev.sizing.itKw > 0 ? kw(ev.sizing.itKw) : e.capacityEnabledKw ? kw(e.capacityEnabledKw) : 'No IT load', ev.sizing.racks ? `${plural(ev.sizing.racks, 'rack')}${ev.sizing.halls ? ` · ${plural(ev.sizing.halls, 'hall')}` : ''}` : e.capacityEnabledKw ? `${ev.sizing.itKw > 0 ? `${kw(e.capacityEnabledKw)} ` : ''}made usable` : ev.sizing.itKw > 0 ? 'no new racks' : 'network or works only', 'sizing', undefined, 'Design IT power and the racks and halls it takes at the chosen density')}
      {fig('capex', plan.baseline ? 'CapEx (baseline)' : 'CapEx', money(capex), e.capexPerKw > 0 ? `${money(e.capexPerKw)} per kW` : `OpEx ${money(e.opexMonthly)} a month`, 'cost', undefined, 'Plant and fit-out from benchmarks or the bill of materials, plus owned IT; the frozen baseline once approved')}
      {fig('pay', 'Payback', e.paybackMonths == null ? 'No payback' : `${e.paybackMonths} months`, e.npvUsd !== undefined ? `NPV ${money(e.npvUsd)}${e.irrPct != null ? ` · IRR ${pct(e.irrPct)}` : ''}` : 'no cash flow', 'cost', e.paybackMonths == null || e.paybackMonths > 96 ? 'warn' : undefined, 'Months from the first spend until the cumulative cash flow turns positive')}
      {fig('go', 'Needed by', date(plan.targetGoLive), lateN ? `${plural(lateN, 'item')} late` : 'every order on time', 'schedule', lateN ? 'bad' : undefined, 'The date the capacity is needed; late items cannot arrive by then at their lead time')}
      {fig('rules', 'Rule checks', ev.hardFails ? `${ev.hardFails} failing` : ev.softWarns ? `${ev.softWarns} to note` : 'All pass', `${ev.findings.length} checked`, 'rules', ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : undefined, 'Hard rules must pass before submission; soft rules are acknowledged in the review')}
    </section>
  );
}

/** Where the plan is in its life: Draft → In review → Approved → In delivery → Completed (Overview). */
export const LIFE = ['Draft', 'In review', 'Approved', 'In delivery', 'Completed'] as const;
export function LifeTracker({ plan, delivery }: { plan: T.PlannerPlan; delivery?: DeliveryProjectView | null }) {
  const s = plan.status === 'Rejected' ? 'Draft' : plan.status === 'Executing' ? 'In delivery' : plan.status === 'On hold' ? (plan.statusBeforeHold === 'Executing' ? 'In delivery' : plan.statusBeforeHold ?? 'Draft') : plan.status;
  const i = Math.max(0, LIFE.indexOf(s as (typeof LIFE)[number]));
  const sub: Record<string, string | undefined> = {
    Draft: plan.status === 'Rejected' ? 'rejected, to rework' : plan.status === 'Draft' ? 'being planned' : undefined,
    'In review': plan.status === 'In review' ? `round ${G.currentRound(plan)}${plan.submittedAt ? ` · ${date(plan.submittedAt)}` : ''}` : undefined,
    Approved: plan.baseline ? date(plan.baseline.at) : undefined,
    'In delivery': delivery ? `${Math.round(delivery.project.progress * 100)}% built` : undefined,
    Completed: plan.status === 'Completed' ? 'handed over' : undefined,
  };
  return (
    <ol className="pn-life">{LIFE.map((x, k) => (
      <li key={x} className={k < i || (k === i && plan.status === 'Completed') ? 'is-done' : k === i ? (plan.status === 'Cancelled' ? 'is-off' : 'is-on') : ''}>
        <span className="pn-life-dot">{k < i || (k === i && plan.status === 'Completed') ? <I.Check size={13} /> : k + 1}</span><b>{x}</b>{sub[x] && (k <= i) && <small>{sub[x]}</small>}
      </li>))}</ol>
  );
}
