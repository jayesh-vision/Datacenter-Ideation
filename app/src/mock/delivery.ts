/* Delivery (13-Oct-2026, P2B merge phase 5). An approved or executing planner plan is a project; everything else follows from it:
   - milestones = the plan's schedule (lead times); progress is read against today, so a project is "late" only when its own dates say so;
   - work orders = the field-work milestones split into crew windows, each with its own delivery change request (CR-…) and a kit status
     from the purchase orders that must land before it starts;
   - purchase orders = the plan's sourced bill of materials: one order per vendor and phase, under the vendor's contract, for what is
     bought (site capacity and stock are not ordered). Once executed, the orders execution recorded; before that the same sourcing the
     plan pack shows, as Draft orders, so both screens list the same orders before and after. Ordered at approval (or the order-by
     date), due after their lead time. A plan with nothing to source falls back to its plant lines, racks and compute;
   - commissioning L1–L5 (factory witness → site acceptance → pre-functional → functional → integrated systems test) on the schedule's dates;
   - permits = the plan's permit register (by scope when the plan has none); design documents by scope; handover once L5 has passed
     and no work order is open: the plan is completed in the planner (bridge.completeFromDelivery, the planner's own completion).
   Delivery is the source of truth for the build (14-Oct-2026): the planner reads these records through compat/delivery/handoff
   (registered at the end of this file) and keeps only its holds and plan-type records. Cost: earned value = budget × progress, actual from a per-project factor, CPI / SPI from those.
   Derived per data version; the user's moves (start / complete a work order, run a test, hand over) live in an overlay. */
import type { ChangeOrder, CostPoint, CxTest, DeliveryMilestone, DeliveryProject, DeliveryProjectView, DesignDoc, Permit, PlannerPlan, Programme, ProgrammeView, ProjectRisk, PurchaseOrder, RiskCategory, WorkOrder } from '../api/types';
import { greenfieldProjects, seedPortfolio, synth, TEMPLATES, type TplProject } from './delivery-templates';
import type { Db } from './generate';
import { activeGeo } from './geo';
import { bridgedPlans, completeFromDelivery } from './p2b/bridge';
/* plans past approval in the planner (P2B port) + template projects (seeded portfolio and the user's), read in the delivery shape */
type Src = { plan: PlannerPlan; eval: { tasks: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[]; finish: number; capex: { line: string; amount: number; basis: string }[]; capexTotal: number }; template?: string };
function sources(db: Db): Src[] {
  const b = bridgedPlans(db);
  const seed = seedPortfolio(db, b.map(x => x.plan.id), id => b.find(x => x.plan.id === id)?.eval.finish);
  /* a template project the user started runs from that day (its status is part of the view cache key) */
  const live = (x: TplProject): TplProject => { const at = overlay.started.get(projectId(x.id)); return at ? { ...x, status: 'Executing', start: Math.min(x.start, at) } : x; };
  return [...b.map(x => ({ plan: x.plan, eval: x.eval })), ...[...seed.projects, ...overlay.projects].map(live).map(synth)];
}
function allProgrammes(db: Db): Programme[] {
  const b = bridgedPlans(db);
  const seed = seedPortfolio(db, b.map(x => x.plan.id), id => b.find(x => x.plan.id === id)?.eval.finish).programmes;
  return [...seed, ...overlay.programmes].map(g => ({ ...g, status: overlay.progStatus.get(g.id) ?? g.status, projectIds: [...g.projectIds, ...overlay.projects.filter(p => p.programmeId === g.id && !g.projectIds.includes(projectId(p.id))).map(p => projectId(p.id))], deps: { ...g.deps, ...(overlay.deps.get(g.id) ?? {}) } }));
}
import { notifyPlanner, plannerDb } from './p2b';
import { toUsd } from './p2b/adapter';
import { registerDelivery, type DeliveryRef } from '../planner/compat/delivery/handoff';
/* the planner's own record for a plan in delivery (sourced orders, permit register); template projects have none */
const bridged = (db: Db, p: PlannerPlan) => bridgedPlans(db).find(b => b.plan.id === p.id);
import { mulberry32, seedOf, between } from '../lib/rng';
import { DAY } from './seed';

