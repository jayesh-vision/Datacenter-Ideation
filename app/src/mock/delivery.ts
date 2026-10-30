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
  const seed = seedPortfolio(db, b.map(x => x.plan.id), id => b.find(x => x.plan.id === id)?.eval.finish, plannerTitle(db));
  /* a template project the user started runs from that day (its status is part of the view cache key) */
  const live = (x: TplProject): TplProject => { const at = overlay.started.get(projectId(x.id)); return at ? { ...x, status: 'Executing', start: Math.min(x.start, at) } : x; };
  return [...b.map(x => ({ plan: x.plan, eval: x.eval })), ...[...seed.projects, ...overlay.projects].map(live).map(synth)];
}
/* a planner plan's title in any status (the seeded programmes name the hall PLN-0002 fits out, approved or not) */
function plannerTitle(db: Db) {
  const all = p2bStore(db).getAllRaw('plannerPlans') as unknown as { plnId: string; title: string }[];
  return (id: string) => all.find(p => p.plnId === id)?.title;
}
function allProgrammes(db: Db): Programme[] {
  const b = bridgedPlans(db);
  const seed = seedPortfolio(db, b.map(x => x.plan.id), id => b.find(x => x.plan.id === id)?.eval.finish, plannerTitle(db)).programmes;
  return [...seed, ...overlay.programmes].map(g => ({ ...g, status: overlay.progStatus.get(g.id) ?? g.status, projectIds: [...g.projectIds, ...overlay.projects.filter(p => p.programmeId === g.id && !g.projectIds.includes(projectId(p.id))).map(p => projectId(p.id))], deps: { ...g.deps, ...(overlay.deps.get(g.id) ?? {}) } }));
}
import { notifyPlanner, p2bStore, plannerDb } from './p2b';
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
let vCache: { key: string; db: Db; list: DeliveryProjectView[] } | null = null;

const crews = () => (activeGeo().id === 'in'
  ? { electrical: 'Sterling & Wilson', mechanical: 'Blue Star', civil: 'L&T Construction', fire: 'Minimax India', it: 'own technicians' }
  : { electrical: 'Rosendin Electric', mechanical: 'Southland Industries', civil: 'Turner Construction', fire: 'Johnson Controls (fire)', it: 'own technicians' });
const SUPPLIER: Record<string, [string, string]> = {
  UPS: ['Vertiv', 'Schneider Electric'], Generators: ['Cummins', 'Caterpillar'], Transformers: ['Siemens Energy', 'ABB'], CRAH: ['Vertiv', 'STULZ'], CDUs: ['CoolIT Systems', 'Vertiv'],
  Busway: ['Schneider Electric', 'Siemens'], Containment: ['Subzero Engineering', 'Rittal'], 'Fire suppression': ['Siemens Fire Safety', 'Johnson Controls'],
  Chillers: ['Trane', 'Carrier'], Racks: ['Rittal', 'APC by Schneider'], 'GPU nodes': ['NVIDIA partner (Dell)', 'NVIDIA partner (Supermicro)'], Servers: ['Dell Technologies', 'HPE'], Equipment: ['OEM', 'OEM'], Manifolds: ['Motivair', 'CoolIT Systems'],
  /* 29-Oct-2026: network kit, rack power and cabling, batteries and load banks had no supplier ("OEM") or no order at all */
  Switches: ['Arista Networks', 'Cisco Systems'], Optics: ['Juniper Networks', 'Coherent'], Firewalls: ['Fortinet', 'Palo Alto Networks'], Routers: ['Juniper Networks', 'Cisco Systems'],
  PDUs: ['Vertiv (Geist)', 'Raritan'], Cabling: ['Corning', 'CommScope'], 'Load banks': ['Aggreko', 'Sunbelt Rentals']
};
/* services bought for the work itself (studies, civil works, vendor support, IT asset disposal): every cost line has an order */
const SERVICES = (): Record<string, [string, string]> => (activeGeo().id === 'in'
  ? { 'Design and studies': ['Tata Consulting Engineers', 'Jacobs'], 'Civil works': ['L&T Construction', 'Shapoorji Pallonji'], 'IT asset disposal': ['Attero Recycling', 'E-Parisaraa'] }
  : { 'Design and studies': ['Jacobs', 'Burns & McDonnell'], 'Civil works': ['Turner Construction', 'DPR Construction'], 'IT asset disposal': ['Sims Lifecycle Services', 'Iron Mountain ITAD'] });
