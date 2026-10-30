/* Planner → Delivery bridge. Delivery (mock/delivery.ts) turns an approved / executing plan into a project with milestones, work
   orders, purchase orders and commissioning. Its plans now come from the P2B planner store: each plan past approval is read as the
   delivery shape (PlannerPlan in api/types), with its milestones from the plan's build initiation (the projects P2B starts) and its
   purchase lines from the plan's bill of materials, evaluated on the frozen baseline scenario. Completed = Delivered. */
import type { PlanScope, PlannerPlan } from '../../api/types';
import type * as T from '../../planner/p2b/types';
import type { Db } from '../generate';
import { activeGeo } from '../geo';
import { p2bStore, plannerStoreSerial } from './index';
import { USD_RATE } from './adapter';
import { evaluate, type Evaluation } from '../../planner/lib/engine';
import { buildBom, buildInitiation } from '../../planner/lib/outputs';
import { plannerDataFromSnapshot } from '../../planner/lib/plannerData';
import { completeFromHandover } from '../../planner/lib/closeout';
import { baselineScenario } from '../../planner/lib/governance';
import { contextForPlan, sourcingReady, vendorOrderRecords, type VendorOrderRecord } from '../../planner/lib/packModel';
import { sourceBom, type SourcingContext } from '../../planner/lib/sourcing';
import type { Store } from '../../planner/lib/reservations';
import type { MockDB } from './store';

const fromUsd = (usd: number) => Math.round(activeGeo().id === 'us' ? usd : usd * USD_RATE);
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0);
export const SCOPE_TO_DELIVERY: Record<T.PlannerScope, PlanScope> = {
  rack: 'rack-expansion', pod: 'ai-pod', hall: 'new-hall', retrofit: 'ai-pod', plant: 'plant-upgrade', network: 'refresh', expansion: 'new-site', 'new-dc': 'new-site', portfolio: 'new-site',
  migration: 'refresh', edge: 'new-site', 'server-refresh': 'refresh', 'network-refresh': 'refresh', 'rack-replace': 'refresh',
};
const PAST = ['Approved', 'Executing', 'Completed'];

interface Bridged {
  plan: PlannerPlan; eval: { tasks: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[]; finish: number; capex: { line: string; amount: number; basis: string }[]; capexTotal: number }; source: T.PlannerPlan;
  /** The sourcing decision (one order per vendor and phase, values in local money): what execution handed over, or before execution the
   *  same sourcing the plan pack shows (`planned`), so Delivery and the pack list the same orders before and after. */
  vendorOrders?: (VendorOrderRecord & { value: number })[];
  planned?: boolean;
}
let cacheKey = ''; let cache: Bridged[] = [];

/* Milestones from the plan's schedule, per phase: the orders (long lead, alongside), the field work and the commissioning, ending at the
   phase's go-live. Names follow the plan family, so Delivery raises the right work orders (install / cut-in / cabling / commissioning). */
const WK = 7 * 864e5;
function phaseTasks(p: T.PlannerPlan, ev: Evaluation, approved: number, now: number): { name: string; weeks: number; start: number; end: number; longLead?: boolean }[] {
  const phases = (p.phases?.length ? p.phases : [{ id: 'P1', name: p.title, goLive: p.targetGoLive }]) as { id: string; name: string; goLive: string }[];
  const WORK: Partial<Record<T.PlannerScope, [string, string, number]>> = {
    plant: ['Plant install and cut-ins', 'Commission the plant (L1–L5)', 6], hall: ['Install racks, power and cabling', 'Commission the hall (L1–L5)', 6],
    pod: ['Install racks, power and cabling', 'Commission the pod (L1–L5)', 5], retrofit: ['Install manifolds, CDUs and cabling', 'Commission the liquid loop (L1–L5)', 5],
    rack: ['Install the racks and cabling', 'Commission and hand over', 2], network: ['Install line cards and optics at both ends', 'Commission and cut over the paths', 3],
  };
  const [work, cx, workWeeks] = WORK[p.scope] ?? ['Install and cable', 'Commission and hand over', 4];
  const out: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[] = [];
  let prev = Math.min(approved || now, now);
  const multi = phases.length > 1;
  phases.forEach((ph, i) => {
    const goLive = ms(ph.goLive) || ms(p.targetGoLive);
    const tag = multi ? ` · ${ph.name}` : '';
    const eq = ev.schedule.filter(x => x.kind === 'equipment' && (x.phaseId ?? 'P1') === ph.id);
    if (i === 0) out.push({ name: 'Design and method statements', start: prev, end: Math.max(prev + 2 * WK, Math.min(...eq.map(x => ms(x.orderBy)).filter(Boolean), prev + 4 * WK)), weeks: 0 });
    if (eq.length) {
      const s0 = Math.max(prev, Math.min(...eq.map(x => ms(x.orderBy)))), e0 = Math.max(s0 + WK, ...eq.map(x => ms(x.needBy)));
      /* the items, not the lead-time group they were looked up in ("Carrier wave (regional): Carrier installation · Path 1") */
      const names = [...new Set(eq.map(x => (x.item.split(': ').pop() ?? x.item).replace(/^\d+ × /, '').replace(/, \d+ × .*$/, '').split(' · ')[0]))];
      out.push({ name: `Procurement · ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}${tag}`, start: s0, end: e0, weeks: 0, longLead: true });
    }
    const cxStart = goLive - Math.max(1, Math.round(workWeeks / 2)) * WK;
    const wStart = Math.max(prev + WK, cxStart - workWeeks * WK);
    out.push({ name: `${work}${tag}`, start: wStart, end: cxStart, weeks: 0 });
    out.push({ name: `${cx}${tag}`, start: cxStart, end: goLive, weeks: 0 });
    prev = cxStart;
  });
  return out.filter(t => t.end > t.start).map(t => ({ ...t, weeks: Math.max(1, Math.round((t.end - t.start) / WK)) })).sort((a, b) => a.start - b.start);
}

