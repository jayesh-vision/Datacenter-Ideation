/* Delivery (13-Oct-2026, P2B merge phase 5). An approved or executing planner plan is a project; everything else follows from it:
   - milestones = the plan's schedule (lead times); progress is read against today, so a project is "late" only when its own dates say so;
   - work orders = the field-work milestones split into crew windows, each with its own delivery change request (CR-…) and a kit status
     from the purchase orders that must land before it starts;
   - purchase orders = the plan's plant lines, racks and compute, ordered at approval, due after their lead time;
   - commissioning L1–L5 (factory witness → site acceptance → pre-functional → functional → integrated systems test) on the schedule's dates;
   - permits and design documents by scope; handover once L5 has passed and no work order is open: the plan and its capacity plans are
     marked Delivered. Cost: earned value = budget × progress, actual from a per-project factor, CPI / SPI from those.
   Derived per data version; the user's moves (start / complete a work order, run a test, hand over) live in an overlay. */
import type { CxTest, DeliveryMilestone, DeliveryProject, DeliveryProjectView, DesignDoc, Permit, PlannerPlan, PurchaseOrder, WorkOrder } from '../api/types';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { bridgedPlans, completeFromDelivery } from './p2b/bridge';
/* plans past approval in the planner (P2B port), read in the delivery shape */
const plannerPlans = (db: Db) => bridgedPlans(db).map(b => b.plan);
const evaluate = (db: Db, p: PlannerPlan) => bridgedPlans(db).find(b => b.plan.id === p.id)!.eval;
import { mulberry32, seedOf, between } from '../lib/rng';
import { DAY } from './seed';

const WEEK = 7 * DAY;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (n: number) => Math.round(n * 100) / 100;
interface Overlay { po: Set<string>; wo: Map<string, WorkOrder['state']>; tests: Map<string, CxTest['state']>; handed: Map<string, number>; log: Map<string, { at: number; who: string; text: string }[]> }
const overlay: Overlay = { po: new Set(), wo: new Map(), tests: new Map(), handed: new Map(), log: new Map() };
export const resetDelivery = () => { overlay.po.clear(); overlay.wo.clear(); overlay.tests.clear(); overlay.handed.clear(); overlay.log.clear(); };

const crews = () => (activeGeo().id === 'in'
  ? { electrical: 'Sterling & Wilson', mechanical: 'Blue Star', civil: 'L&T Construction', it: 'own technicians' }
  : { electrical: 'Rosendin Electric', mechanical: 'Southland Industries', civil: 'Turner Construction', it: 'own technicians' });
const SUPPLIER: Record<string, [string, string]> = {
  UPS: ['Vertiv', 'Schneider Electric'], Generators: ['Cummins', 'Caterpillar'], Transformers: ['Siemens Energy', 'ABB'], CRAH: ['Vertiv', 'STULZ'], CDUs: ['CoolIT Systems', 'Vertiv'],
  Chillers: ['Trane', 'Carrier'], Racks: ['Rittal', 'APC by Schneider'], 'GPU nodes': ['NVIDIA partner (Dell)', 'NVIDIA partner (Supermicro)'], Servers: ['Dell Technologies', 'HPE'], Equipment: ['OEM', 'OEM'], Manifolds: ['Motivair', 'CoolIT Systems']
};
const LEAD: Record<string, number> = { UPS: 20, Generators: 36, Transformers: 40, CRAH: 16, CDUs: 20, Chillers: 24, Racks: 8, 'GPU nodes': 14, Servers: 8, Equipment: 10, Manifolds: 12 };
const catOf = (line: string) => (/UPS/.test(line) ? 'UPS' : /Generator/.test(line) ? 'Generators' : /Transformer/.test(line) ? 'Transformers' : /CRAH/.test(line) ? 'CRAH' : /CDU/.test(line) ? 'CDUs' : /Chiller/.test(line) ? 'Chillers'
  : /Racks/.test(line) ? 'Racks' : /GPU/.test(line) ? 'GPU nodes' : /servers/.test(line) ? 'Servers' : /manifold/i.test(line) ? 'Manifolds' : /New equipment/.test(line) ? 'Equipment' : '');