/* vendor support for a firmware campaign comes from the maker of what is upgraded */
const supportVendor = (name: string) => (/Junos|MX\d|ACX/.test(name) ? 'Juniper Networks' : /CDU/.test(name) ? 'CoolIT Systems' : /IOS|ASR|Nexus/.test(name) ? 'Cisco Systems' : /EOS|Arista/.test(name) ? 'Arista Networks' : 'Equipment maker');
const batteryMakers = (): [string, string] => (activeGeo().id === 'in' ? ['Amara Raja', 'Exide Industries'] : ['EnerSys', 'East Penn']);
/* a service is bought from the firm that does the work (the same name as the work order's crew) */
const supplierOf = (cat: string, seed: number) => (SERVICES()[cat] ? SERVICES()[cat][0] : (cat === 'Batteries' ? batteryMakers() : SUPPLIER[cat])[seed % 2]);
const LEAD: Record<string, number> = { 'Design and studies': 2, 'Civil works': 4, 'Vendor support': 1, 'IT asset disposal': 2, Switches: 8, Optics: 4, Firewalls: 10, Routers: 12, PDUs: 6, Cabling: 4, Batteries: 10, 'Load banks': 3, Busway: 14, Containment: 8, 'Fire suppression': 10, UPS: 20, Generators: 36, Transformers: 40, CRAH: 16, CDUs: 20, Chillers: 24, Racks: 8, 'GPU nodes': 14, Servers: 8, Equipment: 10, Manifolds: 12 };
const catOf = (line: string) => (/Studies and design/i.test(line) ? 'Design and studies' : /Civil and structure/i.test(line) ? 'Civil works' : /Vendor support/i.test(line) ? 'Vendor support' : /Disposal/i.test(line) ? 'IT asset disposal'
  : /batter/i.test(line) ? 'Batteries' : /PDU/.test(line) ? 'PDUs' : /trunk|panels|cabling/i.test(line) ? 'Cabling' : /Load bank/i.test(line) ? 'Load banks'
  : /switch/i.test(line) ? 'Switches' : /optic|SFP|QSFP/i.test(line) ? 'Optics' : /firewall/i.test(line) ? 'Firewalls' : /router/i.test(line) ? 'Routers' : /Busway/.test(line) ? 'Busway' : /Containment/.test(line) ? 'Containment' : /Fire suppression/.test(line) ? 'Fire suppression' : /UPS/.test(line) ? 'UPS' : /Generator/.test(line) ? 'Generators' : /Transformer/.test(line) ? 'Transformers' : /CRAH/.test(line) ? 'CRAH' : /CDU/.test(line) ? 'CDUs' : /Chiller/.test(line) ? 'Chillers'
  : /Racks/.test(line) ? 'Racks' : /GPU/.test(line) ? 'GPU nodes' : /servers/.test(line) ? 'Servers' : /manifold/i.test(line) ? 'Manifolds' : /New equipment/.test(line) ? 'Equipment' : '');

export const projectId = (planId: string) => planId.replace('PLN-', 'PRJ-');
const inDelivery = (p: PlannerPlan) => p.status === 'Approved' || p.status === 'Executing' || p.status === 'Delivered';
const log = (pid: string, who: string, text: string, at: number) => overlay.log.set(pid, [...(overlay.log.get(pid) ?? []), { at, who, text }]);

