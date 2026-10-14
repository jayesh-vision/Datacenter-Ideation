/* Planner → Delivery bridge. Delivery (mock/delivery.ts) turns an approved / executing plan into a project with milestones, work
   orders, purchase orders and commissioning. Its plans now come from the P2B planner store: each plan past approval is read as the
   delivery shape (PlannerPlan in api/types), with its milestones from the plan's build initiation (the projects P2B starts) and its
   purchase lines from the plan's bill of materials, evaluated on the frozen baseline scenario. Completed = Delivered. */
import type { PlanScope, PlannerPlan } from '../../api/types';
import type * as T from '../../planner/p2b/types';
import type { Db } from '../generate';
import { activeGeo } from '../geo';
import { p2bStore } from './index';
import { USD_RATE } from './adapter';
import { evaluate, type Evaluation } from '../../planner/lib/engine';
import { buildBom, buildInitiation } from '../../planner/lib/outputs';
import { plannerDataFromSnapshot } from '../../planner/lib/plannerData';

const fromUsd = (usd: number) => Math.round(activeGeo().id === 'us' ? usd : usd * USD_RATE);
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
export const SCOPE_TO_DELIVERY: Record<T.PlannerScope, PlanScope> = {
  rack: 'rack-expansion', pod: 'ai-pod', hall: 'new-hall', retrofit: 'ai-pod', plant: 'plant-upgrade', network: 'refresh', expansion: 'new-site', 'new-dc': 'new-site', portfolio: 'new-site',
  migration: 'refresh', edge: 'new-site', 'server-refresh': 'refresh', 'network-refresh': 'refresh', 'rack-replace': 'refresh',
};
const PAST = ['Approved', 'Executing', 'Completed'];

interface Bridged { plan: PlannerPlan; eval: { tasks: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[]; finish: number; capex: { line: string; amount: number; basis: string }[]; capexTotal: number }; source: T.PlannerPlan }
let cacheKey = ''; let cache: Bridged[] = [];

export function bridgedPlans(db: Db): Bridged[] {
  const st = p2bStore(db);
  const key = ['plannerPlans', 'plannerScenarios', 'plannerTemplates', 'plannerBenchmarks'].map(e => st.version(e)).join('.') + String(db.now);
  if (key === cacheKey) return cache;
  cacheKey = key;
  const all = st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[];
  const plans = all.filter(p => PAST.includes(p.status) && !p.isDeleted);
  const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[], bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
  const scns = st.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
  const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
  const data = plannerDataFromSnapshot(snap);
  cache = plans.map(p => {
    const scn = scns.find(s => s.id === (p.approvedScenarioId ?? p.preferredScenarioId)) ?? null;
    const ev: Evaluation = evaluate(p, scn, tpls, bms, undefined, data);
    const bom = buildBom(p, ev, bms);
    const init = buildInitiation(p, ev, tpls.find(t => t.id === p.templateId), bom);
    const tasks = init.projects.map(x => ({ name: x.name, start: ms(x.start), end: ms(x.end), weeks: Math.max(1, Math.round((ms(x.end) - ms(x.start)) / (7 * 864e5))), longLead: x.longLead })).filter(t => t.end > t.start).sort((a, b) => a.start - b.start);
    const capex = bom.lines.filter(l => l.total > 0).map(l => ({ line: `${l.item}${l.spec ? ` · ${l.spec}` : ''}`, amount: fromUsd(l.total), basis: `${l.qty} × ${l.item}` }));
    const approved = p.approvals.filter(a => a.at);
    const s = ev.sizing;
    const plan: PlannerPlan = {
      id: p.plnId, status: p.status === 'Completed' ? 'Delivered' : p.status as PlannerPlan['status'], created: ms(p.createdAt), updated: ms(p.updatedAt),
      scope: SCOPE_TO_DELIVERY[p.scope], name: p.title, dcId: p.dataCenterId ?? p.peerDataCenterId ?? '', racks: Math.round(s.racks ?? 0), kwPerRack: Number(ev.params.densityKwPerRack?.value ?? 0) || 0,
      redundancy: String(ev.params.redundancy?.value ?? 'N+1').startsWith('2N') ? '2N' : 'N+1', tier: (String(ev.params.tier?.value ?? 'Tier III') as PlannerPlan['tier']),
      cooling: /liquid|immersion/.test(String(ev.params.coolingType?.value)) ? 'Liquid-to-chip' : /rear/.test(String(ev.params.coolingType?.value)) ? 'Rear-door' : 'Air',
      plant: p.scope === 'plant' ? (bom.lines.some(l => /UPS/i.test(l.item)) ? 'UPS' : bom.lines.some(l => /generator/i.test(l.item)) ? 'Generator' : 'Cooling') : undefined,
      target: ms(p.targetGoLive), owner: p.ownerName,
      approvals: approved.map((a, i) => ({ step: i + 1, role: a.role, who: a.person ?? a.role, decision: a.decision === 'Rejected' ? 'Rejected' : 'Approved', at: ms(a.at), comment: a.reason })),
      history: [{ at: ms(p.createdAt), who: p.ownerName, text: `Plan created (${tpls.find(t => t.id === p.templateId)?.name ?? p.scope})` }, ...approved.map(a => ({ at: ms(a.at), who: a.person ?? a.role, text: `${a.step}: ${a.decision}` }))],
      capacityPlanIds: [], createdRacks: [], scenario: scn?.name ?? 'Base case', source: 'Planner',
    };
    const finish = Math.max(plan.target, ...tasks.map(t => t.end));
    return { plan, eval: { tasks: tasks.length ? tasks : [{ name: 'Delivery', start: Math.max(db.now - 30 * 864e5, plan.created), end: finish, weeks: 8 }], finish, capex, capexTotal: fromUsd(ev.estimate.capexTotal) }, source: p };
  });
  return cache;
}

/** Handover in Delivery completes the plan in the planner (P2B status Completed). */
export function completeFromDelivery(db: Db, plnId: string, who: string) {
  const st = p2bStore(db);
  const p = (st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).find(x => x.plnId === plnId);
  if (p) st.update('plannerPlans', p.id, { status: 'Completed', updatedAt: new Date(db.now).toISOString(), updatedBy: who });
}

/** Plans waiting in the planner (in review, or approved but not yet executed), for the Delivery pipeline. */
export function plannerQueue(db: Db): { id: string; name: string; status: 'In review' | 'Approved'; capex: number; waitingFor?: string; dcId?: string }[] {
  const st = p2bStore(db);
  const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[], bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
  const scns = st.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
  const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
  const data = plannerDataFromSnapshot(snap);
  return (st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).filter(p => !p.isDeleted && (p.status === 'In review' || p.status === 'Approved')).map(p => {
    const scn = scns.find(s => s.id === (p.approvedScenarioId ?? p.reviewScenarioId ?? p.preferredScenarioId)) ?? null;
    const capex = p.baseline?.capexTotal ?? evaluate(p, scn, tpls, bms, undefined, data).estimate.capexTotal;
    const step = p.approvals.find(a => a.decision === 'Pending');
    return { id: p.plnId, name: p.title, status: p.status as 'In review' | 'Approved', capex: fromUsd(capex), waitingFor: step ? `${step.step} (${step.role})` : undefined, dcId: p.dataCenterId };
  });
}