export const projectId = (planId: string) => planId.replace('PLN-', 'PRJ-');
const inDelivery = (p: PlannerPlan) => p.status === 'Approved' || p.status === 'Executing' || p.status === 'Delivered';
const log = (pid: string, who: string, text: string, at: number) => overlay.log.set(pid, [...(overlay.log.get(pid) ?? []), { at, who, text }]);

export function deliveryProjects(db: Db): DeliveryProjectView[] { return plannerPlans(db).filter(inDelivery).map(p => view(db, p)); }
export function deliveryProject(db: Db, id: string): DeliveryProjectView | null { const p = plannerPlans(db).find(x => projectId(x.id) === id && inDelivery(x)); return p ? view(db, p) : null; }

function view(db: Db, p: PlannerPlan): DeliveryProjectView {
  const now = db.now;
  const pid = projectId(p.id);
  const e = evaluate(db, p);
  const r = mulberry32(seedOf(`delivery:${p.id}`));
  const ppl = activeGeo().people;
  const manager = ppl[(seedOf(p.id) % 6) + 2] ?? p.owner;
  const start = e.tasks[0]?.start ?? p.created, finish = e.finish;
  const approvedAt = p.approvals[p.approvals.length - 1]?.at ?? p.created;
  const delivered = p.status === 'Delivered' || overlay.handed.has(pid);
  /* milestones */
  const milestones: DeliveryMilestone[] = e.tasks.map(t => ({ name: t.name, start: t.start, end: t.end, longLead: t.longLead, state: delivered || t.end <= now ? 'done' : t.start <= now ? 'active' : 'next' }));
  /* purchase orders: plant lines, racks, compute — ordered at approval, due after the lead time */
  const pos: PurchaseOrder[] = [];
  let k = 0;
  for (const c of e.capex) {
    const cat = catOf(c.line); if (!cat) continue;
    const qty = Number(/^(\d+)\s*×/.exec(c.basis)?.[1] ?? 1);
    const ordered = Math.max(approvedAt, start);
    const due = ordered + LEAD[cat] * WEEK;
    const late = !delivered && p.status === 'Executing' && due < now && r() < 0.18;
    const poId = `PO-${pid.slice(4)}-${String(++k).padStart(2, '0')}`;
    pos.push({ id: poId, projectId: pid, supplier: SUPPLIER[cat][seedOf(`${p.id}${cat}`) % 2], item: c.line, qty, unitCost: Math.round(c.amount / Math.max(1, qty)), total: c.amount,
      ordered, due: late ? due + 3 * WEEK : due, leadWeeks: LEAD[cat], state: overlay.po.has(poId) ? 'Delivered' : p.status === 'Approved' && !delivered ? 'Ordered' : delivered || due + (late ? 3 * WEEK : 0) < now ? (late && due + 3 * WEEK > now ? 'Late' : 'Delivered') : due - 2 * WEEK < now ? 'In transit' : 'Ordered' });
  }
  /* work orders: the field-work milestones, split in crew windows */
  const cr = crews();
  const field = e.tasks.filter(t => /install|cable|fit-out|commission|migrate|decommission|construction|plant additions|change window/i.test(t.name));
  const wos: WorkOrder[] = [];
  let w = 0;
  for (const t of field) {
    const kind: WorkOrder['kind'] = /commission/i.test(t.name) ? 'Commissioning' : /migrat/i.test(t.name) ? 'Migration' : /decommission/i.test(t.name) ? 'Decommission' : /shell|construction/i.test(t.name) ? 'Civil' : /fit-out|plant|change window/i.test(t.name) ? 'Electrical' : /cable/i.test(t.name) ? 'Cabling' : 'Install';
    const parts = kind === 'Install' || kind === 'Cabling' ? Math.min(3, Math.max(1, Math.ceil((p.racks || 1) / 4))) : kind === 'Electrical' && /fit-out/i.test(t.name) ? 2 : 1;
    for (let i = 0; i < parts; i++) {
      const s0 = t.start + ((t.end - t.start) / parts) * i, e0 = t.start + ((t.end - t.start) / parts) * (i + 1);
      const id = `WO-${pid.slice(4)}-${String(++w).padStart(2, '0')}`;
      const own = kind === 'Install' || kind === 'Cabling' || kind === 'Migration' || kind === 'Commissioning';
      const crew = own ? 'Own technicians' : kind === 'Civil' ? cr.civil : kind === 'Electrical' ? cr.electrical : cr.mechanical;
      const needs = pos.filter(o => o.due <= s0 + WEEK || /Racks|UPS|CDU|CRAH|GPU|Server|Equipment|Manifold/.test(o.item));
      const kitReady = needs.every(o => o.due <= s0 || o.state === 'Delivered');
      const derived: WorkOrder['state'] = delivered || e0 <= now ? 'Done' : s0 <= now ? 'In progress' : s0 - 14 * DAY <= now ? (kitReady ? 'Ready' : 'Awaiting change') : 'Planned';
      const state = overlay.wo.get(id) ?? derived;
      const racks = p.createdRacks.length ? p.createdRacks.slice(i * 4, i * 4 + 4) : [];
      wos.push({ id, projectId: pid, dcId: p.dcId, title: parts > 1 ? `${t.name} · part ${i + 1} of ${parts}` : t.name, kind, crew, crewKind: own ? 'Own technicians' : 'Contractor', start: s0, end: e0, state,
        changeId: `CR-${pid.slice(4)}${String(w).padStart(2, '0')}`, changeState: state === 'Done' ? 'Implemented' : state === 'In progress' || state === 'Ready' ? 'Approved' : state === 'Awaiting change' ? 'Pending approval' : 'Draft',
        rackIds: racks, kit: kitReady ? 'Ready' : needs.some(o => o.state === 'Delivered' || o.state === 'In transit') ? 'Partial' : 'Not ordered' });
    }
  }
  /* commissioning L1–L5 on the schedule */
  const mainPo = [...pos].sort((a, b) => b.total - a.total)[0];
  const cxTask = e.tasks.find(t => /commission/i.test(t.name));
  const installEnd = Math.max(...e.tasks.filter(t => !/commission/i.test(t.name)).map(t => t.end));
  const cxStart = cxTask?.start ?? installEnd, cxEnd = cxTask?.end ?? finish;
  const witness = [ppl[4] ?? 'QA lead', ppl[6] ?? 'Commissioning agent'];
  const mk = (level: CxTest['level'], name: string, scope: string, due: number): CxTest => {
    const key = `${pid}:L${level}`;
    const snags = level >= 3 ? Math.floor(between(r, 0, level === 5 ? 3 : 6)) : 0;
    const derived: CxTest['state'] = delivered || due <= now ? 'Passed' : due - 30 * DAY <= now ? 'Scheduled' : 'Not started';
    return { level, name, scope, due, state: overlay.tests.get(key) ?? derived, witness: witness[level % 2], snags: (overlay.tests.get(key) ?? derived) === 'Passed' ? 0 : snags };
  };
  const tests: CxTest[] = [
    mk(1, 'Factory witness test', mainPo ? `${mainPo.item} at ${mainPo.supplier}` : 'Main equipment', (mainPo?.due ?? cxStart) - 2 * WEEK),
    mk(2, 'Site acceptance (delivery and installation check)', 'Every delivered item against the BOM', mainPo?.due ?? cxStart),
    mk(3, 'Pre-functional (start-up)', 'Each system energised on its own', cxStart),
    mk(4, 'Functional performance', 'Each system through its operating modes', cxStart + (cxEnd - cxStart) / 2),
    mk(5, 'Integrated systems test (IST)', 'Utility loss, generator start, UPS transfer and cooling failover with load banks', cxEnd)
  ];
  /* permits by scope */
  const auth = activeGeo().id === 'in'
    ? { building: 'Municipal corporation', env: 'State pollution control board', fire: 'State fire services (Fire NOC)', elec: 'Chief Electrical Inspector (CEIG)', utility: 'State distribution company', occ: 'Municipal corporation' }
    : { building: 'County building department', env: 'State environmental agency', fire: 'Fire marshal (AHJ)', elec: 'Electrical inspector (AHJ)', utility: 'Electric utility', occ: 'County building department' };
  const permitDefs: [string, string, number][] = p.scope === 'new-site' ? [['Building permit', auth.building, start + 8 * WEEK], ['Environmental clearance (generators, fuel)', auth.env, start + 12 * WEEK], ['Utility power connection', auth.utility, start + 20 * WEEK], ['Fire safety approval', auth.fire, finish - 8 * WEEK], ['Electrical installation approval', auth.elec, finish - 6 * WEEK], ['Occupancy certificate', auth.occ, finish - 2 * WEEK]]
    : p.scope === 'new-hall' ? [['Fire safety approval for the hall', auth.fire, finish - 6 * WEEK], ['Electrical installation approval', auth.elec, finish - 4 * WEEK]]
    : p.scope === 'plant-upgrade' ? [[p.plant === 'Generator' ? 'Generator emission consent' : 'Electrical installation approval', p.plant === 'Generator' ? auth.env : auth.elec, finish - 2 * WEEK]]
    : p.scope === 'ai-pod' ? [['Electrical installation approval (busway)', auth.elec, finish - 3 * WEEK]] : [];
  const permits: Permit[] = permitDefs.map(([name, authority, due], i) => ({ id: `PMT-${pid.slice(4)}-${i + 1}`, projectId: pid, name, authority, due, submitted: due - 10 * WEEK < now ? due - 10 * WEEK : undefined, owner: manager,
    state: delivered || due <= now ? 'Granted' : due - 10 * WEEK <= now ? 'Submitted' : 'To submit' }));
  /* design documents */
  const docKinds: DesignDoc['kind'][] = p.scope === 'refresh' ? ['Design basis', 'Method statement', 'Cable schedule'] : p.scope === 'plant-upgrade' ? ['Design basis', 'Single-line diagram', 'Method statement']
    : ['Design basis', 'Single-line diagram', ...(p.cooling !== 'Air' || p.scope === 'new-site' || p.scope === 'new-hall' ? ['Cooling P&ID' as const] : []), 'Floor layout', 'Cable schedule', 'Method statement'];
  const docs: DesignDoc[] = [...docKinds, ...(delivered ? ['As-built' as const] : [])].map((kind, i) => {
    const issued = start + (i + 2) * WEEK;
    return { id: `DOC-${pid.slice(4)}-${i + 1}`, projectId: pid, title: `${kind} — ${p.name}`, kind, rev: delivered ? 'C' : issued <= now ? 'B' : 'A', state: kind === 'As-built' ? 'As-built' : issued <= now ? 'Issued for construction' : i < 2 ? 'In review' : 'Draft', updated: Math.min(now, issued), author: ppl[(i + 3) % ppl.length] ?? manager };
  });
  /* progress and cost */
  const planned = clamp((now - start) / Math.max(1, finish - start));
  const done = wos.filter(x => x.state === 'Done').length, total = Math.max(1, wos.length);
  const perf = between(r, 0.86, 1.04);
  const progress = delivered ? 1 : p.status === 'Approved' ? 0 : r2(clamp(Math.max(planned * perf, (done / total) * 0.9)));
  const budget = e.capexTotal, earned = Math.round(budget * progress);
  const costF = between(r, 0.94, 1.12);
  const actual = Math.round(earned * costF);
  const cpi = actual ? r2(earned / actual) : 1, spi = planned > 0.02 ? r2(progress / planned) : 1;
  const passed = tests.every(t => t.state === 'Passed');
  const openWo = wos.filter(x => x.state !== 'Done').length;
  const state: DeliveryProject['state'] = delivered ? 'Delivered' : p.status === 'Approved' ? 'Mobilising' : passed && !openWo ? 'Handover' : now >= cxStart ? 'Commissioning' : 'In progress';
  const late = finish > p.target || spi < 0.9;
  const project: DeliveryProject = {
    id: pid, planId: p.id, name: p.name, dcId: p.dcId, scope: p.scope, state, manager, start, finish, target: p.target, progress, plannedProgress: r2(planned), budget, earned, actual, cpi, spi,
    health: late ? 'late' : cpi < 0.95 || spi < 0.97 ? 'at risk' : 'on track', workOrders: wos.length, openWorkOrders: openWo, poOpen: pos.filter(o => o.state !== 'Delivered').length,
    permitsOpen: permits.filter(x => x.state !== 'Granted' && x.state !== 'Not needed').length, cxLevel: Math.max(0, ...tests.filter(t => t.state === 'Passed').map(t => t.level)), snags: tests.filter(t => t.state === 'Scheduled' || t.state === 'Failed').reduce((a, t) => a + t.snags, 0)
  };
  const history = [...p.history.map(h => ({ ...h })), ...(overlay.log.get(pid) ?? [])].sort((a, b) => a.at - b.at);
  return { project, milestones, workOrders: wos, pos, tests, permits, docs, history, plan: p, canHandover: !delivered && passed && !openWo && p.status === 'Executing' };
}

