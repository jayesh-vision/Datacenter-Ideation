/* Command center — the plan and build figures (14-Oct-2026, gap round 2, ported from DCOS src/ops/screens/command/lifecycle.ts).
   Pure: every figure is computed from the planner's plans, the planner's sites and Delivery (projects, purchase orders, work orders,
   commissioning tests) with `now` passed in, so a number here and the list it links to agree.
   - Plan: plans in review, the design MW of capacity plans still in planning (draft, in review, approved), the status split and the
     next approval step (the oldest one waiting).
   - Build: Delivery's open projects by health (on track / at risk / late), open work orders, long-lead orders.
   - Capacity pipeline (MW): planned → approved → in build → commissioning → live. A capacity plan sits at its status (in build =
     executing, commissioning = its Delivery project is commissioning or at handover); a planned site that no plan carries is planned;
     a live site (operational or being extended, as in operations) is live at its design power.
   - Decisions: the approval step each plan in review waits on, and late long-lead orders.
   - Week ahead: go-lives, handovers, commissioning tests, work orders starting and long-lead orders to place or due. */
import type * as T from '../../planner/p2b/types';
import type { DeliveryProject, PurchaseOrder, WorkOrder, CxTest } from '../../api/types';

const DAY = 864e5;
export const WEEK_DAYS = 7;
/** A purchase order is long-lead from this many weeks (switchgear, UPS, chillers, optical line systems…). */
export const LONG_LEAD_WEEKS = 12;
/** An approval step waiting longer than this is overdue (the approval SLA the planner hub uses for "waiting"). */
export const APPROVAL_SLA_DAYS = 5;
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const days = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY));

/** Planner plan types that add capacity (MW); refreshes, migrations, network and retrofit work do not. */
export const CAPACITY_SCOPES: readonly T.PlannerScope[] = ['new-dc', 'expansion', 'hall', 'pod', 'rack', 'plant', 'edge', 'portfolio'];
/** A plan still in play: not rejected, cancelled, completed or replaced by a later revision. */
export const isLivePlan = (p: T.PlannerPlan) => !p.isDeleted && !p.supersededBy && !['Rejected', 'Cancelled', 'Completed'].includes(p.status);

/** Power in MW (the pipeline's unit): one decimal under 10 MW, two under 0.1 MW. */
export function fmtMw(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0) return '0 MW';
  const mw = kw / 1000;
  return `${mw < 0.1 ? Math.round(mw * 100) / 100 : mw < 10 ? Math.round(mw * 10) / 10 : Math.round(mw).toLocaleString('en-US')} MW`;
}

export interface DeliveryInput { projects: DeliveryProject[]; pos: PurchaseOrder[]; workOrders: WorkOrder[]; tests: (CxTest & { projectId: string; dcId: string; projectName: string })[] }
export interface PlanBuildInput { plans: T.PlannerPlan[]; sites: T.DataCenter[]; delivery: DeliveryInput; now: number }

export type PlanStatusKey = 'Draft' | 'In review' | 'Approved' | 'Executing' | 'On hold';
export interface ApprovalWait { plan: T.PlannerPlan; step: T.PlannerApproval; stepNo: number; steps: number; since: number; days: number; overdue: boolean; to: string; where: string }
export interface PlanPulse { open: number; byStatus: Record<PlanStatusKey, number>; inReview: number; pipelineKw: number; waiting: T.PlannerPlan[]; approvals: ApprovalWait[]; next?: ApprovalWait }

export type Health = DeliveryProject['health'];
export interface ProjectRow { project: DeliveryProject; plan?: T.PlannerPlan; reasons: string[]; lateDays: number; severity: number }
export interface BuildPulse {
  open: number; health: Record<Health, number>; byState: Record<DeliveryProject['state'], number>;
  woOpen: number; poOpen: number; longLeadOpen: number; longLeadLate: number;
  nextFinish?: DeliveryProject; rows: ProjectRow[]; worst?: ProjectRow;
}