const WEEK = 7 * DAY;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (n: number) => Math.round(n * 100) / 100;
interface Overlay {
  po: Set<string>; wo: Map<string, WorkOrder['state']>; tests: Map<string, CxTest['state']>; handed: Map<string, number>; log: Map<string, { at: number; who: string; text: string }[]>;
  /* 14-Oct-2026: the user's projects and programmes, programme status, dependencies, change orders and risks */
  projects: TplProject[]; programmes: Programme[]; progStatus: Map<string, Programme['status']>; deps: Map<string, Record<string, string[]>>;
  started: Map<string, number>; assign: Map<string, { crewKind: WorkOrder['crewKind']; crew: string }>; cos: Map<string, ChangeOrder[]>; coState: Map<string, Pick<ChangeOrder, 'state' | 'decidedBy' | 'decidedAt' | 'note'>>; risks: Map<string, ProjectRisk[]>; riskState: Map<string, ProjectRisk['state']>; seq: number;
}
const overlay: Overlay = { po: new Set(), wo: new Map(), tests: new Map(), handed: new Map(), log: new Map(), projects: [], programmes: [], progStatus: new Map(), deps: new Map(), started: new Map(), assign: new Map(), cos: new Map(), coState: new Map(), risks: new Map(), riskState: new Map(), seq: 0 };
export const resetDelivery = () => { overlay.po.clear(); overlay.wo.clear(); overlay.tests.clear(); overlay.handed.clear(); overlay.log.clear(); overlay.projects.length = 0; overlay.programmes.length = 0; overlay.progStatus.clear(); overlay.deps.clear(); overlay.started.clear(); overlay.assign.clear(); overlay.cos.clear(); overlay.coState.clear(); overlay.risks.clear(); overlay.riskState.clear(); overlay.seq = 0; vCache = null; };
let vCache: { key: string; list: DeliveryProjectView[] } | null = null;

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

export function deliveryProjects(db: Db): DeliveryProjectView[] {
  const src = sources(db);
  const key = `${db.now}|${src.map(x => `${x.plan.id}:${x.plan.status}:${x.plan.updated}`).join(',')}|${JSON.stringify([...overlay.wo, ...overlay.tests, ...overlay.handed, ...overlay.po, ...overlay.coState, ...overlay.riskState, ...overlay.assign].map(x => JSON.stringify(x)))}|${overlay.projects.length}|${[...overlay.cos.values(), ...overlay.risks.values()].flat().length}|${overlay.programmes.length}|${overlay.deps.size}`;
  if (vCache && vCache.key === key) return vCache.list;
  const views = src.filter(x => inDelivery(x.plan)).map(x => view(db, x));
  /* programme gates: a project waits until the projects it depends on are delivered */
  const byId = new Map(views.map(v => [v.project.id, v]));
  for (const g of allProgrammes(db)) for (const pid of g.projectIds) {
    const v = byId.get(pid); if (!v) continue;
    v.project.programmeId = g.id;
    const waits = (g.deps[pid] ?? []).filter(d => byId.get(d) && byId.get(d)!.project.state !== 'Delivered');
    if (!waits.length || v.project.state === 'Delivered') continue;
    v.project.waitsOn = waits;
    v.project.state = 'Mobilising';
    for (const w of v.workOrders) if (w.state !== 'Done' && !overlay.wo.has(w.id)) { w.state = 'Planned'; w.changeState = 'Draft'; }
    v.risks.push({ id: `RSK-${pid}-wait`, projectId: pid, title: `Waits on ${waits.map(d => byId.get(d)!.project.name).join(', ')}`, category: 'Schedule', likelihood: 3, impact: 3, mitigation: 'Track the predecessor; keep long-lead orders moving so the gate is the only wait', owner: v.project.manager, state: overlay.riskState.get(`RSK-${pid}-wait`) ?? 'Open', derived: true, raised: db.now });
  }
  vCache = { key, list: views };
  return views;
}
export function deliveryProject(db: Db, id: string): DeliveryProjectView | null { return deliveryProjects(db).find(v => v.project.id === id) ?? null; }