/* ---- the user's moves */
export function advanceWorkOrder(db: Db, woId: string, who: string): WorkOrder['state'] {
  const pv = deliveryProjects(db).find(v => v.workOrders.some(w => w.id === woId)); if (!pv) throw new Error('Unknown work order');
  const wo = pv.workOrders.find(w => w.id === woId)!;
  if (pv.project.state === 'Mobilising') throw new Error('The project has not started: execute the plan first');
  if (wo.state === 'Done') throw new Error('Already done');
  if (wo.state === 'Planned' || wo.state === 'Awaiting change') {
    if (wo.kit !== 'Ready') throw new Error(`Kit not on site (${wo.kit.toLowerCase()}): the work cannot start before its purchase orders land`);
  }
  const next: WorkOrder['state'] = wo.state === 'In progress' ? 'Done' : 'In progress';
  overlay.wo.set(woId, next);
  log(pv.project.id, who, `${woId} ${next === 'Done' ? 'completed' : 'started'} (${wo.title}); ${wo.changeId} ${next === 'Done' ? 'implemented' : 'approved'}`, db.now);
  return next;
}
export function runTest(db: Db, projectIdArg: string, level: number, who: string): CxTest['state'] {
  const v = deliveryProject(db, projectIdArg); if (!v) throw new Error('Unknown project');
  const t = v.tests.find(x => x.level === level); if (!t) throw new Error('Unknown test');
  if (t.state === 'Passed') throw new Error('Already passed');
  const before = v.tests.filter(x => x.level < level && x.state !== 'Passed');
  if (before.length) throw new Error(`Pass L${before[0].level} first: commissioning runs in order`);
  if (level >= 3 && v.workOrders.some(w => w.kind !== 'Commissioning' && w.state !== 'Done')) throw new Error('Finish the installation work orders before start-up testing');
  overlay.tests.set(`${projectIdArg}:L${level}`, 'Passed');
  log(projectIdArg, who, `L${level} ${t.name} passed${t.snags ? ` (${t.snags} snags closed)` : ''}`, db.now);
  return 'Passed';
}
export function handover(db: Db, projectIdArg: string, who: string) {
  const v = deliveryProject(db, projectIdArg); if (!v) throw new Error('Unknown project');
  if (!v.canHandover) throw new Error('Handover needs every work order done and L1–L5 passed');
  overlay.handed.set(projectIdArg, db.now);
  completeFromDelivery(db, v.plan.id, who);
  log(projectIdArg, who, 'Handover to operations signed: as-built issued, the plan is completed in the planner', db.now);
}
/* goods receipt: the delivery is checked in on site (the kit of the work orders that need it becomes ready) */
export function receivePo(db: Db, poId: string, who: string) {
  const v = deliveryProjects(db).find(x => x.pos.some(o => o.id === poId)); if (!v) throw new Error('Unknown purchase order');
  const o = v.pos.find(x => x.id === poId)!;
  if (o.state === 'Delivered') throw new Error('Already received');
  if (v.project.state === 'Mobilising') throw new Error('The project has not started: execute the plan first');
  overlay.po.add(poId);
  log(v.project.id, who, `${poId} received on site: ${o.qty} × ${o.item} from ${o.supplier}`, db.now);
}