export type CapStage = 'planned' | 'approved' | 'build' | 'commissioning' | 'live';
export const CAP_STAGES: readonly CapStage[] = ['planned', 'approved', 'build', 'commissioning', 'live'];
export const CAP_STAGE_LABEL: Record<CapStage, string> = { planned: 'Planned', approved: 'Approved', build: 'In build', commissioning: 'Commissioning', live: 'Live' };
/** One blue ramp from planned to live (red and amber stay reserved for attention). */
export const CAP_STAGE_COLOR: Record<CapStage, string> = { planned: 'var(--vw-color-slate-300)', approved: 'var(--primaryColor200)', build: 'var(--primaryColor400)', commissioning: 'var(--primaryColor600)', live: 'var(--primaryColor800)' };
export interface CapItem { key: string; kind: 'plan' | 'site'; label: string; sub: string; stage: CapStage; kw: number; to: string }
export interface CapStageRow { stage: CapStage; label: string; kw: number; items: CapItem[]; to: string }
export interface CapacityPipeline { stages: CapStageRow[]; totalKw: number; notLivePct: number }

export type DecisionKind = 'plan' | 'order' | 'start';
export interface Decision { key: string; kind: DecisionKind; what: string; where: string; who: string; when: string; hot: boolean; to: string; since: number }

export type WeekType = 'golive' | 'handover' | 'test' | 'work' | 'order' | 'delivery';
export const WEEK_LABEL: Record<WeekType, string> = { golive: 'Go-live', handover: 'Handover', test: 'Commissioning test', work: 'Work order starts', order: 'Long-lead order to place', delivery: 'Long-lead delivery due' };
export interface WeekEvent { key: string; at: number; type: WeekType; label: string; sub: string; to: string; tone: 'neutral' | 'warning' }

export interface PlanBuild { now: number; plan: PlanPulse; build: BuildPulse; capacity: CapacityPipeline; decisions: Decision[]; week: WeekEvent[]; later: WeekEvent[] }