function view(db: Db, src: Src): DeliveryProjectView {
  const now = db.now;
  const p = src.plan;
  const pid = projectId(p.id);
  const e = src.eval;
  const r = mulberry32(seedOf(`delivery:${p.id}`));
  const ppl = activeGeo().people;
  const manager = ppl[(seedOf(p.id) % 6) + 2] ?? p.owner;
  const start = e.tasks[0]?.start ?? p.created, finish = e.finish;
  const approvedAt = p.approvals[p.approvals.length - 1]?.at ?? p.created;
  const delivered = p.status === 'Delivered' || overlay.handed.has(pid);
  /* milestones */
  const milestones: DeliveryMilestone[] = e.tasks.map(t => ({ name: t.name, start: t.start, end: t.end, longLead: t.longLead, state: delivered || t.end <= now ? 'done' : t.start <= now ? 'active' : 'next' }));
  /* purchase orders: the sourced orders (one per vendor and phase; drafts until executed), else the plant lines, racks and compute */
  const pos: PurchaseOrder[] = [];
  let k = 0;
  const { vendorOrders, planned: draftPos } = bridged(db, p) ?? {};
  const poState = (poId: string, due: number, late: boolean): PurchaseOrder['state'] => overlay.po.has(poId) ? 'Delivered' : draftPos && !delivered ? 'Draft' : p.status === 'Approved' && !delivered ? 'Ordered' : delivered || due + (late ? 3 * WEEK : 0) < now ? (late && due + 3 * WEEK > now ? 'Late' : 'Delivered') : due - 2 * WEEK < now ? 'In transit' : 'Ordered';
  if (vendorOrders?.length) for (const v of vendorOrders) {
    const qty = v.lines.reduce((a, l) => a + l.qty, 0) || 1;
    const lead = v.leadWeeks || 8;
    const ordered = Math.max(approvedAt, start, v.orderBy ? new Date(v.orderBy).getTime() : 0);
    const due = ordered + lead * WEEK;
    const late = !delivered && p.status === 'Executing' && due < now && r() < 0.18;
    const poId = `PO-${pid.slice(4)}-${String(++k).padStart(2, '0')}`;
    pos.push({ id: poId, projectId: pid, supplier: v.vendorName, item: v.lines.map(l => `${l.qty} × ${l.model ?? l.item}`).join(', ') + (v.phaseName ? ` · ${v.phaseName}` : ''), qty, unitCost: Math.round(v.value / qty), total: v.value,
      ordered, due: late ? due + 3 * WEEK : due, leadWeeks: lead, state: poState(poId, due, late), contract: v.contractLabel, lines: v.lines.map(l => ({ item: l.model ?? l.item, qty: l.qty })) });
  }
  else for (const c of e.capex) {
    const cat = catOf(c.line); if (!cat) continue;
    const qty = Number(/^(\d+)\s*×/.exec(c.basis)?.[1] ?? 1);
    const ordered = Math.max(approvedAt, start);
    const due = ordered + LEAD[cat] * WEEK;
    const late = !delivered && p.status === 'Executing' && due < now && r() < 0.18;
    const poId = `PO-${pid.slice(4)}-${String(++k).padStart(2, '0')}`;
    pos.push({ id: poId, projectId: pid, supplier: SUPPLIER[cat][seedOf(`${p.id}${cat}`) % 2], item: c.line, qty, unitCost: Math.round(c.amount / Math.max(1, qty)), total: c.amount,
      ordered, due: late ? due + 3 * WEEK : due, leadWeeks: LEAD[cat], state: poState(poId, due, late) });
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
      /* nothing is under way before the build starts: an approved (mobilising) project's work is at most ready */
      const notStarted = !delivered && p.status === 'Approved';
      const derived: WorkOrder['state'] = notStarted ? (s0 - 14 * DAY <= now ? (kitReady ? 'Ready' : 'Awaiting change') : 'Planned')
        : delivered || e0 <= now ? 'Done' : s0 <= now ? 'In progress' : s0 - 14 * DAY <= now ? (kitReady ? 'Ready' : 'Awaiting change') : 'Planned';
      const state = overlay.wo.get(id) ?? derived;
      const asg = overlay.assign.get(id);
      const racks = p.createdRacks.length ? p.createdRacks.slice(i * 4, i * 4 + 4) : [];
      wos.push({ id, projectId: pid, dcId: p.dcId, title: parts > 1 ? `${t.name} · part ${i + 1} of ${parts}` : t.name, kind, crew: asg?.crew ?? crew, crewKind: asg?.crewKind ?? (own ? 'Own technicians' : 'Contractor'), start: s0, end: e0, state,
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
  /* the plan's own permit register when it has one (the planner's living list), else the scope's usual permits */
  const register = bridged(db, p)?.source.permits ?? [];
  const PERMIT_STATE: Record<string, Permit['state']> = { Approved: 'Granted', Applied: 'Submitted', 'In review': 'Submitted', Expired: 'Expired', 'Not started': 'To submit' };
  const permits: Permit[] = register.length
    ? register.map((pm, i) => { const due = new Date(pm.neededBefore).getTime(); const filed = pm.appliedAt ? new Date(pm.appliedAt).getTime() : due - pm.leadWeeks * WEEK; const state: Permit['state'] = delivered ? 'Granted' : PERMIT_STATE[pm.status] ?? 'To submit';
      return { id: `PMT-${pid.slice(4)}-${i + 1}`, projectId: pid, name: pm.name, authority: pm.authority, due, submitted: state === 'Submitted' || state === 'Granted' ? Math.min(filed, now) : undefined, owner: manager, state }; })
    : permitDefs.map(([name, authority, due], i) => ({ id: `PMT-${pid.slice(4)}-${i + 1}`, projectId: pid, name, authority, due, submitted: due - 10 * WEEK < now ? due - 10 * WEEK : undefined, owner: manager,
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
  /* change orders: approved ones move the budget and the finish */
  const cos = [...seedCos(pid, e.capexTotal, now), ...(overlay.cos.get(pid) ?? [])].map(c => ({ ...c, ...(overlay.coState.get(c.id) ?? {}) }));
  const okCo = cos.filter(c => c.state === 'Approved');
  const shift = okCo.reduce((a, c) => a + c.scheduleDays, 0) * DAY;
  const project: DeliveryProject = {
    template: src.template, budgetApproved: e.capexTotal + okCo.reduce((a, c) => a + c.budgetDelta, 0), baselineFinish: finish,
    id: pid, planId: src.template ? '' : p.id, name: p.name, dcId: p.dcId, scope: p.scope, state, manager, start, finish, target: p.target, progress, plannedProgress: r2(planned), budget, earned, actual, cpi, spi,
    health: late ? 'late' : cpi < 0.95 || spi < 0.97 ? 'at risk' : 'on track', workOrders: wos.length, openWorkOrders: openWo, poOpen: pos.filter(o => o.state !== 'Delivered').length,
    permitsOpen: permits.filter(x => x.state !== 'Granted' && x.state !== 'Not needed').length, cxLevel: Math.max(0, ...tests.filter(t => t.state === 'Passed').map(t => t.level)), snags: tests.filter(t => t.state === 'Scheduled' || t.state === 'Failed').reduce((a, t) => a + t.snags, 0)
  };
  if (shift) { project.finish += shift; if (project.finish > project.target) project.health = 'late'; }
  const history = [...p.history.map(h => ({ ...h })), ...(overlay.log.get(pid) ?? [])].sort((a, b) => a.at - b.at);
  /* risks: what the delivery data itself flags, plus the ones raised by hand */
  const rk: ProjectRisk[] = [];
  const add = (k: string, title: string, category: RiskCategory, likelihood: number, impact: number, mitigation: string) => rk.push({ id: `RSK-${pid}-${k}`, projectId: pid, title, category, likelihood, impact, mitigation, owner: manager, state: overlay.riskState.get(`RSK-${pid}-${k}`) ?? 'Open', derived: true, raised: now });
  if (!delivered) {
    for (const o of pos.filter(x => x.state === 'Late')) add(`po-${o.id}`, `${o.item} from ${o.supplier} is late (now ${fmtD(o.due)})`, 'Supply', 4, 4, 'Expedite with the supplier and re-sequence the work orders that need it');
    for (const o of pos.filter(x => x.leadWeeks >= 20 && x.state !== 'Delivered')) add(`ll-${o.id}`, `Long-lead ${o.item} (${o.leadWeeks} weeks) gates the install`, 'Supply', 2, 4, 'Weekly supplier progress review; factory witness test booked');
    for (const x of permits.filter(q => q.state !== 'Granted' && q.due - now < 6 * WEEK)) add(`pm-${x.id}`, `${x.name} not granted yet (needed ${fmtD(x.due)})`, 'Permit', 3, 4, `Escalate with ${x.authority}; hold dependent work orders`);
    if (cpi < 0.97) add('cost', `Spending ahead of progress (CPI ${cpi})`, 'Cost', 3, 3, 'Review the cost-to-complete; raise a change order if the scope grew');
    if (spi < 0.95 || finish > p.target) add('sched', `Behind schedule (SPI ${spi}${finish > p.target ? `, finish after target ${fmtD(p.target)}` : ''})`, 'Schedule', 4, 3, 'Add a crew window or re-sequence; agree a new date with the sponsor');
    if (project.snags) add('snag', `${project.snags} commissioning snags open`, 'Quality', 2, 2, 'Close the snags before the next level is witnessed');
    if (wos.some(w => w.crewKind === 'Contractor' && w.state !== 'Done')) add('crew', 'Contractor crews on site in live areas', 'Safety', 2, 4, 'Method statements approved, permit-to-work and escorted access');
  }
  const risks = [...rk, ...(overlay.risks.get(pid) ?? []).map(x => ({ ...x, state: overlay.riskState.get(x.id) ?? x.state }))];
  /* cost curve: planned value from the schedule, earned and actual up to today */
  const t0 = start, t1 = Math.max(project.finish, now), step = Math.max(14 * DAY, (t1 - t0) / 30);
  const costCurve: CostPoint[] = [];
  const ticks: number[] = []; for (let t = t0; t <= t1 + 1; t += step) ticks.push(t);
  if (now > t0 && now < t1) ticks.push(now);
  for (const t of ticks.sort((a, b) => a - b)) { const f = clamp((now - t0) > 0 ? (Math.min(t, now) - t0) / (now - t0) : 0); costCurve.push({ t, pv: Math.round(project.budgetApproved * clamp((t - t0) / Math.max(1, project.finish - t0))), ev: t <= now ? Math.round(earned * f) : null, ac: t <= now ? Math.round(actual * f) : null }); }
  return { project, milestones, workOrders: wos, pos, tests, permits, docs, history, plan: src.template ? undefined : p, canHandover: !delivered && passed && !openWo && p.status === 'Executing', risks, changeOrders: cos, costCurve };
}

/* ---- the user's moves */
export function advanceWorkOrder(db: Db, woId: string, who: string): WorkOrder['state'] {
  const pv = deliveryProjects(db).find(v => v.workOrders.some(w => w.id === woId)); if (!pv) throw new Error('Unknown work order');
  const wo = pv.workOrders.find(w => w.id === woId)!;
  if (pv.project.waitsOn?.length) throw new Error(`The project waits on ${pv.project.waitsOn.join(', ')}: its programme gate opens when they are delivered`);
  if (pv.project.state === 'Mobilising') throw new Error(pv.project.template ? 'The project has not started yet: start it first' : 'The project has not started: execute the plan first');
  if (wo.state === 'Done') throw new Error('Already done');
  if (wo.state === 'Failed') throw new Error('The work order failed: re-plan it first');
  if (wo.state === 'Planned' || wo.state === 'Awaiting change') {
    if (wo.kit !== 'Ready') throw new Error(`Kit not on site (${wo.kit.toLowerCase()}): the work cannot start before its purchase orders land`);
  }
  const next: WorkOrder['state'] = wo.state === 'In progress' ? 'Done' : 'In progress';
  overlay.wo.set(woId, next); notifyPlanner();
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
  overlay.tests.set(`${projectIdArg}:L${level}`, 'Passed'); notifyPlanner();
  log(projectIdArg, who, `L${level} ${t.name} passed${t.snags ? ` (${t.snags} snags closed)` : ''}`, db.now);
  return 'Passed';
}
export function handover(db: Db, projectIdArg: string, who: string, notes?: string) {
  const v = deliveryProject(db, projectIdArg); if (!v) throw new Error('Unknown project');
  if (!v.canHandover) throw new Error('Handover needs every work order done and L1–L5 passed');
  overlay.handed.set(projectIdArg, db.now);
  const planned = v.plan && bridged(db, v.plan) ? v.plan : undefined;
  log(projectIdArg, who, `Handover to operations signed: as-built issued${planned ? ', the plan is completed in the planner' : ''}`, db.now);
  if (planned) { completeFromDelivery(db, planned.id, who, notes); notifyPlanner(); }
}
/* goods receipt: the delivery is checked in on site (the kit of the work orders that need it becomes ready) */
export function receivePo(db: Db, poId: string, who: string) {
  const v = deliveryProjects(db).find(x => x.pos.some(o => o.id === poId)); if (!v) throw new Error('Unknown purchase order');
  const o = v.pos.find(x => x.id === poId)!;
  if (o.state === 'Delivered') throw new Error('Already received');
  if (v.project.state === 'Mobilising') throw new Error('The project has not started: execute the plan first');
  overlay.po.add(poId); notifyPlanner();
  log(v.project.id, who, `${poId} received on site: ${o.qty} × ${o.item} from ${o.supplier}`, db.now);
}


/* ---- 14-Oct-2026 additions: programmes, template projects, change orders, risks --------------------------------------------- */
const fmtD = (t: number) => new Date(t).toISOString().slice(0, 10);
function seedCos(pid: string, budget: number, now: number): ChangeOrder[] {
  const ppl = activeGeo().people;
  if (pid === 'PRJ-0003') return [{ id: 'CO-0003-01', projectId: pid, title: 'Crane lift re-plan for the chiller', reason: 'The roof lift needs a larger crane and a weekend road closure', budgetDelta: Math.round(budget * 0.018), scheduleDays: 14, state: 'Submitted', approver: approverFor(budget * 0.018, budget), raisedBy: ppl[5] ?? 'Site lead', raisedAt: now - 2 * DAY }];
  if (pid === 'PRJ-1007') return [{ id: 'CO-1007-01', projectId: pid, title: 'Deeper racks for the new GPU servers', reason: 'The replacement servers need 1,200 mm racks instead of 1,000 mm', budgetDelta: Math.round(budget * 0.06), scheduleDays: 5, state: 'Approved', approver: approverFor(budget * 0.06, budget), raisedBy: ppl[6] ?? 'Site lead', raisedAt: now - 20 * DAY, decidedBy: ppl[1] ?? 'Sponsor', decidedAt: now - 18 * DAY }];
  return [];
}
const approverFor = (delta: number, budget: number) => (Math.abs(delta) <= budget * 0.05 ? 'Project manager' : Math.abs(delta) <= budget * 0.15 ? 'Programme sponsor' : 'Investment committee');

export function deliveryProgrammes(db: Db): ProgrammeView[] {
  const vs = deliveryProjects(db), byId = new Map(vs.map(v => [v.project.id, v]));
  return allProgrammes(db).map(g => {
    const pv = g.projectIds.map(id => byId.get(id)).filter(Boolean) as DeliveryProjectView[];
    const ps = pv.map(v => v.project);
    const budget = ps.reduce((a, p) => a + p.budgetApproved, 0), earned = ps.reduce((a, p) => a + p.earned, 0), actual = ps.reduce((a, p) => a + p.actual, 0);
    const late = ps.filter(p => p.health === 'late' && p.state !== 'Delivered').length, risk = ps.filter(p => p.health === 'at risk' && p.state !== 'Delivered').length;
    const gates = pv.map(v => ({ projectId: v.project.id, waitsOn: v.project.waitsOn ?? [], permits: (!v.permits.length ? 'none' : v.permits.every(x => x.state === 'Granted') ? 'granted' : 'pending') as 'none' | 'granted' | 'pending',
      design: (v.docs.every(x => x.state === 'Issued for construction' || x.state === 'As-built') ? 'issued' : 'in progress') as 'issued' | 'in progress', ready: !(v.project.waitsOn ?? []).length }));
    return {
      programme: g, projects: ps, rag: late ? 'red' : risk ? 'amber' : 'green', completion: budget ? ps.reduce((a, p) => a + p.progress * p.budgetApproved, 0) / budget : 0, budget, earned, actual,
      start: Math.min(...ps.map(p => p.start), g.created), baselineFinish: Math.max(0, ...ps.map(p => p.baselineFinish)), forecastFinish: Math.max(0, ...ps.map(p => p.finish)), gates,
      risks: pv.flatMap(v => v.risks).filter(r => r.state !== 'Closed').sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact),
      materials: pv.map(v => ({ projectId: v.project.id, open: v.pos.filter(o => o.state !== 'Delivered').length, late: v.pos.filter(o => o.state === 'Late').length, inTransit: v.pos.filter(o => o.state === 'In transit').length, delivered: v.pos.filter(o => o.state === 'Delivered').length, value: v.pos.reduce((a, o) => a + o.total, 0) })),
      openWorkOrders: pv.reduce((a, v) => a + v.workOrders.filter(w => w.state !== 'Done').length, 0), changeOrders: pv.flatMap(v => v.changeOrders),
      costCurve: sumCurves(pv.map(v => v.costCurve), db.now),
      history: [...(overlay.log.get(g.id) ?? []), ...pv.flatMap(v => v.history.slice(-4).map(h => ({ ...h, text: `${v.project.id}: ${h.text}` })))].sort((a, b) => b.at - a.at).slice(0, 30)
    };
  });
}
export const deliveryProgramme = (db: Db, id: string) => deliveryProgrammes(db).find(g => g.programme.id === id) ?? null;
const bump = () => { vCache = null; };

export function createTemplateProject(db: Db, x: { template: string; name: string; dcId: string; start: number; qty: number; manager: string; programmeId?: string; dependsOn?: string[] }, who: string) {
  const t = TEMPLATES.find(k => k.key === x.template); if (!t) throw new Error('Unknown template');
  if (!x.name.trim()) throw new Error('Give the project a name');
  if (!db.datacenters.some(d => d.id === x.dcId)) throw new Error('Pick a datacenter');
  if (x.qty < 1 || x.qty > 500) throw new Error(`Quantity must be 1–500 ${t.unit ?? ''}`);
  if (x.start < db.now - 7 * DAY) throw new Error('The start cannot be in the past');
  const id = `PLN-${3000 + ++overlay.seq}`;
  overlay.projects.push({ id, template: t.key, name: x.name.trim(), dcId: x.dcId, start: x.start, qty: x.qty, manager: x.manager || who, status: x.start <= db.now ? 'Executing' : 'Approved', programmeId: x.programmeId, created: db.now });
  if (x.programmeId && x.dependsOn?.length) overlay.deps.set(x.programmeId, { ...(overlay.deps.get(x.programmeId) ?? {}), [projectId(id)]: x.dependsOn });
  log(projectId(id), who, `Project created from the ${t.name} template (${x.qty} ${t.unit ?? ''})`, db.now);
  bump(); return projectId(id);
}
export function startTemplateProject(db: Db, pid: string, who: string) {
  const v = deliveryProject(db, pid); if (!v) throw new Error('Unknown project');
  if (v.project.waitsOn?.length) throw new Error(`Waits on ${v.project.waitsOn.join(', ')}`);
  if (!v.project.template) throw new Error('Planner projects start from the planner (Start the build)');
  if (v.project.state !== 'Mobilising' || overlay.started.has(pid)) throw new Error('Already started');
  overlay.started.set(pid, db.now);
  log(pid, who, 'Project started: crews mobilised, purchase orders placed', db.now); bump();
}
export function createProgramme(db: Db, x: { name: string; type: Programme['type']; description: string; sponsor: string; manager: string; projectIds: string[]; blueprint?: { dcId: string; site: string; start: number } }, who: string) {
  if (!x.name.trim()) throw new Error('Give the programme a name');
  const id = `PGM-${String(10 + ++overlay.seq).padStart(2, '0')}`;
  const g: Programme = { id, name: x.name.trim(), type: x.type, description: x.description, sponsor: x.sponsor || who, manager: x.manager || who, status: 'Active', created: db.now, projectIds: [], deps: {} };
  const taken = new Set(allProgrammes(db).flatMap(p => p.projectIds));
  for (const pid of x.projectIds) { if (taken.has(pid)) throw new Error(`${pid} is already in another programme`); g.projectIds.push(pid); }
  if (x.blueprint) {
    if (x.blueprint.start < db.now - 7 * DAY) throw new Error('The kick-off cannot be in the past');
    const gf = greenfieldProjects(overlay.seq, x.blueprint.dcId, x.blueprint.site, x.blueprint.start, g.manager, id);
    overlay.projects.push(...gf.projects.map(q => ({ ...q, created: db.now }))); g.deps = gf.deps; g.blueprint = 'Greenfield datacenter build';
  }
  overlay.programmes.push(g);
  log(id, who, `Programme created${x.blueprint ? ' from the greenfield blueprint: 6 phases, each gated on the ones before it' : ` with ${x.projectIds.length} project${x.projectIds.length === 1 ? '' : 's'}`}`, db.now);
  bump(); return id;
}
export function setProgrammeStatus(db: Db, id: string, to: Programme['status'], who: string) {
  const g = deliveryProgramme(db, id); if (!g) throw new Error('Unknown programme');
  if (to === 'Closed' && g.projects.some(p => p.state !== 'Delivered')) throw new Error(`${g.projects.filter(p => p.state !== 'Delivered').length} project(s) are not delivered yet`);
  overlay.progStatus.set(id, to); log(id, who, `Programme ${to === 'Active' ? 'reactivated' : to === 'On hold' ? 'put on hold' : 'closed'}`, db.now); bump();
}
export function raiseChangeOrder(db: Db, pid: string, x: { title: string; reason: string; budgetDelta: number; scheduleDays: number }, who: string) {
  const v = deliveryProject(db, pid); if (!v) throw new Error('Unknown project');
  if (v.project.state === 'Delivered') throw new Error('The project is delivered; raise a new project instead');
  if (!x.title.trim() || !x.reason.trim()) throw new Error('Say what changes and why');
  if (!x.budgetDelta && !x.scheduleDays) throw new Error('A change order moves the budget, the finish date or both');
  const n = (overlay.cos.get(pid) ?? []).length + v.changeOrders.length + 1;
  const co: ChangeOrder = { id: `CO-${pid.slice(4)}-${String(n).padStart(2, '0')}`, projectId: pid, title: x.title.trim(), reason: x.reason.trim(), budgetDelta: x.budgetDelta, scheduleDays: x.scheduleDays, state: 'Submitted', approver: approverFor(x.budgetDelta, v.project.budgetApproved), raisedBy: who, raisedAt: db.now };
  overlay.cos.set(pid, [...(overlay.cos.get(pid) ?? []), co]);
  log(pid, who, `${co.id} raised: ${co.title} (${x.budgetDelta >= 0 ? '+' : ''}${x.budgetDelta} · ${x.scheduleDays >= 0 ? '+' : ''}${x.scheduleDays} days), for the ${co.approver.toLowerCase()}`, db.now);
  bump(); return co;
}
export function decideChangeOrder(db: Db, coId: string, decision: 'Approved' | 'Rejected', note: string, who: string) {
  const v = deliveryProjects(db).find(x => x.changeOrders.some(c => c.id === coId)); if (!v) throw new Error('Unknown change order');
  const co = v.changeOrders.find(c => c.id === coId)!;
  if (co.state !== 'Submitted') throw new Error(`Already ${co.state.toLowerCase()}`);
  if (decision === 'Rejected' && !note.trim()) throw new Error('Say why it is rejected');
  overlay.coState.set(coId, { state: decision, decidedBy: who, decidedAt: db.now, note: note.trim() || undefined });
  log(v.project.id, who, `${coId} ${decision.toLowerCase()} as ${co.approver.toLowerCase()}${note ? `: ${note}` : ''}`, db.now); bump();
}
export function addRisk(db: Db, pid: string, x: { title: string; category: RiskCategory; likelihood: number; impact: number; mitigation: string; owner: string }, who: string) {
  const v = deliveryProject(db, pid); if (!v) throw new Error('Unknown project');
  if (!x.title.trim()) throw new Error('Describe the risk');
  const id = `RSK-${pid}-M${++overlay.seq}`;
  overlay.risks.set(pid, [...(overlay.risks.get(pid) ?? []), { id, projectId: pid, title: x.title.trim(), category: x.category, likelihood: x.likelihood, impact: x.impact, mitigation: x.mitigation.trim(), owner: x.owner || who, state: 'Open', derived: false, raised: db.now }]);
  log(pid, who, `Risk raised: ${x.title.trim()} (${x.category}, score ${x.likelihood * x.impact})`, db.now); bump(); return id;
}
export function setRiskState(db: Db, riskId: string, to: ProjectRisk['state'], who: string) {
  const v = deliveryProjects(db).find(x => x.risks.some(r => r.id === riskId)); if (!v) throw new Error('Unknown risk');
  overlay.riskState.set(riskId, to); log(v.project.id, who, `Risk ${to === 'Closed' ? 'closed' : to === 'Mitigating' ? 'being mitigated' : 'reopened'}: ${v.risks.find(r => r.id === riskId)!.title}`, db.now); bump();
}

/* sum several projects' cost curves on one grid (programme and portfolio views) */
export function sumCurves(curves: CostPoint[][], now: number): CostPoint[] {
  const all = curves.flat(); if (!all.length) return [];
  const t0 = Math.min(...all.map(p => p.t)), t1 = Math.max(...all.map(p => p.t)), step = Math.max(14 * DAY, (t1 - t0) / 30);
  const at = (c: CostPoint[], t: number, k: 'pv' | 'ev' | 'ac') => { let v = 0; for (const p of c) { if (p.t > t) break; if (p[k] != null) v = p[k] as number; } return v; };
  const out: CostPoint[] = [];
  const ticks: number[] = []; for (let t = t0; t <= t1 + 1; t += step) ticks.push(t);
  if (now > t0 && now < t1) ticks.push(now);
  for (const t of ticks.sort((a, b) => a - b)) out.push({ t, pv: curves.reduce((a, c) => a + at(c, t, 'pv'), 0), ev: t <= now ? curves.reduce((a, c) => a + at(c, t, 'ev'), 0) : null, ac: t <= now ? curves.reduce((a, c) => a + at(c, t, 'ac'), 0) : null });
  return out;
}

/* work-order moves from the work order page (mock/workflow.ts) */
export function setWorkOrderState(db: Db, woId: string, to: WorkOrder['state'], who: string, text: string) {
  const pv = deliveryProjects(db).find(v => v.workOrders.some(w => w.id === woId)); if (!pv) throw new Error('Unknown work order');
  overlay.wo.set(woId, to); log(pv.project.id, who, text, db.now); vCache = null;
}
export function setWorkOrderAssignment(_db: Db, woId: string, a: { crewKind: WorkOrder['crewKind']; crew: string }) { overlay.assign.set(woId, a); vCache = null; }

/* ---- the planner's handle on Delivery (compat/delivery/handoff): money back in the planner's dollars, dates as ISO */
const isoOf = (t: number) => new Date(t).toISOString();
function refOf(v: DeliveryProjectView): DeliveryRef {
  const x = v.project;
  return {
    projectId: x.id, state: x.state, health: x.health, manager: x.manager, start: isoOf(x.start), finish: isoOf(x.finish), progress: x.progress, plannedProgress: x.plannedProgress,
    budgetUsd: Math.round(toUsd(x.budget)), earnedUsd: Math.round(toUsd(x.earned)), actualUsd: Math.round(toUsd(x.actual)), cpi: x.cpi, spi: x.spi,
    purchaseOrders: v.pos.map(o => ({ id: o.id, supplier: o.supplier, item: o.item, contract: o.contract, totalUsd: Math.round(toUsd(o.total)), due: isoOf(o.due), leadWeeks: o.leadWeeks, state: o.state })),
    workOrders: v.workOrders.map(w => ({ id: w.id, title: w.title, kind: w.kind, crew: w.crew, start: isoOf(w.start), end: isoOf(w.end), state: w.state, changeId: w.changeId, changeState: w.changeState })),
    tests: v.tests.map(t => ({ level: t.level, name: t.name, state: t.state, due: isoOf(t.due) })),
    permits: v.permits.map(pm => ({ id: pm.id, name: pm.name, authority: pm.authority, due: isoOf(pm.due), state: pm.state })),
    docs: v.docs.map(d => ({ id: d.id, title: d.title, kind: d.kind, state: d.state })),
    canHandover: v.canHandover, handedOver: x.state === 'Delivered',
  };
}
registerDelivery({
  project: plnId => { const db = plannerDb(); if (!db) return null; const v = deliveryProject(db, projectId(plnId)); return v ? refOf(v) : null; },
  handover: (plnId, who, notes) => { const db = plannerDb(); if (!db) throw new Error('Delivery is not available'); handover(db, projectId(plnId), who, notes); },
});
