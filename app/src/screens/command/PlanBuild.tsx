/* Command center — plan and build (14-Oct-2026, gap round 2; content and wording from DCOS src/ops/screens/command/sections.tsx).
   - PlanBuildStrip: one slim card above the operations hero with the Plan and Build stage summaries and the capacity pipeline.
   - PlanBuildLens: the "Plan & build" lens (?lens=build): the strip, the capacity pipeline with its items, decisions waiting,
     the week ahead and Delivery's projects.
   - planDecisionRecs: plan approvals and late long-lead orders for the Recommendations list.
   Data: the planner store (usePlans, useEstate) and Delivery (getDelivery), through the hooks the planner and Delivery screens use. */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { clockNow, getDelivery, useQuery } from '../../api';
import { usePlans, useEstate } from '../../planner/lib/usePlanner';
import { Info, Panel } from '../../ui/kit';
import { fmtDate, fmtDow, fmtNum, fmtShortDate } from '../../lib/format';
import {
  APPROVAL_SLA_DAYS, CAP_STAGE_COLOR, LONG_LEAD_WEEKS, WEEK_DAYS, WEEK_LABEL, byDay, fmtMw, planBuild,
  type CapStage, type CapacityPipeline, type Decision, type PlanBuild, type WeekEvent, type WeekType,
} from './pbModel';
import '../../styles/command-plan.css';
/* progress as a whole percentage (Delivery reports fractions of a percent); under 1% but started reads "<1%" */
const pctTxt = (v: number) => (v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`);

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;
const C = { muted: 'var(--vw-color-slate-300)', soft: 'var(--primaryColor200)', mid: 'var(--primaryColor400)', deep: 'var(--primaryColor700)', ok: 'var(--primaryColor300)', warn: 'var(--vw-color-amber-400)', bad: 'var(--vw-color-red-500)' };

/** The plan and build figures, recomputed whenever the planner or Delivery changes. */
export function usePlanBuild(): PlanBuild | undefined {
  const plans = usePlans();
  const { dataCenters } = useEstate();
  const { data: delivery } = useQuery(getDelivery, []);
  const now = clockNow();
  return useMemo(() => (delivery ? planBuild({ plans, sites: dataCenters, delivery, now }) : undefined), [plans, dataCenters, delivery, now]);
}

/* ------------------------------------------------------------------ bars with a floating tip */
type Seg = { key: string; value: number; color: string; tip: string };
function Bar({ parts, height = 8, label }: { parts: Seg[]; height?: number; label: string }) {
  const shown = parts.filter(p => p.value > 0);
  return (
    <span className="pb-bar" style={{ height }} role="img" aria-label={label}>
      {shown.map(p => <i key={p.key} data-tip={p.tip} style={{ flexGrow: p.value, background: p.color }} />)}
      {!shown.length && <i style={{ flexGrow: 1, background: 'var(--vw-color-slate-100)' }} />}
    </span>
  );
}
const capParts = (cap: CapacityPipeline): Seg[] => cap.stages.map(s => ({ key: s.stage, value: s.kw, color: CAP_STAGE_COLOR[s.stage], tip: `${s.label}: ${fmtMw(s.kw)} · ${plural(s.items.length, 'item')}` }));

/* ------------------------------------------------------------------ strip */
function StripSeg({ icon: Ic, name, to, info, metric, unit, sub, subTitle, bar, att, tone, attTo, slim }: {
  icon: I.LucideIcon; name: string; to: string; info: string; metric: ReactNode; unit: string; sub: ReactNode; subTitle?: string; bar: ReactNode; att: string; tone: 'ok' | 'warn' | 'bad'; attTo?: string; slim?: boolean;
}) {
  const attBody = <>{tone === 'ok' ? <I.CircleCheck size={13} /> : <I.CircleAlert size={13} />}<span>{att}</span></>;
  // slim (one row): the bar sits in the row and the attention line becomes a flag with a floating tip, shown only when it is not ok
  const flag = tone === 'ok' ? null : attTo ? <Link to={attTo} className={`pb-seg-flag is-${tone}`} data-tip={att} aria-label={att}><I.CircleAlert size={14} /></Link> : <span className={`pb-seg-flag is-${tone}`} data-tip={att} aria-label={att}><I.CircleAlert size={14} /></span>;
  return (
    <div className={`pb-seg${slim ? ' is-slim' : ''}`}>
      <div className="pb-seg-head">
        <span className="pb-seg-ic"><Ic size={15} /></span>
        <Link to={to} className="pb-seg-name">{name}</Link>
        <Info text={info} />
        <span className="pb-seg-metric"><span className="pb-seg-n">{metric}</span><span className="pb-seg-unit">{unit}</span></span>
        {slim && <span className="pb-seg-minibar">{bar}</span>}
        {slim && flag}
        {!slim && <Link to={to} className="pb-seg-go" aria-label={`Open ${name.toLowerCase()}`}><I.ArrowUpRight size={14} /></Link>}
      </div>
      {!slim && <>
        <div className="pb-seg-sub" title={subTitle}>{sub}</div>
        {bar}
        {attTo ? <Link to={attTo} className={`pb-seg-att is-${tone}`}>{attBody}</Link> : <span className={`pb-seg-att is-${tone}`}>{attBody}</span>}
      </>}
    </div>
  );
}

/* the ops view's strip opens as one slim row so the hero stays above the fold (1280 × 800); "More" shows the full strip, remembered */
const STRIP_KEY = 'dco.cc.planBuildStrip';
const readOpen = () => { try { return localStorage.getItem(STRIP_KEY) === 'open'; } catch { return false; } };
const saveOpen = (v: boolean) => { try { localStorage.setItem(STRIP_KEY, v ? 'open' : 'slim'); } catch { /* storage blocked: stays for this view */ } };

export function PlanBuildStrip({ pb, lensTo, collapsible }: { pb: PlanBuild; lensTo: string; collapsible?: boolean }) {
  const { plan: p, build: b, capacity: cap } = pb;
  const [open, setOpen] = useState(() => !collapsible || readOpen());
  const slim = !!collapsible && !open;
  const n = p.next;
  const live = cap.stages.find(s => s.stage === 'live')!;
  const notLive = cap.stages.filter(s => s.stage !== 'live' && s.kw > 0);
  const stageLine = `${[...notLive, live].map(s => `${fmtMw(s.kw).replace(' MW', '')} ${s.label.toLowerCase()}`).join(' · ')} MW`;
  const nextGoLive = [...pb.week, ...pb.later].find(e => e.type === 'golive' || e.type === 'handover');
  return (
    <section className={`vw-card-section pb-strip${collapsible ? ' is-collapsible' : ''}${slim ? ' is-slim' : ''}`} aria-label="Plan and build">
      <StripSeg icon={I.DraftingCompass} name="Plan" to="/planning" tone={n ? (n.overdue ? 'warn' : 'ok') : 'ok'}
        info="Plans in the planner: how many wait for an approval, the design power of the capacity plans still in planning (draft, in review, approved), the status split, and the approval step that has waited longest. Click the line at the bottom to open that plan's approvals."
        metric={p.inReview} unit={slim ? 'in review' : p.inReview === 1 ? 'plan in review' : 'plans in review'} sub={<><b>{fmtMw(p.pipelineKw)}</b> in the planning pipeline</>}
        bar={<Bar label="Plans by status" parts={[
          { key: 'd', value: p.byStatus.Draft, color: C.muted, tip: `Draft: ${p.byStatus.Draft}` }, { key: 'r', value: p.byStatus['In review'], color: C.soft, tip: `In review: ${p.byStatus['In review']}` },
          { key: 'a', value: p.byStatus.Approved, color: C.mid, tip: `Approved: ${p.byStatus.Approved}` }, { key: 'e', value: p.byStatus.Executing, color: C.deep, tip: `Executing: ${p.byStatus.Executing}` }]} />}
        subTitle={`${p.byStatus.Draft} draft · ${p.byStatus['In review']} in review · ${p.byStatus.Approved} approved · ${p.byStatus.Executing} executing`}
        attTo={n?.to} att={n ? `${n.step.role} to approve ${n.plan.plnId ?? n.plan.id} · ${n.days === 0 ? 'today' : `${n.days} d`}` : 'No plan waiting for approval'} slim={slim} />
      <StripSeg icon={I.HardHat} name="Build" to="/delivery" tone={b.health.late ? 'bad' : b.health['at risk'] || b.longLeadLate ? 'warn' : 'ok'}
        info="Delivery's open projects (one per approved or executing plan) by health: late = the project's own schedule finishes after its target or it is under 90% of planned progress; at risk = slipping. The line at the bottom names the project that needs attention first."
        metric={b.open} unit={slim ? 'in flight' : b.open === 1 ? 'project in flight' : 'projects in flight'}
        sub={<><b>{b.health['on track']}</b> on track · <b className={b.health['at risk'] ? 'pb-warn' : undefined}>{b.health['at risk']}</b> at risk · <b className={b.health.late ? 'pb-hot' : undefined}>{b.health.late}</b> late</>}
        bar={<Bar label="Projects by health" parts={[
          { key: 'ok', value: b.health['on track'], color: C.ok, tip: `On track: ${b.health['on track']}` }, { key: 'risk', value: b.health['at risk'], color: C.warn, tip: `At risk: ${b.health['at risk']}` }, { key: 'late', value: b.health.late, color: C.bad, tip: `Late: ${b.health.late}` }]} />}
        subTitle={`${plural(b.woOpen, 'open work order')} · ${plural(b.longLeadOpen, 'long-lead order')} open`}
        attTo={b.worst ? `/delivery/projects/${b.worst.project.id}` : undefined}
        att={b.worst ? `${b.worst.reasons[0]}: ${b.worst.project.name}` : b.open ? 'Every project on track' : 'No project in delivery'} slim={slim} />
      <StripSeg icon={I.Gauge} name={slim ? 'Capacity' : 'Capacity pipeline'} to={lensTo} tone="ok"
        info={`Design power from plan to live, in MW: planned (draft or in review plans, planned sites) → approved → in build (executing) → commissioning → live (sites in service). Hover a segment for its MW; open the Plan & build view for the items in each stage.`}
        metric={fmtMw(cap.totalKw - live.kw).replace(' MW', '')} unit="MW not live"
        sub={stageLine} subTitle={`${stageLine} · ${cap.notLivePct}% of ${fmtMw(cap.totalKw)} not live yet`}
        bar={<Bar label="Capacity by stage" parts={capParts(cap)} />}
        attTo={nextGoLive?.to} att={nextGoLive ? `Next: ${nextGoLive.label} · ${fmtShortDate(nextGoLive.at)}` : 'No go-live or handover scheduled'} slim={slim} />
      {collapsible && <button type="button" className="pb-strip-toggle" aria-expanded={open} onClick={() => { setOpen(!open); saveOpen(!open); }} data-tip={open ? 'Show as one row' : 'Show the details'}>
        {open ? <I.ChevronUp size={15} /> : <I.ChevronDown size={15} />}<span>{open ? 'Less' : 'More'}</span></button>}
    </section>
  );
}

/* ------------------------------------------------------------------ decisions for the Recommendations list */
export interface PlanRec { key: string; rank: string; title: string; why: string; to: string; cta: string; hot: boolean; kind: Decision['kind'] }
export function planDecisionRecs(pb: PlanBuild | undefined): PlanRec[] {
  if (!pb) return [];
  return pb.decisions.filter(d => d.kind === 'plan' || d.kind === 'order').map(d => ({
    key: d.key, kind: d.kind, hot: d.hot, to: d.to, title: d.what,
    rank: d.kind === 'plan' ? `plan approval · waiting ${d.when}` : `long-lead order · ${d.when}`,
    why: [d.who, d.where].filter(Boolean).join(' · '), cta: d.kind === 'plan' ? 'Review plan' : 'Open order',
  }));
}

/* ------------------------------------------------------------------ lens panels */
function CapacityPanel({ cap }: { cap: CapacityPipeline }) {
  const [sel, setSel] = useState<CapStage>(() => (cap.stages.find(s => s.stage === 'build' && s.items.length) ? 'build' : cap.stages.find(s => s.stage !== 'live' && s.items.length)?.stage ?? 'live'));
  const cur = cap.stages.find(s => s.stage === sel)!;
  return (
    <Panel className="pb-cap" title="Capacity pipeline" sub="Design power from plan to live" icon={I.Gauge}
      info="Every capacity plan at its stage (planned = draft or in review, approved, in build = executing, commissioning = its Delivery project is commissioning or at handover) and every site at its own: planned sites as planned, sites in service as live. Refreshes, migrations and network plans add no MW. Click a stage to list what is in it."
      actions={<><Link to="/planning?tab=plans" className="panel-link">Plans<I.ChevronRight size={14} /></Link><Link to="/delivery?tab=projects" className="panel-link">Projects<I.ChevronRight size={14} /></Link></>}
      foot={<span>{fmtMw(cap.totalKw)} from plan to live · {cap.notLivePct}% not live yet</span>}>
      <Bar label="Capacity by stage" height={10} parts={capParts(cap)} />
      <div className="pb-stages" role="tablist">
        {cap.stages.map(s => (
          <button key={s.stage} type="button" role="tab" aria-selected={sel === s.stage} className={`pb-stage${sel === s.stage ? ' is-active' : ''}`} onClick={() => setSel(s.stage)}>
            <span className="pb-stage-l"><i style={{ background: CAP_STAGE_COLOR[s.stage] }} />{s.label}</span>
            <span className="pb-stage-v">{fmtMw(s.kw)}</span>
            <span className="pb-stage-n">{plural(s.items.length, 'item')}</span>
          </button>
        ))}
      </div>
      <div className="pb-cap-detail">
      <div className="pb-list-h"><span className="vw-card-activity-label">{cur.label} · {fmtMw(cur.kw)}</span><Link to={cur.to} className="panel-link">Open the list<I.ChevronRight size={14} /></Link></div>
      <div className="pb-items">
        {cur.items.map(it => (
          <Link key={it.key} to={it.to} className="pb-item">
            <span className="pb-item-ic">{it.kind === 'plan' ? <I.DraftingCompass size={14} /> : <I.Building2 size={14} />}</span>
            <span className="pb-item-main"><b>{it.label}</b><small>{it.sub}</small></span>
            <span className="pb-num">{it.kw ? fmtMw(it.kw) : '—'}</span>
          </Link>
        ))}
        {!cur.items.length && <div className="pb-empty">Nothing at this stage.</div>}
      </div>
      </div>
    </Panel>
  );
}

const DEC_ICON: Record<Decision['kind'], I.LucideIcon> = { plan: I.Stamp, order: I.PackageX, start: I.Play };
function DecisionsPanel({ pb }: { pb: PlanBuild }) {
  const starts: Decision[] = pb.plan.waiting.map(p => ({ key: `start:${p.id}`, kind: 'start', what: `Start the build: ${p.plnId ?? p.id} ${p.title}`, where: p.dataCenterId ?? p.newSiteName ?? '', who: `Approved · go-live ${fmtDate(new Date(p.targetGoLive).getTime())}`, when: '', hot: false, to: `/planning/plans/${p.id}`, since: 0 }));
  const rows = [...pb.decisions, ...starts];
  const nApr = pb.decisions.filter(d => d.kind === 'plan').length, nOrd = pb.decisions.filter(d => d.kind === 'order').length;
  return (
    <Panel className="pb-dec" title="Waiting on a decision" icon={I.Stamp} count={rows.length}
      sub={[nApr && plural(nApr, 'plan approval'), nOrd && plural(nOrd, 'late long-lead order'), starts.length && `${plural(starts.length, 'approved plan')} to start`].filter(Boolean).join(' · ') || 'Approvals, late long-lead orders and builds to start'}
      info={`The approval step each plan in review waits on (oldest first; over ${APPROVAL_SLA_DAYS} days is overdue), long-lead orders (${LONG_LEAD_WEEKS} weeks or more) whose order-by day or delivery date has passed, and approved plans whose build has not been started. Click a row to open the plan's approvals, the project's purchase orders or the plan.`}
      actions={<Link to="/planning?tab=plans&status=In%20review" className="panel-link">In review<I.ChevronRight size={14} /></Link>}>
      <div className="pb-rows">
        {rows.map(x => { const Ic = DEC_ICON[x.kind]; return (
          <Link key={x.key} to={x.to} className="pb-row">
            <span className="pb-row-ic"><Ic size={15} /></span>
            <span className="pb-row-main"><b>{x.what}</b><small>{[x.who, x.where].filter(Boolean).join(' · ')}</small></span>
            {x.when && <span className={`pb-row-when${x.hot ? ' is-hot' : ''}`}>{x.when}</span>}
          </Link>
        ); })}
        {!rows.length && <div className="pb-empty"><I.CircleCheck size={14} />Nothing waiting on a decision.</div>}
      </div>
    </Panel>
  );
}

const WEEK_ICON: Record<WeekType, I.LucideIcon> = { golive: I.Rocket, handover: I.Flag, test: I.ClipboardCheck, work: I.Wrench, order: I.ShoppingCart, delivery: I.Truck };
const dayName = (key: string, day: number) => (key === 'd0' ? 'Today' : key === 'd1' ? 'Tomorrow' : fmtDow(day));
function Agenda({ events, now, perDay = 4, later }: { events: WeekEvent[]; now: number; perDay?: number; later?: boolean }) {
  const groups = useMemo(() => byDay(events, now), [events, now]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  return (
    <>
      {groups.map(g => {
        const all = open.has(g.key), shown = all ? g.events : g.events.slice(0, perDay);
        return (
          <div key={g.key} className={`pb-day${g.key === 'd0' ? ' is-today' : ''}`}>
            <div className="pb-day-h"><b>{later ? fmtShortDate(g.day) : dayName(g.key, g.day)}</b><span>{later ? fmtDow(g.day) : fmtShortDate(g.day)}</span></div>
            {shown.map(e => { const Ic = WEEK_ICON[e.type]; return (
              <Link key={e.key} to={e.to} className="pb-ev">
                <span className={`pb-ev-ic${e.tone === 'warning' ? ' is-warn' : ''}`}><Ic size={14} /></span>
                <span className="pb-ev-main"><b>{e.label}</b><small>{WEEK_LABEL[e.type]} · {e.sub}</small></span>
              </Link>
            ); })}
            {g.events.length > perDay && <button type="button" className="pb-more" onClick={() => setOpen(s => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>{all ? 'Show fewer' : `+${g.events.length - perDay} more`}</button>}
          </div>
        );
      })}
    </>
  );
}
function WeekPanel({ pb }: { pb: PlanBuild }) {
  const count = (t: WeekType[]) => pb.week.filter(e => t.includes(e.type)).length;
  const later = pb.later.slice(0, 6);
  return (
    <Panel className="pb-week" title="Week ahead" icon={I.CalendarDays} count={pb.week.length}
      sub={[count(['golive']) && plural(count(['golive']), 'go-live'), count(['handover', 'test']) && plural(count(['handover', 'test']), 'handover or test', 'handovers or tests'), count(['work']) && plural(count(['work']), 'work order') + ' starting', count(['order', 'delivery']) && `${plural(count(['order', 'delivery']), 'long-lead order')} due`].filter(Boolean).join(' · ') || 'Go-lives, handovers, tests and long-lead orders'}
      info={`Today and the next ${WEEK_DAYS - 1} days: go-lives of approved and executing plans, Delivery handovers and commissioning tests, work orders starting, and long-lead orders (${LONG_LEAD_WEEKS} weeks or more) to place or due for delivery. After the week, the next few dates.`}
      actions={<Link to="/delivery" className="panel-link">Delivery<I.ChevronRight size={14} /></Link>}>
      <div className="pb-agenda">
        <Agenda events={pb.week} now={pb.now} />
        {!pb.week.length && <div className="pb-empty"><I.CircleCheck size={14} />Nothing due in the next {WEEK_DAYS} days.</div>}
        {later.length > 0 && <>
          <div className="pb-later-h vw-card-activity-label">Coming up after this week</div>
          <Agenda events={later} now={pb.now} perDay={2} later />
        </>}
      </div>
    </Panel>
  );
}

const HEALTH_CHIP: Record<string, string> = { 'on track': 'success', 'at risk': 'warning', late: 'error' };
function ProjectsPanel({ pb }: { pb: PlanBuild }) {
  const b = pb.build;
  return (
    <Panel className="pb-proj" title="Projects in delivery" icon={I.HardHat} count={b.open}
      sub={`${b.health['on track']} on track · ${b.health['at risk']} at risk · ${b.health.late} late · worst first`}
      info="Delivery's open projects, the ones that need attention first on top: late (finishes after its target or under 90% of planned progress), at risk, late long-lead orders, overdue work orders. The bar is progress against plan; click a project to open it in Delivery."
      actions={<Link to="/delivery?tab=projects" className="panel-link">All projects<I.ChevronRight size={14} /></Link>}>
      <div className="pb-rows">
        {b.rows.map(r => (
          <Link key={r.project.id} to={`/delivery/projects/${r.project.id}`} className="pb-row pb-prow">
            <span className="pb-row-main">
              <span className="pb-prow-t"><b>{r.project.name}</b><span className={`vw-chip vw-chip--${HEALTH_CHIP[r.project.health]} chip-xs`}>{r.project.health[0].toUpperCase() + r.project.health.slice(1)}</span></span>
              <small>{r.project.id} · {r.project.dcId} · {r.project.state} · finish {fmtShortDate(r.project.finish)}{r.reasons.length ? ` · ${r.reasons.slice(0, 2).join(', ').toLowerCase()}` : ''}</small>
            </span>
            <span className="pb-prog" aria-label={`${pctTxt(r.project.progress)} done, ${pctTxt(r.project.plannedProgress)} planned`}>
              <span className="pb-prog-bar"><i style={{ width: `${Math.min(100, r.project.progress)}%` }} /><em style={{ left: `${Math.min(100, r.project.plannedProgress)}%` }} /></span>
              <span className="pb-num">{pctTxt(r.project.progress)}</span>
            </span>
          </Link>
        ))}
        {!b.rows.length && <div className="pb-empty"><I.CircleCheck size={14} />No project in delivery.</div>}
      </div>
    </Panel>
  );
}

export function PlanBuildLens({ pb }: { pb: PlanBuild }) {
  return (
    <>
      <PlanBuildStrip pb={pb} lensTo="/?lens=build" />
      <div className="grid pb-pair pb-pair-a">
        <CapacityPanel cap={pb.capacity} />
        <DecisionsPanel pb={pb} />
      </div>
      <div className={`grid pb-pair pb-pair-b${!pb.week.length && !pb.later.length && !pb.build.rows.length ? ' is-quiet' : ''}`}>
        <WeekPanel pb={pb} />
        <ProjectsPanel pb={pb} />
      </div>
    </>
  );
}