export function planBuild({ plans, sites, delivery, now }: PlanBuildInput): PlanBuild {
  const today0 = startOfDay(now);
  const siteById = new Map(sites.map(s => [s.id, s]));
  const where = (p: T.PlannerPlan) => p.dataCenterId ? (siteById.get(p.dataCenterId)?.name ?? p.dataCenterId) : p.newSiteName || (p.scope === 'portfolio' ? 'Regional portfolio' : 'New site');
  const planById = new Map(plans.map(p => [p.id, p]));
  const planOf = (pr: DeliveryProject) => planById.get(pr.planId) ?? plans.find(p => p.plnId === pr.planId);

  /* ---------------------------------------------------------------- plan */
  const live = plans.filter(isLivePlan);
  const byStatus: Record<PlanStatusKey, number> = { Draft: 0, 'In review': 0, Approved: 0, Executing: 0, 'On hold': 0 };
  for (const p of live) if (p.status in byStatus) byStatus[p.status as PlanStatusKey]++;
  const approvals: ApprovalWait[] = live.filter(p => p.status === 'In review').flatMap(plan => {
    const ordered = [...(plan.approvals ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = ordered.findIndex(a => a.decision === 'Pending');
    if (i < 0) return [];
    const step = ordered[i];
    const prev = ordered.slice(0, i).map(a => a.at).filter((x): x is string => !!x).sort().pop();
    const since = ms(prev ?? plan.submittedAt ?? plan.updatedAt);
    const d = Number.isFinite(since) ? days(since, now) : 0;
    return [{ plan, step, stepNo: i + 1, steps: ordered.length, since: Number.isFinite(since) ? since : now, days: d, overdue: d > APPROVAL_SLA_DAYS, to: `/planning/plans/${plan.id}?tab=approvals`, where: where(plan) }];
  }).sort((a, b) => a.since - b.since);
  const plan: PlanPulse = {
    open: live.length, byStatus, inReview: byStatus['In review'],
    pipelineKw: live.filter(p => CAPACITY_SCOPES.includes(p.scope) && ['Draft', 'In review', 'Approved'].includes(p.status)).reduce((a, p) => a + (p.designPowerKw || 0), 0),
    waiting: live.filter(p => p.status === 'Approved' && !p.artefacts?.completedAt).sort((a, b) => a.targetGoLive.localeCompare(b.targetGoLive)),
    approvals, next: approvals[0],
  };

  /* ---------------------------------------------------------------- build (Delivery) */
  const open = delivery.projects.filter(p => p.state !== 'Delivered');
  const openIds = new Set(open.map(p => p.id));
  const health: Record<Health, number> = { 'on track': 0, 'at risk': 0, late: 0 };
  const byState: Record<DeliveryProject['state'], number> = { Mobilising: 0, 'In progress': 0, Commissioning: 0, Handover: 0, Delivered: 0 };
  for (const p of open) { health[p.health]++; byState[p.state]++; }
  const openPos = delivery.pos.filter(p => openIds.has(p.projectId) && p.state !== 'Delivered');
  const longLead = openPos.filter(p => p.leadWeeks >= LONG_LEAD_WEEKS);
  /* late: a placed order past its due date (or flagged late by the supplier), or a draft order whose order-by day has passed */
  const isLateOrder = (p: PurchaseOrder) => p.state === 'Late' || (p.state === 'Draft' ? p.ordered < today0 : p.due < today0);
  const lateLL = longLead.filter(isLateOrder);
  const woOpen = delivery.workOrders.filter(w => openIds.has(w.projectId) && w.state !== 'Done');
  const rows: ProjectRow[] = open.map(project => {
    const reasons: string[] = [];
    const lateDays = Math.max(0, Math.round((project.finish - project.target) / DAY));
    if (project.health === 'late') reasons.push(lateDays ? `${lateDays} d past target` : 'Behind plan');
    else if (project.health === 'at risk') reasons.push('At risk');
    const ll = lateLL.filter(p => p.projectId === project.id).length;
    if (ll) reasons.push(`${ll} long-lead order${ll === 1 ? '' : 's'} late`);
    const overdueWo = woOpen.filter(w => w.projectId === project.id && w.end < today0).length;
    if (overdueWo) reasons.push(`${overdueWo} work order${overdueWo === 1 ? '' : 's'} overdue`);
    if (project.spi < 0.9) reasons.push(`Schedule index ${project.spi.toFixed(2)}`);
    const severity = (project.health === 'late' ? 6 : project.health === 'at risk' ? 3 : 0) + ll * 2 + overdueWo;
    return { project, plan: planOf(project), reasons, lateDays, severity };
  }).sort((a, b) => b.severity - a.severity || a.project.finish - b.project.finish);
  const build: BuildPulse = {
    open: open.length, health, byState, woOpen: woOpen.length, poOpen: openPos.length, longLeadOpen: longLead.length, longLeadLate: lateLL.length,
    nextFinish: [...open].sort((a, b) => a.finish - b.finish)[0], rows, worst: rows.find(r => r.severity > 0),
  };

  /* ---------------------------------------------------------------- capacity pipeline */
  const items: CapItem[] = [];
  const carried = new Set<string>(); // planned sites a plan carries (counted once, as the plan)
  const projectOfPlan = new Map(delivery.projects.map(pr => [planOf(pr)?.id ?? pr.planId, pr]));
  for (const p of live) {
    if (!CAPACITY_SCOPES.includes(p.scope) || p.status === 'On hold') continue;
    const pr = projectOfPlan.get(p.id);
    const stage: CapStage = p.status === 'Draft' || p.status === 'In review' ? 'planned' : p.status === 'Approved' ? 'approved'
      : pr && (pr.state === 'Commissioning' || pr.state === 'Handover') ? 'commissioning' : 'build';
    items.push({ key: `plan:${p.id}`, kind: 'plan', label: p.title, sub: `${p.plnId ?? p.id} · ${where(p)} · ${p.status}`, stage, kw: p.designPowerKw || 0, to: `/planning/plans/${p.id}` });
    const s = p.dataCenterId ? siteById.get(p.dataCenterId) : undefined;
    if (s?.status === 'Planned') carried.add(s.id);
  }
  for (const s of sites) {
    if (carried.has(s.id)) continue;
    const kw = s.designPowerKw || 0;
    if (s.status === 'Planned') items.push({ key: `site:${s.id}`, kind: 'site', label: s.name, sub: `${s.code} · planned site`, stage: 'planned', kw, to: `/datacenters/${s.id}` });
    else if (s.status === 'Operational' || s.status === 'Construction') {
      const since = ms(s.commissionedDate);
      items.push({ key: `site:${s.id}`, kind: 'site', label: s.name, sub: `${s.code}${s.status === 'Construction' ? ' · live, being extended' : Number.isFinite(since) ? ` · live since ${new Date(since).getFullYear()}` : ' · live'}`, stage: 'live', kw, to: `/datacenters/${s.id}` });
    }
  }
  const stages: CapStageRow[] = CAP_STAGES.map(stage => {
    const its = items.filter(i => i.stage === stage).sort((a, b) => b.kw - a.kw || a.label.localeCompare(b.label));
    return { stage, label: CAP_STAGE_LABEL[stage], kw: its.reduce((a, i) => a + i.kw, 0), items: its,
      to: stage === 'planned' ? '/planning?tab=plans' : stage === 'approved' ? '/planning?tab=plans&status=Approved' : stage === 'build' ? '/delivery?tab=projects' : stage === 'commissioning' ? '/delivery?tab=commissioning' : '/datacenters' };
  });
  const totalKw = stages.reduce((a, s) => a + s.kw, 0);
  const liveKw = stages.find(s => s.stage === 'live')?.kw ?? 0;
  const capacity: CapacityPipeline = { stages, totalKw, notLivePct: totalKw ? Math.round(((totalKw - liveKw) / totalKw) * 100) : 0 };

  /* ---------------------------------------------------------------- decisions */
  const waited = (d: number) => (d === 0 ? 'today' : `${d} d`);
  const projById = new Map(delivery.projects.map(p => [p.id, p]));
  const decisions: Decision[] = [
    ...approvals.map(a => ({ key: `plan:${a.plan.id}`, kind: 'plan' as const, what: `Approve ${a.plan.plnId ?? a.plan.id} ${a.plan.title}`, where: a.where,
      who: `${a.step.role}${a.step.person ? ` · ${a.step.person}` : ''} · step ${a.stepNo} of ${a.steps}`, when: waited(a.days), hot: a.overdue, to: a.to, since: a.since })),
    ...lateLL.map(o => {
      const pr = projById.get(o.projectId);
      const late = o.state === 'Draft' ? o.ordered : o.due;
      return { key: `po:${o.id}`, kind: 'order' as const, what: `${o.state === 'Draft' ? 'Place' : 'Chase'} ${o.id} · ${o.supplier}`, where: [pr?.dcId, pr?.name].filter(Boolean).join(' · '),
        who: `${o.leadWeeks}-week lead · ${o.state === 'Draft' ? 'order-by day passed' : 'delivery overdue'}`, when: `${days(late, now)} d late`, hot: true, to: `/delivery/projects/${o.projectId}?tab=procurement`, since: late };
    }),
  ];

  /* ---------------------------------------------------------------- week ahead (and what comes after it) */
  const events: WeekEvent[] = [];
  const at9 = (t: number) => startOfDay(t) + 9 * 3600e3;
  for (const p of live) if (p.status === 'Approved' || p.status === 'Executing') {
    const t = ms(p.targetGoLive);
    if (Number.isFinite(t)) events.push({ key: `pg:${p.id}`, at: at9(t), type: 'golive', label: `${p.title} go-live`, sub: `${p.plnId ?? p.id} · ${where(p)}${CAPACITY_SCOPES.includes(p.scope) && p.designPowerKw ? ` · ${fmtMw(p.designPowerKw)}` : ''}`, to: `/planning/plans/${p.id}`, tone: 'neutral' });
  }
  for (const pr of open) {
    if (pr.state === 'Handover') events.push({ key: `ho:${pr.id}`, at: at9(Math.max(now, pr.finish)), type: 'handover', label: `Hand over ${pr.name}`, sub: `${pr.id} · ${pr.dcId} · ready for handover`, to: `/delivery/projects/${pr.id}`, tone: 'neutral' });
    else if (pr.finish >= today0) events.push({ key: `pf:${pr.id}`, at: at9(pr.finish), type: 'handover', label: `${pr.name} due to hand over`, sub: `${pr.id} · ${pr.dcId} · ${pr.progress}% complete${pr.health !== 'on track' ? ` · ${pr.health}` : ''}`, to: `/delivery/projects/${pr.id}`, tone: pr.health === 'on track' ? 'neutral' : 'warning' });
  }
  for (const t of delivery.tests) if (openIds.has(t.projectId) && (t.state === 'Scheduled' || t.state === 'Not started'))
    events.push({ key: `cx:${t.projectId}:${t.level}`, at: at9(t.due), type: 'test', label: `L${t.level} ${t.name}`, sub: `${t.projectId} · ${t.dcId} · ${t.projectName}`, to: `/delivery/projects/${t.projectId}?tab=commissioning`, tone: 'neutral' });
  for (const w of delivery.workOrders) if (openIds.has(w.projectId) && (w.state === 'Planned' || w.state === 'Ready' || w.state === 'Awaiting change'))
    events.push({ key: `wo:${w.id}`, at: w.start, type: 'work', label: w.title, sub: `${w.id} · ${w.crew}${w.state === 'Awaiting change' ? ' · change not approved yet' : w.kit !== 'Ready' ? ` · kit ${w.kit.toLowerCase()}` : ''}`, to: `/delivery/projects/${w.projectId}?tab=workorders`, tone: w.state === 'Awaiting change' || w.kit !== 'Ready' ? 'warning' : 'neutral' });
  for (const o of longLead) {
    const pr = projById.get(o.projectId);
    const ctx = [`${o.leadWeeks}-week lead`, pr?.dcId].filter(Boolean).join(' · ');
    if (o.state === 'Draft') events.push({ key: `po:${o.id}`, at: at9(Math.max(o.ordered, today0)), type: 'order', label: `Place ${o.id} with ${o.supplier}`, sub: `${ctx} · ${o.item}`, to: `/delivery/projects/${o.projectId}?tab=procurement`, tone: o.ordered < today0 ? 'warning' : 'neutral' });
    else events.push({ key: `pd:${o.id}`, at: at9(Math.max(o.due, today0)), type: 'delivery', label: `${o.id} from ${o.supplier} due on site`, sub: `${ctx} · ${o.item}`, to: `/delivery/projects/${o.projectId}?tab=procurement`, tone: o.due < today0 || o.state === 'Late' ? 'warning' : 'neutral' });
  }
  events.sort((a, b) => a.at - b.at || a.type.localeCompare(b.type) || a.key.localeCompare(b.key));
  const horizon = today0 + WEEK_DAYS * DAY;
  const week = events.filter(e => e.at >= today0 && e.at < horizon);
  const later = events.filter(e => e.at >= horizon);

  return { now, plan, build, capacity, decisions, week, later };
}

/** Events grouped by day (today first). */
export function byDay(events: WeekEvent[], now: number): { key: string; day: number; events: WeekEvent[] }[] {
  const today0 = startOfDay(now);
  const m = new Map<number, WeekEvent[]>();
  for (const e of events) { const d = startOfDay(e.at); m.set(d, [...(m.get(d) ?? []), e]); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([day, evs]) => ({ key: `d${Math.round((day - today0) / DAY)}`, day, events: evs }));
}