/* ---- project families (29-Oct-2026): crews, commissioning levels and documents follow the work, not one generic build */
type Fam = 'network' | 'firmware' | 'decom' | 'racks' | 'plant' | 'cooling' | 'hall' | 'civil' | 'design' | 'onboard' | 'ist';
function familyOf(p: PlannerPlan, tpl?: string): Fam {
  const t = tpl ?? '';
  if (/Firmware/.test(t)) return 'firmware';
  if (/CDU|liquid/i.test(p.name) || /CDU pump/.test(t)) return 'cooling';
  if (/Decommission/.test(t)) return 'decom';
  if (/Site onboarding/.test(t)) return 'onboard';
  if (/Integrated systems test/.test(t)) return 'ist';
  if (/Master planning/.test(t)) return 'design';
  if (/Permits and site construction/.test(t)) return 'civil';
  if (/Network|Optics|Switch|Firewall|backbone/i.test(t)) return 'network';
  if (/^Rack/.test(t)) return 'racks';
  if (/battery|MEP/i.test(t)) return 'plant';
  if (/fit-out|White-space|First hall/i.test(t)) return 'hall';
  if (p.scope === 'plant-upgrade') return 'plant';
  if (p.scope === 'new-hall' || p.scope === 'new-site') return 'hall';
  if (p.scope === 'rack-expansion' || p.scope === 'ai-pod') return 'racks';
  return 'network';
}
function woKind(name: string, fam: Fam): WorkOrder['kind'] {
  if (/decommission/i.test(name)) return 'Decommission';
  if (/commission|tests?\b|checks/i.test(name)) return 'Commissioning';
  if (/^migrate /i.test(name)) return 'Migration';
  if (/shell|construction|survey/i.test(name)) return 'Civil';
  if (/^(structured cabling|cable )/i.test(name)) return 'Cabling';
  if (/fire suppression|BMS|CRAH|manifold/i.test(name) || fam === 'cooling') return 'Mechanical';
  if (fam === 'plant' || /busway|containment|plant|load bank|cut-in/i.test(name)) return 'Electrical';
  return 'Install';
}
/* commissioning levels L1–L5 per family: [name, what is tested] */
function cxLevels(fam: Fam, mainItem: string | undefined, name: string): [string, string][] {
  const fat = mainItem ?? 'Main equipment';
  switch (fam) {
    case 'network': return [['Staging and burn-in', `${fat}: staged, configured and burned in before shipping to site`], ['Site acceptance (delivery check)', 'Every delivered item against the order'],
      ['Link and optics test', 'Every new link up, optics inside their DOM thresholds, no CRC errors'], ['Protocol and failover test', 'BGP / BFD sessions, LACP bundles and redundant-path failover'], ['Traffic cut-over and 24 h soak', 'Production traffic moved, 24 h with no new alarms']];
    case 'firmware': if (/CDU/.test(name)) return [['Lab validation', 'The release on a spare CDU controller with the site set points'], ['Pre-checks per wave', 'Set points, alarms and flow snapshot; the previous image staged'],
      ['Controller verification', 'Version, set points and alarms checked after each restart'], ['Flow-control test', 'Flow held at the set point as GPU load steps up and down'], ['24 h soak and close', 'No flow or temperature alarms 24 h after the last wave']];
      return [['Lab validation', 'The release on lab devices against the golden configuration'], ['Pre-checks per wave', 'Configuration backup, health snapshot and rollback image staged'],
      ['Upgrade verification', 'Version, modules and alarms checked after each reload'], ['Protocol checks', 'Routing, BFD and bundle state matches the pre-check'], ['24 h soak and close', 'No new alarms or errors 24 h after the last wave']];
    case 'decom': return [['Workloads moved', 'Services verified on their new hosts before anything is switched off'], ['Data sanitised', 'Drives wiped or shredded to NIST SP 800-88, certificates issued'],
      ['Power and network removed', 'Cords and patch leads removed; DCIM and IPAM records updated'], ['Equipment removed', 'Recycled under an e-waste certificate'], ['Space and power released', 'Rack units and power budget returned to capacity']];
    case 'racks': return [['Supplier inspection', fat], ['Site acceptance (delivery check)', 'Every delivered item against the order'], ['PDU energisation', 'Each rack PDU energised from its A and its B feed'],
      ['A / B power-path test', 'Each side switched off in turn with the racks loaded'], ['Handover walk-down', 'Labels, cable management and DCIM records checked rack by rack']];
    case 'cooling': return [['Factory witness test', fat], ['Site acceptance (delivery check)', 'Every delivered item against the order'], ['Pump start-up', 'Each pump and controller started on its own; flow and pressure in range'],
      ['Flow control test', 'Flow held at the set point as GPU load steps up and down'], ['Loop failover under load', 'One pump stopped at a time under GPU load; flow and inlet temperature held']];
    case 'design': return [['Concept design review', 'Site, utility capacity, fibre routes and massing'], ['Schematic design review', 'Electrical and mechanical concepts, tier and redundancy'],
      ['Design development review', 'Coordinated design across disciplines'], ['Basis-of-design sign-off', 'Signed by engineering, operations and the sponsor'], ['Investment approval', 'Budget and programme approved by the investment committee']];
    case 'civil': return [['Foundation inspection', 'Piles, raft and ground beams against the structural design'], ['Structural frame inspection', 'Frame, slabs and plinth loads for the plant'],
      ['Envelope water test', 'Roof and facade tested for water-tightness'], ['Fire-rated construction inspection', 'Compartment walls, doors and penetrations sealed'], ['Shell handover to MEP', 'Building handed to the MEP contractor with snags listed']];
    case 'ist': return [['Load bank calibration', 'Load banks sized to the design IT load, calibrated and placed'], ['Pre-functional checks', 'Every UPS, generator, ATS, cooling unit and BMS point started on its own'],
      ['Functional performance tests', 'Each system through its operating modes at part and full load'], ['Utility-loss rehearsal', 'Generator start and transfer timed on one feed'], ['Integrated systems test (IST)', 'Utility loss, generator start, UPS transfer and cooling failover with load banks at design load']];
    case 'onboard': return [['Collectors installed', 'Active and standby collector up, outbound link to the platform only'], ['Discovery', 'Every device answers SNMP / Redfish; records reconciled with DCIM'],
      ['Telemetry checks', 'Power, cooling and device readings fresh within two polling intervals'], ['Alarm tests', 'Test alarms raised, scoped to the site and paged to the NOC'], ['Operations handover', 'Site on the NOC rota, runbooks and escalation in place']];
    case 'plant': return [['Factory witness test', fat], ['Site acceptance (delivery and installation check)', 'Every delivered item against the order'], ['Pre-functional (start-up)', 'Each unit energised on its own'],
      ['Functional performance', 'Each unit through its operating modes'], [/batter/i.test(name) ? 'Discharge test' : 'Integrated systems test (IST)', /batter/i.test(name) ? 'Strings discharged at full load on load banks; UPS transfer and ride-through measured' : 'Utility loss, generator start, UPS transfer and cooling failover with load banks']];
    default: return [['Factory witness test', fat], ['Site acceptance (delivery and installation check)', 'Every delivered item against the order'], ['Pre-functional (start-up)', 'Each system energised on its own'],
      ['Functional performance', 'Each system through its operating modes'], ['Integrated systems test (IST)', 'Utility loss, generator start, UPS transfer and cooling failover with load banks']];
  }
}
/* a vendor order's lines, the same model summed once (the planner lists a line per path end) */
function mergeLines(lines: { qty: number; model?: string; item: string }[]) {
  const m = new Map<string, number>();
  for (const l of lines) { const k = l.model ?? l.item; m.set(k, (m.get(k) ?? 0) + l.qty); }
  return [...m].map(([name, qty]) => ({ name, qty }));
}