export function bridgedPlans(db: Db): Bridged[] {
  const st = p2bStore(db);
  const key = ['plannerPlans', 'plannerScenarios', 'plannerTemplates', 'plannerBenchmarks', 'boms', 'devices', 'racks', 'vendors', 'contracts', 'assetModels'].map(e => st.version(e)).join('.') + String(db.now) + `|${plannerStoreSerial()}`;
  /* the store serial changes when the persona or geography rebuilds the store: entity versions alone repeat across stores */
  if (key === cacheKey) return cache;
  cacheKey = key;
  const all = st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[];
  const plans = all.filter(p => PAST.includes(p.status) && !p.isDeleted);
  const tpls = st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[], bms = st.getAllRaw('plannerBenchmarks') as unknown as T.PlannerBenchmark[];
  const scns = st.getAllRaw('plannerScenarios') as unknown as T.PlannerScenario[];
  const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e);
  const data = plannerDataFromSnapshot(snap);
  const boms = st.getAllRaw('boms') as unknown as (T.BOM & { vendorOrders?: VendorOrderRecord[] })[];
  /* the sourcing context as the plan pack reads it (stock, vendors, contracts, catalogue, racks, plant) */
  const live = <R,>(e: string) => (st.entities().includes(e) ? st.getAllRaw(e).filter(r => !(r as { isDeleted?: boolean }).isDeleted) : []) as unknown as R[];
  const sourcing: SourcingContext = { devices: live('devices'), vendors: live('vendors'), contracts: live('contracts'), assetModels: live('assetModels'), racks: live('racks'), upsUnits: live('upsUnits'), coolingZones: live('coolingZones'), dataCenters: live('dataCenters') };
  cache = plans.map(p => {
    /* the approved figures (frozen baseline parameters, as execution uses them); the preferred scenario before a baseline exists */
    const scn = scns.find(s => s.id === (p.approvedScenarioId ?? p.preferredScenarioId)) ?? null;
    const ev: Evaluation = evaluate(p, baselineScenario(p) ?? scn, tpls, bms, undefined, data);
    const bom = buildBom(p, ev, bms);
    const init = buildInitiation(p, ev, tpls.find(t => t.id === p.templateId), bom);
    const fromInit = init.projects.map(x => ({ name: x.name, start: ms(x.start), end: ms(x.end), weeks: Math.max(1, Math.round((ms(x.end) - ms(x.start)) / (7 * 864e5))), longLead: x.longLead })).filter(t => t.end > t.start).sort((a, b) => a.start - b.start);
    /* a plan that runs as ONE project gets its milestones from its own schedule (29-Oct-2026: it showed a single milestone and no work orders) */
    const tasks = fromInit.length > 1 ? fromInit : phaseTasks(p, ev, ms(p.approvals.filter(a => a.at).slice(-1)[0]?.at) || ms(p.createdAt), db.now);
    const capex = bom.lines.filter(l => l.total > 0 && !l.monthly).map(l => ({ line: `${l.item}${l.spec ? ` · ${l.spec}` : ''}`, amount: fromUsd(l.total), basis: `${l.qty} × ${l.item}` }));
    const approved = p.approvals.filter(a => a.at);
    const s = ev.sizing;
    const plan: PlannerPlan = {
      id: p.plnId, status: p.status === 'Completed' ? 'Delivered' : p.status as PlannerPlan['status'], created: ms(p.createdAt), updated: ms(p.updatedAt),
      scope: SCOPE_TO_DELIVERY[p.scope], name: p.title, dcId: p.dataCenterId ?? p.peerDataCenterId ?? '', racks: Math.round(s.racks ?? 0), kwPerRack: Number(ev.params.densityKwPerRack?.value ?? 0) || 0,
      redundancy: String(ev.params.redundancy?.value ?? 'N+1').startsWith('2N') ? '2N' : 'N+1', tier: (String(ev.params.tier?.value ?? 'Tier III') as PlannerPlan['tier']),
      cooling: /liquid|immersion/.test(String(ev.params.coolingType?.value)) ? 'Liquid-to-chip' : /rear/.test(String(ev.params.coolingType?.value)) ? 'Rear-door' : 'Air',
      plant: p.scope === 'plant' ? (bom.lines.some(l => /UPS/i.test(l.item)) ? 'UPS' : bom.lines.some(l => /generator/i.test(l.item)) ? 'Generator' : 'Cooling') : undefined,
      target: Math.max(ms(p.targetGoLive), ...(p.phases ?? []).map(ph => ms(ph.goLive))), owner: p.ownerName,
      approvals: approved.map((a, i) => ({ step: i + 1, role: a.role, who: a.person ?? a.role, decision: a.decision === 'Rejected' ? 'Rejected' : 'Approved', at: ms(a.at), comment: a.reason })),
      history: [{ at: ms(p.createdAt), who: p.ownerName, text: `Plan created (${tpls.find(t => t.id === p.templateId)?.name ?? p.scope})` }, ...approved.map(a => ({ at: ms(a.at), who: a.person ?? a.role, text: `${a.step}: ${a.decision}` }))],
      capacityPlanIds: [], createdRacks: [], scenario: scn?.name ?? 'Base case', source: 'Planner',
    };
    const finish = Math.max(plan.target, ...tasks.map(t => t.end));
    const bomRec = p.artefacts?.bomId ? boms.find(b => b.id === p.artefacts!.bomId && Array.isArray(b.vendorOrders)) : undefined;
    const planned = !bomRec && p.status === 'Approved' && sourcingReady(sourcing) && bom.lines.length > 0;
    const records = bomRec?.vendorOrders ?? (planned ? vendorOrderRecords(sourceBom(p, ev, bom, contextForPlan(p, sourcing))) : undefined);
    const vendorOrders = records?.map(v => ({ ...v, value: fromUsd(v.valueUsd) }));
    return { plan, eval: { tasks: tasks.length ? tasks : [{ name: 'Delivery', start: Math.max(db.now - 30 * 864e5, plan.created), end: finish, weeks: 8 }], finish, capex, capexTotal: fromUsd(ev.estimate.capexTotal) }, source: p, vendorOrders, planned: !bomRec && planned };
  });
  return cache;
}