export function deliveryProjects(db: Db): DeliveryProjectView[] {
  const src = sources(db);
  const key = `${db.now}|${src.map(x => `${x.plan.id}:${x.plan.status}:${x.plan.updated}`).join(',')}|${JSON.stringify([...overlay.wo, ...overlay.tests, ...overlay.handed, ...overlay.po, ...overlay.coState, ...overlay.riskState, ...overlay.assign].map(x => JSON.stringify(x)))}|${overlay.projects.length}|${[...overlay.cos.values(), ...overlay.risks.values()].flat().length}|${overlay.programmes.length}|${overlay.deps.size}`;
  /* the same plan ids repeat across personas and geographies: a rebuilt estate (new db) never reuses the views */
  if (vCache && vCache.key === key && vCache.db === db) return vCache.list;
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
  vCache = { key, db, list: views };
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
  /* a template project keeps the manager it was created with (its history and programme name them); planner projects take a delivery manager */
  const manager = src.template ? p.owner : ppl[(seedOf(p.id) % 6) + 2] ?? p.owner;
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
    pos.push({ id: poId, projectId: pid, supplier: v.vendorName, item: mergeLines(v.lines).map(l => `${l.qty} × ${l.name}`).join(', ') + (v.phaseName ? ` · ${v.phaseName}` : ''), qty, unitCost: Math.round(v.value / qty), total: v.value,
      ordered, due: late ? due + 3 * WEEK : due, leadWeeks: lead, state: poState(poId, due, late), contract: v.contractLabel, lines: mergeLines(v.lines).map(l => ({ item: l.name, qty: l.qty })) });
  }
  else for (const c of e.capex) {
    const cat = catOf(c.line); if (!cat) continue;
    const qty = Number(/^(\d+)\s*×/.exec(c.basis)?.[1] ?? 1);
    /* a template project's order lands when its procurement phase ends; one without a procurement phase is bought ahead of the start */
    const longs = src.template ? e.tasks.filter(t => t.longLead) : [];
    const proc = longs.find(t => t.name.toLowerCase().includes(cat.toLowerCase().replace(/s$/, ''))) ?? longs[0];
    const lead = proc ? proc.weeks : LEAD[cat];
    const ordered = proc ? proc.start : src.template ? start - lead * WEEK : Math.max(approvedAt, start);
    const due = ordered + lead * WEEK;
    const late = !delivered && p.status === 'Executing' && due < now && r() < 0.18;
    const poId = `PO-${pid.slice(4)}-${String(++k).padStart(2, '0')}`;
    /* a service (studies, civil works, vendor support, disposal) runs with the work and is closed when the project is: never "delivered" mid-way */
    const service = cat in SERVICES() || cat === 'Vendor support';
    pos.push({ id: poId, projectId: pid, supplier: cat === 'Vendor support' ? supportVendor(p.name) : supplierOf(cat, seedOf(`${p.id}${cat}`)), item: c.line, qty, unitCost: Math.round(c.amount / Math.max(1, qty)), total: c.amount,
      ordered, due: service ? finish : late ? due + 3 * WEEK : due, leadWeeks: lead, state: service ? (overlay.po.has(poId) || delivered ? 'Delivered' : 'Ordered') : poState(poId, due, late) });
  }
  /* work orders: the field-work milestones, split in crew windows */
  const cr = crews();
  /* what kind of work this is decides the crews, the commissioning levels and the documents (29-Oct-2026: a firmware campaign ran an
     IST with "utility loss, generator start", network change windows went to the electrical contractor) */
  const fam = familyOf(p, src.template);
  const field = fam === 'design' ? e.tasks.slice(0, 1).map(t => ({ ...t, name: `${t.name} · site surveys (geotechnical, topographic, utility capacity)` })) : e.tasks.filter(t => !/^Procurement/i.test(t.name) && /install|cabl|fit-out|commission|migrate |construction|plant additions|change window|discover|load bank|checks|tests/i.test(t.name));
  const wos: WorkOrder[] = [];
  let w = 0;
  for (const t of field) {
    const kind = woKind(t.name, fam);
    const parts = kind === 'Install' || kind === 'Cabling' ? Math.min(3, Math.max(1, Math.ceil((p.racks || 1) / 4))) : kind === 'Electrical' && /fit-out/i.test(t.name) ? 2 : 1;
    for (let i = 0; i < parts; i++) {
      const s0 = t.start + ((t.end - t.start) / parts) * i, e0 = t.start + ((t.end - t.start) / parts) * (i + 1);
      const id = `WO-${pid.slice(4)}-${String(++w).padStart(2, '0')}`;
      const own = kind === 'Install' || kind === 'Cabling' || kind === 'Migration' || kind === 'Commissioning' || kind === 'Decommission';
      const crew = own ? 'Own technicians' : /survey/i.test(t.name) ? SERVICES()['Design and studies'][0] : kind === 'Civil' ? cr.civil : kind === 'Electrical' ? cr.electrical : /fire/i.test(t.name) ? cr.fire : cr.mechanical;
      /* the kit a crew needs: everything ordered for the project that lands before the work starts, plus the main hardware */
      const needs = kind === 'Commissioning' || kind === 'Migration' || kind === 'Decommission' ? [] : pos.filter(o => o.due <= s0 + WEEK || /Rack|UPS|CDU|CRAH|GPU|Server|Equipment|Manifold|switch|optic|SFP|firewall|router|batter|PDU|Busway|Containment|Fire|Generator|Chiller|Transformer|line card|QSFP|FlashArray|PowerEdge/i.test(o.item));
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
        rackIds: racks, kit: kitReady || state === 'Done' || state === 'In progress' ? 'Ready' : needs.some(o => o.state === 'Delivered' || o.state === 'In transit') ? 'Partial' : needs.some(o => o.state === 'Ordered' || o.state === 'Late') ? 'On order' : 'Not ordered' });
    }
  }
  /* commissioning L1–L5 on the schedule */
  const mainPo = [...pos].sort((a, b) => b.total - a.total)[0];
  const cxTask = e.tasks.find(t => /(?<!de)commission/i.test(t.name));
  const installEnd = Math.max(...e.tasks.filter(t => !/(?<!de)commission/i.test(t.name)).map(t => t.end));
  const cxStart = cxTask?.start ?? installEnd, cxEnd = cxTask?.end ?? finish;
  const witness = [ppl[4] ?? 'QA lead', ppl[6] ?? 'Commissioning agent'];
  const mk = (level: CxTest['level'], name: string, scope: string, due: number): CxTest => {
    const key = `${pid}:L${level}`;
    /* snags come from the walk-downs once the installation is finished, never before */
    const raw = level >= 3 ? Math.floor(between(r, 0, level === 5 ? 3 : 6)) : 0;
    const snags = installEnd <= now ? raw : 0;
    const derived: CxTest['state'] = delivered || due <= now ? 'Passed' : due - 30 * DAY <= now ? 'Scheduled' : 'Not started';
    return { level, name, scope, due, state: overlay.tests.get(key) ?? derived, witness: witness[level % 2], snags: (overlay.tests.get(key) ?? derived) === 'Passed' ? 0 : snags };
  };
  const lv = cxLevels(fam, mainPo ? `${mainPo.item} at ${mainPo.supplier}` : undefined, p.name);
  const due1 = fam === 'design' || fam === 'civil' || fam === 'decom' || fam === 'firmware' || fam === 'onboard' || fam === 'ist' ? [start + (installEnd - start) * 0.25, start + (installEnd - start) * 0.6] : [(mainPo?.due ?? cxStart) - 2 * WEEK, mainPo?.due ?? cxStart];
  const tests: CxTest[] = [
    mk(1, lv[0][0], lv[0][1], due1[0]),
    mk(2, lv[1][0], lv[1][1], due1[1]),
    mk(3, lv[2][0], lv[2][1], cxStart),
    mk(4, lv[3][0], lv[3][1], cxStart + (cxEnd - cxStart) / 2),
    mk(5, lv[4][0], lv[4][1], cxEnd)
  ];
  /* permits by scope */
  const auth = activeGeo().id === 'in'
    ? { building: 'Municipal corporation', env: 'State pollution control board', fire: 'State fire services (Fire NOC)', elec: 'Chief Electrical Inspector (CEIG)', utility: 'State distribution company', occ: 'Municipal corporation' }
    : { building: 'County building department', env: 'State environmental agency', fire: 'Fire marshal (AHJ)', elec: 'Electrical inspector (AHJ)', utility: 'Electric utility', occ: 'County building department' };
  /* a greenfield phase carries the permits it needs, not the whole site's (the feasibility phase showed an occupancy certificate granted) */
  const gfKey = /^Greenfield · (.+)$/.exec(src.template ?? '')?.[1] ?? '';
  const gfPermits: Record<string, [string, string, number][]> = {
    'Master planning and feasibility': [['Land use and zoning approval', auth.building, finish - 2 * WEEK]],
    'Permits and site construction': [['Building permit', auth.building, start + 8 * WEEK], ['Environmental clearance (generators, fuel)', auth.env, start + 10 * WEEK], ['Utility power connection', auth.utility, finish]],
    'MEP and plant installation': [['Electrical installation approval', auth.elec, finish - 4 * WEEK], ['Generator emission consent', auth.env, finish - 6 * WEEK]],
    'Network backbone': [['Right of way for the fibre entry', auth.building, start + 6 * WEEK]],
    'White-space fit-out': [['Fire safety approval for the halls', auth.fire, finish - 2 * WEEK]],
    'First hall fit-out and RFS': [['Occupancy certificate', auth.occ, finish - WEEK]],
  };
  const permitDefs: [string, string, number][] = gfKey ? gfPermits[gfKey] ?? [] : fam === 'cooling' || fam === 'onboard' ? [] : p.scope === 'new-site' ? [['Building permit', auth.building, start + 8 * WEEK], ['Environmental clearance (generators, fuel)', auth.env, start + 12 * WEEK], ['Utility power connection', auth.utility, start + 20 * WEEK], ['Fire safety approval', auth.fire, finish - 8 * WEEK], ['Electrical installation approval', auth.elec, finish - 6 * WEEK], ['Occupancy certificate', auth.occ, finish - 2 * WEEK]]
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
  const docKinds: DesignDoc['kind'][] = fam === 'firmware' || fam === 'onboard' ? ['Design basis', 'Method statement'] : fam === 'decom' ? ['Method statement', 'Cable schedule']
    : fam === 'cooling' ? ['Design basis', 'Cooling P&ID', 'Method statement'] : fam === 'design' ? ['Design basis', 'Floor layout', 'Single-line diagram'] : fam === 'civil' ? ['Design basis', 'Floor layout', 'Method statement']
    : fam === 'network' ? ['Design basis', 'Method statement', 'Cable schedule'] : p.scope === 'refresh' ? ['Design basis', 'Method statement', 'Cable schedule'] : p.scope === 'plant-upgrade' ? ['Design basis', 'Single-line diagram', 'Method statement']
    : ['Design basis', 'Single-line diagram', ...(p.cooling !== 'Air' || p.scope === 'new-site' || p.scope === 'new-hall' ? ['Cooling P&ID' as const] : []), 'Floor layout', 'Cable schedule', 'Method statement'];
  const docs: DesignDoc[] = [...docKinds, ...(delivered ? ['As-built' as const] : [])].map((kind, i) => {
    const issued = start + (i + 2) * WEEK;
    return { id: `DOC-${pid.slice(4)}-${i + 1}`, projectId: pid, title: `${kind} — ${p.name}`, kind, rev: delivered ? 'C' : issued <= now ? 'B' : 'A', state: kind === 'As-built' ? 'As-built' : issued <= now ? 'Issued for construction' : i < 2 ? 'In review' : 'Draft', updated: Math.min(now, issued), author: ppl[(i + 3) % ppl.length] ?? manager };
  });
  /* progress and cost */
  /* an approved project the build has not started yet has no planned progress (it showed "SPI 0, behind schedule") */
  const planned = p.status === 'Approved' && !delivered ? 0 : clamp((now - start) / Math.max(1, finish - start));
  const done = wos.filter(x => x.state === 'Done').length, total = Math.max(1, wos.length);
  const perf = between(r, 0.86, 1.04);
  const progress = delivered ? 1 : p.status === 'Approved' ? 0 : r2(clamp(Math.max(planned * perf, (done / total) * 0.9)));
  const budget = e.capexTotal, earned = Math.round(budget * progress);
  const costF0 = between(r, 0.94, 1.12);
  /* a handed-over project closed its cost: within 4 % of the budget (an overrun beyond that is a change order) */
  const costF = delivered ? Math.min(costF0, 1.04) : costF0;
  const actual = Math.round(earned * costF);
  const cpi = actual ? r2(earned / actual) : 1, spi = planned > 0.02 ? r2(progress / planned) : 1;
  const passed = tests.every(t => t.state === 'Passed');
  const openWo = wos.filter(x => x.state !== 'Done').length;
  const state: DeliveryProject['state'] = delivered ? 'Delivered' : p.status === 'Approved' ? 'Mobilising' : passed && !openWo ? 'Handover' : now >= cxStart ? 'Commissioning' : 'In progress';
  const late = finish > p.target || spi < 0.9;
  /* change orders: approved ones move the budget and the finish */
  const cos = [...seedCos(pid, e.capexTotal, now, manager), ...(overlay.cos.get(pid) ?? [])].map(c => ({ ...c, ...(overlay.coState.get(c.id) ?? {}) }));
  const okCo = cos.filter(c => c.state === 'Approved');
  const shift = okCo.reduce((a, c) => a + c.scheduleDays, 0) * DAY;
  const project: DeliveryProject = {
    template: src.template, budgetApproved: e.capexTotal + okCo.reduce((a, c) => a + c.budgetDelta, 0), baselineFinish: finish,
    id: pid, planId: src.template ? '' : p.id, name: p.name, dcId: p.dcId, scope: p.scope, state, manager, start, finish, target: p.target, progress, plannedProgress: r2(planned), budget, earned, actual, cpi, spi,
    health: delivered ? (finish > p.target ? 'late' : 'on track') : late ? 'late' : cpi < 0.95 || spi < 0.97 ? 'at risk' : 'on track', workOrders: wos.length, openWorkOrders: openWo, poOpen: pos.filter(o => o.state !== 'Delivered').length,
    permitsOpen: permits.filter(x => x.state !== 'Granted' && x.state !== 'Not needed').length, cxLevel: Math.max(0, ...tests.filter(t => t.state === 'Passed').map(t => t.level)), snags: tests.filter(t => t.state === 'Scheduled' || t.state === 'Failed').reduce((a, t) => a + t.snags, 0)
  };
  if (shift) { project.finish += shift; if (project.finish > project.target) project.health = 'late'; }
  /* the project's own record of what happened, read from its orders, work orders, documents, tests, permits and change orders (30-Oct-2026:
     a template project's History showed one line) */
  const ev: { at: number; who: string; text: string }[] = [];
  const at = (t: number) => Math.min(t, now);
  for (const o of pos) {
    if (o.state === 'Draft') continue;
    ev.push({ at: at(o.ordered), who: manager, text: `${o.id} placed with ${o.supplier}: ${o.item}` });
    if (o.state === 'In transit') ev.push({ at: at(o.due - 2 * WEEK), who: o.supplier, text: `${o.id} shipped, due on site ${fmtD(o.due)}` });
    if (o.state === 'Late') ev.push({ at: at(o.due - 3 * WEEK), who: o.supplier, text: `${o.id} delayed by the supplier, now due ${fmtD(o.due)}` });
    if (o.state === 'Delivered' && !(o.item.match(/Studies|Civil|Vendor support|Disposal/))) ev.push({ at: at(o.due), who: manager, text: `${o.id} received on site (goods receipt)` });
  }
  for (const d of docs) if (d.state === 'Issued for construction') ev.push({ at: at(d.updated), who: d.author, text: `${d.kind} issued for construction (rev ${d.rev})` });
  for (const x of permits) {
    if (x.submitted) ev.push({ at: at(x.submitted), who: x.owner, text: `${x.name} filed with ${x.authority}` });
    if (x.state === 'Granted') ev.push({ at: at(x.due - WEEK), who: x.authority, text: `${x.name} granted` });
  }
  for (const w of wos) {
    if (w.state === 'In progress' || w.state === 'Done') ev.push({ at: at(w.start), who: w.crew, text: `${w.id} started: ${w.title} (${w.changeId} approved)` });
    if (w.state === 'Done') ev.push({ at: at(w.end), who: w.crew, text: `${w.id} completed: ${w.title}` });
  }
  for (const t of tests) if (t.state === 'Passed') ev.push({ at: at(t.due), who: t.witness, text: `L${t.level} ${t.name} passed` });
  for (const c of cos) {
    ev.push({ at: at(c.raisedAt), who: c.raisedBy, text: `${c.id} raised: ${c.title}` });
    if (c.decidedAt) ev.push({ at: at(c.decidedAt), who: c.decidedBy ?? c.approver, text: `${c.id} ${c.state.toLowerCase()} by the ${c.approver.toLowerCase()}` });
  }
  const history = [...p.history.map(h => ({ ...h })), ...ev.filter(x => x.at <= now && x.at >= (p.created || 0)), ...(overlay.log.get(pid) ?? [])].sort((a, b) => a.at - b.at);
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
  /* today is a point of its own; a grid tick within 4 days of it would print the same date twice on the axis */
  if (now > t0 && now < t1) { for (let i = ticks.length - 1; i >= 0; i--) if (Math.abs(ticks[i] - now) < 4 * DAY && ticks[i] !== t0) ticks.splice(i, 1); ticks.push(now); }
  /* a handed-over project earned and spent its money up to its finish, not up to today */
  const tEnd = delivered ? Math.min(project.finish, now) : now;
  for (const t of ticks.sort((a, b) => a - b)) { const f = clamp((tEnd - t0) > 0 ? (Math.min(t, tEnd) - t0) / (tEnd - t0) : 0); costCurve.push({ t, pv: Math.round(project.budgetApproved * clamp((t - t0) / Math.max(1, project.finish - t0))), ev: t <= now ? Math.round(earned * f) : null, ac: t <= now ? Math.round(actual * f) : null }); }
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
function seedCos(pid: string, budget: number, now: number, manager = 'Project manager'): ChangeOrder[] {
  const ppl = activeGeo().people;
  if (pid === 'PRJ-0003') return [{ id: 'CO-0003-01', projectId: pid, title: 'Crane lift re-plan for the chiller', reason: 'The roof lift needs a larger crane and a weekend road closure', budgetDelta: Math.round(budget * 0.018), scheduleDays: 14, state: 'Submitted', approver: approverFor(budget * 0.018, budget), raisedBy: ppl[5] ?? 'Site lead', raisedAt: now - 2 * DAY }];
  const co = (n: string, title: string, reason: string, pct: number, days: number, state: ChangeOrder['state'], raisedDaysAgo: number, by: string): ChangeOrder => {
    const delta = Math.round(budget * pct);
    /* the one who raises a change order never approves it */
    const raiser = by === manager ? ppl[8] ?? 'Site engineer' : by;
    return { id: `CO-${pid.slice(4)}-${n}`, projectId: pid, title, reason, budgetDelta: delta, scheduleDays: days, state, approver: approverFor(delta, budget), raisedBy: raiser, raisedAt: now - raisedDaysAgo * DAY,
      ...(state !== 'Submitted' ? { decidedBy: approverFor(delta, budget) === 'Project manager' ? manager : approverFor(delta, budget) === 'Programme sponsor' ? ppl[1] ?? 'Sponsor' : 'Investment committee', decidedAt: now - (raisedDaysAgo - 2) * DAY } : {}) };
  };
  if (pid === 'PRJ-1003') return [co('01', 'Load banks for an extended discharge test', 'UPS-2 has run on battery: the new strings are tested at full load for the design autonomy, not the standard 10 minutes', 0.03, 0, 'Approved', 24, ppl[5] ?? 'Facilities lead')];
  if (pid === 'PRJ-1004') return [co('01', 'A fourth change window', 'Wave 2 overran: six routers did not reload inside the window and were rolled back', 0.07, 7, 'Submitted', 2, ppl[2] ?? 'Network lead')];
  if (pid === 'PRJ-1010') return [co('01', 'One cold spare per switch model', 'Keep a cold spare at the site once the old switches leave; the vendor depot is two days away', 0.12, 0, 'Submitted', 4, ppl[6] ?? 'Delivery lead')];
  if (pid === 'PRJ-1012') return [co('01', 'A second collector pair for the isolated BMS network', 'The BMS VLAN cannot be routed to the IT management network, so each side needs its own collector pair', 0.5, 5, 'Submitted', 3, ppl[4] ?? 'Delivery lead')];
  if (pid === 'PRJ-1005') return [co('01', 'Air freight for the replacement optics', 'Two more routers showed the lot 22B decay this week; the optics are flown in instead of shipped', 0.04, 0, 'Approved', 5, ppl[2] ?? 'Network lead')];
  if (pid === 'PRJ-2002') return [co('01', 'Additional piling under the generator yard', 'The geotechnical survey found soft strata under the generator yard: 40 more piles', 0.035, 7, 'Approved', 40, ppl[7] ?? 'Programme lead')];
  if (pid === 'PRJ-1007') return [{ id: 'CO-1007-01', projectId: pid, title: 'Deeper racks for the replacement servers', reason: 'The servers going into the new racks need 1,200 mm depth instead of 1,000 mm', budgetDelta: Math.round(budget * 0.06), scheduleDays: 5, state: 'Approved', approver: approverFor(budget * 0.06, budget), raisedBy: ppl[6] ?? 'Site lead', raisedAt: now - 20 * DAY, decidedBy: ppl[1] ?? 'Sponsor', decidedAt: now - 18 * DAY }];
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
  /* today is a point of its own; a grid tick within 4 days of it would print the same date twice on the axis */
  if (now > t0 && now < t1) { for (let i = ticks.length - 1; i >= 0; i--) if (Math.abs(ticks[i] - now) < 4 * DAY && ticks[i] !== t0) ticks.splice(i, 1); ticks.push(now); }
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