/** The planner store as a governance store (what the planner's completion writes through). */
const storeOf = (st: MockDB): Store => ({ list: e => st.getAllRaw(e), get: (e, id) => st.getById(e, id), create: (e, r) => { st.create(e, r); }, update: (e, id, patch) => { st.update(e, id, patch); } });

/** Handover in Delivery completes the plan in the planner, the same completion as "Complete plan" there (closeout.completeFromHandover):
 *  the plan's records set to what was delivered, waves closed, holds consumed, the close-out written with its checklist, audited. */
export function completeFromDelivery(db: Db, plnId: string, who: string, notes?: string) {
  const st = p2bStore(db);
  const p = (st.getAllRaw('plannerPlans') as unknown as T.PlannerPlan[]).find(x => x.plnId === plnId);
  if (!p || p.status === 'Completed') return;
  const at = new Date(db.now).toISOString();
  const tpl = (st.getAllRaw('plannerTemplates') as unknown as T.PlannerTemplate[]).find(t => t.id === p.templateId);
  const data = () => { const snap: Record<string, unknown> = {}; for (const e of st.entities()) snap[e] = st.getAllRaw(e); return plannerDataFromSnapshot(snap); };
  const r = completeFromHandover(storeOf(st), p, data, tpl, who, at, notes);
  st.update('plannerPlans', p.id, { ...r.patch, updatedAt: at, updatedBy: who });
  const n = (st.getAllRaw('auditEvents') as { id: string }[]).reduce((m, e) => { const x = /^AUD-(\d+)$/.exec(e.id); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1;
  const id = `AUD-${String(n).padStart(4, '0')}`;
  st.create('auditEvents', { id, audId: id, entityType: 'Plan', entityId: p.id, action: 'completed', actorName: who, timestamp: at, summary: r.summary, changes: [{ field: 'status', from: p.status, to: 'Completed' }], plannerPlanId: p.id, customerId: 'CUST-001', isDeleted: false, createdAt: at, updatedAt: at, createdBy: who, createdById: who });
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
