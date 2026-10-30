/* Delivery project templates and the seeded delivery portfolio (14-Oct-2026, P2B gap fill: programmes, project templates).
   A template project is delivery work that does not need a planner plan (a rack install, a network upgrade, a firmware campaign, a
   decommission, a battery swap, a greenfield phase). It is turned into a synthetic plan + schedule + cost lines so mock/delivery.ts
   gives it work orders, purchase orders, commissioning, permits and documents exactly as it does for a planner project.
   Money constants are rupees wrapped with money(); dates are relative to the mock clock. */
import type { DeliveryTemplate, PlannerPlan, PlanScope, Programme } from '../api/types';
import type { Db } from './generate';
import { activeGeo, dcAt, money } from './geo';
import { edgeId } from './personas';
import { siteLifecycle } from './lifecycle';

const WEEK = 7 * 864e5;
interface Phase { name: string; weeks: number; longLead?: boolean; parallel?: boolean }
interface Line { line: string; qty: (n: number) => number; unitRs: number }
interface Tpl extends Omit<DeliveryTemplate, 'weeks' | 'phases' | 'budgetFrom'> { phases: Phase[]; lines: Line[] }

export const TEMPLATES: Tpl[] = [
  { key: 'rack-install', name: 'Rack install', description: 'Survey, order racks and PDUs, install, cable to the fabric and commission a set of racks.', scope: 'rack-expansion', icon: 'Server', unit: 'racks', defaultQty: 8,
    phases: [{ name: 'Site survey and design', weeks: 2 }, { name: 'Procurement · racks and PDUs', weeks: 6, longLead: true, parallel: true }, { name: 'Rack install and power', weeks: 2 }, { name: 'Structured cabling', weeks: 2 }, { name: 'Commission and handover', weeks: 1 }],
    lines: [{ line: 'Racks · 42U 800 mm', qty: n => n, unitRs: 120000 }, { line: 'Rack PDUs · 3-phase 32 A', qty: n => n * 2, unitRs: 65000 }, { line: 'Cable trunks and panels', qty: n => Math.ceil(n / 4), unitRs: 450000 }] },
  { key: 'network-install', name: 'Network fabric install', description: 'Design the IP plan, order switches and optics, install and cable a leaf–spine fabric, then commission it.', scope: 'refresh', icon: 'Network', unit: 'leaf switches', defaultQty: 8,
    phases: [{ name: 'Design and IP plan', weeks: 2 }, { name: 'Procurement · switches and optics', weeks: 8, longLead: true, parallel: true }, { name: 'Install switches', weeks: 2 }, { name: 'Cable the fabric', weeks: 2 }, { name: 'Commission the fabric', weeks: 1 }],
    lines: [{ line: 'Leaf switches · 400G', qty: n => n, unitRs: 4500000 }, { line: 'Optics · 400G', qty: n => n * 32, unitRs: 120000 }] },
  { key: 'firmware-campaign', name: 'Firmware / OS campaign', description: 'Validate in the lab, then upgrade devices in change windows wave by wave.', scope: 'refresh', icon: 'RefreshCcw', unit: 'devices', defaultQty: 24,
    phases: [{ name: 'Lab validation', weeks: 2 }, { name: 'Change window · wave 1', weeks: 1 }, { name: 'Change window · wave 2', weeks: 1 }, { name: 'Change window · wave 3', weeks: 1 }, { name: 'Commission and close', weeks: 1 }],
    lines: [{ line: 'Vendor support hours', qty: n => Math.ceil(n / 4), unitRs: 85000 }] },
  { key: 'optics-refresh', name: 'Optics refresh', description: 'Replace a failing optics lot: analyse, order replacements, swap them in change windows and re-test the links.', scope: 'refresh', icon: 'Cable', unit: 'optics', defaultQty: 48,
    phases: [{ name: 'Failure analysis', weeks: 1 }, { name: 'Procurement · replacement optics', weeks: 4, longLead: true, parallel: true }, { name: 'Change window · swap optics', weeks: 2 }, { name: 'Commission the links', weeks: 1 }],
    lines: [{ line: 'Optics · 100G LR4', qty: n => n, unitRs: 35000 }] },
  { key: 'battery-replacement', name: 'UPS battery replacement', description: 'Survey, order battery strings, swap them string by string in change windows and run a discharge test.', scope: 'plant-upgrade', icon: 'BatteryCharging', unit: 'strings', defaultQty: 4,
    phases: [{ name: 'Battery survey', weeks: 1 }, { name: 'Procurement · UPS battery strings', weeks: 10, longLead: true, parallel: true }, { name: 'Change window · string swap', weeks: 2 }, { name: 'Commission and discharge test', weeks: 1 }],
    lines: [{ line: 'UPS battery strings · VRLA 40-block', qty: n => n, unitRs: 1800000 }] },
  { key: 'rack-replacement', name: 'Rack replacement', description: 'Order new racks, move devices to temporary racks, install the new racks and move the devices back.', scope: 'rack-expansion', icon: 'Replace', unit: 'racks', defaultQty: 6,
    phases: [{ name: 'Procurement · racks', weeks: 6, longLead: true }, { name: 'Migrate devices to temporary racks', weeks: 2 }, { name: 'Install new racks', weeks: 2 }, { name: 'Cable and power', weeks: 1 }, { name: 'Commission', weeks: 1 }],
    lines: [{ line: 'Racks · 48U 800 mm deep', qty: n => n, unitRs: 140000 }] },
  { key: 'decommission', name: 'Decommission', description: 'Migrate workloads off, sanitise data, remove and recycle the equipment and close out the space.', scope: 'refresh', icon: 'Trash2', unit: 'devices', defaultQty: 20,
    phases: [{ name: 'Migrate workloads', weeks: 4 }, { name: 'Decommission and data sanitisation', weeks: 2 }, { name: 'Remove and recycle', weeks: 1 }, { name: 'Close out', weeks: 1 }],
    lines: [{ line: 'Disposal and sanitisation', qty: n => n, unitRs: 15000 }] },
  /* 29-Oct-2026: the templates the seeded portfolio needs to be built from the estate (a hall fit-out before its fabric, switches and
     firewalls past vendor end of sale) */
  { key: 'hall-fitout', name: 'Hall fit-out', description: 'Design the hall, order cooling and busway, build containment, busway, fire suppression and BMS points, then commission the hall.', scope: 'new-hall', icon: 'Warehouse', unit: 'racks', defaultQty: 16,
    phases: [{ name: 'Hall design and permits', weeks: 3 }, { name: 'Procurement · CRAH units and busway', weeks: 16, longLead: true, parallel: true }, { name: 'Containment and busway install', weeks: 6 }, { name: 'Fire suppression and BMS install', weeks: 3 }, { name: 'Commission the hall', weeks: 3 }],
    lines: [{ line: 'CRAH units · 150 kW', qty: n => Math.ceil(n / 8) + 1, unitRs: 6500000 }, { line: 'Busway · A and B feeds per row', qty: n => Math.ceil(n / 10), unitRs: 1800000 }, { line: 'Containment · cold aisle per row pair', qty: n => Math.ceil(n / 10), unitRs: 900000 }, { line: 'Fire suppression · hall system', qty: () => 1, unitRs: 4500000 }] },
  { key: 'switch-refresh', name: 'Switch refresh', description: 'Replace switches past vendor end of sale: order the new models, pre-stage their configurations, swap them in change windows and re-test every link.', scope: 'refresh', icon: 'ArrowLeftRight', unit: 'switches', defaultQty: 8,
    phases: [{ name: 'Design and configurations', weeks: 2 }, { name: 'Procurement · switches', weeks: 8, longLead: true, parallel: true }, { name: 'Stage and pre-configure', weeks: 1 }, { name: 'Change window · swap switches', weeks: 2 }, { name: 'Commission and close', weeks: 1 }],
    lines: [{ line: 'Leaf / ToR switches · current generation', qty: n => n, unitRs: 1200000 }] },
  { key: 'firewall-refresh', name: 'Firewall refresh', description: 'Replace a firewall pair past vendor support: migrate the rule base, order the new pair, swap one side at a time in change windows and run failover tests.', scope: 'refresh', icon: 'ShieldCheck', unit: 'firewalls', defaultQty: 2,
    phases: [{ name: 'Rule-base migration design', weeks: 3 }, { name: 'Procurement · firewalls', weeks: 10, longLead: true, parallel: true }, { name: 'Change window · swap the firewall pair', weeks: 2 }, { name: 'Commission and failover test', weeks: 1 }],
    lines: [{ line: 'Firewalls · next generation', qty: n => n, unitRs: 6500000 }] },
  /* bringing a site that is being built into service, and the liquid-cooling fix (29-Oct-2026) */
  { key: 'site-onboarding', name: 'Site onboarding', description: 'Install the on-site collectors, discover every device and reconcile the records, test telemetry and alarms, then hand the site to operations.', scope: 'refresh', icon: 'RadioTower', unit: 'devices', defaultQty: 40,
    phases: [{ name: 'Install the collectors', weeks: 1 }, { name: 'Discovery and records reconciliation', weeks: 3 }, { name: 'Telemetry and alarm tests', weeks: 2 }, { name: 'Commission and hand over to operations', weeks: 1 }],
    lines: [{ line: 'Collector servers · active and standby', qty: () => 2, unitRs: 450000 }] },
  { key: 'site-ist', name: 'Integrated systems test', description: 'Hire load banks, run the pre-functional and functional tests, then the integrated systems test (utility loss, generator start, UPS transfer, cooling failover).', scope: 'plant-upgrade', icon: 'Gauge', unit: 'tests', defaultQty: 1,
    phases: [{ name: 'Load bank hire and set-up', weeks: 1 }, { name: 'Pre-functional checks', weeks: 2 }, { name: 'Functional performance tests', weeks: 2 }, { name: 'Commission · integrated systems test', weeks: 1 }],
    lines: [{ line: 'Load banks and IST', qty: () => 1, unitRs: 4500000 }] },
  { key: 'cdu-upgrade', name: 'CDU pump upgrade', description: 'Survey flow and coolant, order pump modules, swap them one loop at a time in change windows, then prove flow and pump failover under GPU load.', scope: 'plant-upgrade', icon: 'Droplets', unit: 'CDUs', defaultQty: 4,
    phases: [{ name: 'Flow survey and coolant analysis', weeks: 2 }, { name: 'Procurement · CDU pump modules', weeks: 12, longLead: true, parallel: true }, { name: 'Change window · pump swap, one loop at a time', weeks: 2 }, { name: 'Commission · flow and pump failover test', weeks: 1 }],
    lines: [{ line: 'CDUs · pump modules and controls', qty: n => n, unitRs: 1800000 }] },
];
/* greenfield blueprint: one project per phase, each gated on the ones before it; MEP long-lead plant is ordered at programme kick-off */
export const GREENFIELD: { key: string; name: string; dependsOn: string[]; phases: Phase[]; lines: Line[] }[] = [
  { key: 'feasibility', name: 'Master planning and feasibility', dependsOn: [], phases: [{ name: 'Site selection and feasibility', weeks: 8 }, { name: 'Master plan and basis of design', weeks: 6 }], lines: [{ line: 'Studies and design fees', qty: () => 1, unitRs: 45000000 }] },
  { key: 'construction', name: 'Permits and site construction', dependsOn: ['feasibility'], phases: [{ name: 'Permits and enabling works', weeks: 10 }, { name: 'Shell and core construction', weeks: 30 }], lines: [{ line: 'Civil and structure', qty: () => 1, unitRs: 1800000000 }] },
  { key: 'mep', name: 'MEP and plant installation', dependsOn: ['construction'], phases: [{ name: 'Procurement · generators and switchgear', weeks: 52, longLead: true, parallel: true }, { name: 'Procurement · chillers', weeks: 40, longLead: true, parallel: true }, { name: 'Plant additions · MEP install', weeks: 20 }, { name: 'Commission the plant', weeks: 6 }],
    lines: [{ line: 'Generators · 2.5 MW', qty: () => 12, unitRs: 45000000 }, { line: 'Chillers · 1.5 MW', qty: () => 10, unitRs: 30000000 }, { line: 'Transformers · 3 MVA', qty: () => 10, unitRs: 18000000 }, { line: 'UPS · 1.2 MW modules', qty: () => 16, unitRs: 22000000 }] },
  { key: 'network', name: 'Network backbone', dependsOn: ['construction'], phases: [{ name: 'Carrier diversity and fibre entry', weeks: 12 }, { name: 'Install the backbone', weeks: 4 }, { name: 'Commission the backbone', weeks: 2 }], lines: [{ line: 'Border routers', qty: () => 4, unitRs: 9000000 }] },
  { key: 'whitespace', name: 'White-space fit-out', dependsOn: ['mep'], phases: [{ name: 'White-space fit-out', weeks: 12 }, { name: 'Cable the halls', weeks: 6 }], lines: [{ line: 'Racks · 48U 800 mm deep', qty: () => 320, unitRs: 140000 }, { line: 'CRAH units · 150 kW', qty: () => 24, unitRs: 6500000 }] },
  { key: 'rfs', name: 'First hall fit-out and RFS', dependsOn: ['whitespace', 'network'], phases: [{ name: 'First hall install', weeks: 6 }, { name: 'Commission · integrated systems test and RFS', weeks: 4 }], lines: [{ line: 'Load banks and IST', qty: () => 1, unitRs: 25000000 }] },
];
export const templateInfo = (): DeliveryTemplate[] => [
  ...TEMPLATES.map(t => ({ key: t.key, name: t.name, description: t.description, scope: t.scope, icon: t.icon, unit: t.unit, defaultQty: t.defaultQty, weeks: span(t.phases), phases: t.phases.map(p => p.name), budgetFrom: money(t.lines.reduce((a, l) => a + l.qty(t.defaultQty ?? 1) * l.unitRs, 0)) })),
];
function span(ph: Phase[]) { let w = 0; let lead = 0; for (const p of ph) { if (p.parallel) lead = Math.max(lead, p.weeks); else w += p.weeks; } return Math.max(w, lead); }

export interface TplProject { id: string; template: string; name: string; dcId: string; start: number; qty: number; manager: string; status: PlannerPlan['status']; programmeId?: string; greenfield?: string; created?: number;
  /** the item this project buys instead of the template's (the optic, switch or string it really is) */
  line?: { line: string; unitRs: number };
  /** why the project exists, when an incident or a problem raised it (first lines of its history) */
  origin?: string;
  /** later events the estate links to it (an incident on the same fault), on their own dates */
  events?: { at: number; text: string }[] }
export interface Synth { plan: PlannerPlan; eval: { tasks: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[]; finish: number; capex: { line: string; amount: number; basis: string }[]; capexTotal: number }; template: string }

/* a template project as a plan the delivery engine understands */
export function synth(x: TplProject): Synth {
  const gf = x.greenfield ? GREENFIELD.find(g => g.key === x.greenfield) : undefined;
  const t = TEMPLATES.find(k => k.key === x.template);
  const phases = gf?.phases ?? t?.phases ?? [{ name: 'Delivery', weeks: 4 }];
  const lines = x.line ? [{ line: x.line.line, qty: (n: number) => n, unitRs: x.line.unitRs }] : gf?.lines ?? t?.lines ?? [];
  const tasks: Synth['eval']['tasks'] = [];
  let cur = x.start;
  for (const p of phases) {
    if (p.parallel) { tasks.push({ name: p.name, weeks: p.weeks, start: x.start, end: x.start + p.weeks * WEEK, longLead: p.longLead }); continue; }
    /* a sequential phase after a long-lead order waits for it when it needs the kit (installs after procurement) */
    const lead = tasks.filter(k => k.longLead).reduce((a, k) => Math.max(a, k.end), 0);
    const needsKit = /install|cable|swap|plant additions|fit-out|change window · string/i.test(p.name);
    const s0 = needsKit ? Math.max(cur, lead) : cur;
    tasks.push({ name: p.name, weeks: p.weeks, start: s0, end: s0 + p.weeks * WEEK, longLead: p.longLead });
    cur = s0 + p.weeks * WEEK;
  }
  tasks.sort((a, b) => a.start - b.start);
  const capex = lines.map(l => { const q = l.qty(x.qty); return { line: l.line, amount: money(q * l.unitRs), basis: `${q} × ${l.line.split(' · ')[0]}` }; });
  const finish = Math.max(...tasks.map(k => k.end));
  const scope: PlanScope = gf ? 'new-site' : t?.scope ?? 'refresh';
  const plan: PlannerPlan = {
    id: x.id, status: x.status, created: x.created ?? x.start - 2 * WEEK, updated: x.start, scope, name: x.name, dcId: x.dcId, racks: x.template === 'rack-install' || x.template === 'rack-replacement' || x.template === 'hall-fitout' ? x.qty : 0, kwPerRack: 0,
    redundancy: 'N+1', tier: 'Tier III', cooling: 'Air', plant: scope === 'plant-upgrade' ? 'UPS' : undefined, target: finish + 2 * WEEK, owner: x.manager,
    approvals: [{ step: 1, role: 'Delivery lead', who: x.manager, decision: 'Approved', at: x.start - WEEK }],
    history: [...(x.origin ? [{ at: (x.created ?? x.start - 2 * WEEK) - 864e5, who: x.manager, text: x.origin }] : []), { at: x.created ?? x.start - 2 * WEEK, who: x.manager, text: `Project created from the ${gf ? `greenfield blueprint (${gf.name})` : t?.name ?? x.template} template` },
      ...(x.events ?? []).map(e => ({ at: e.at, who: 'Operations', text: e.text }))],
    capacityPlanIds: [], createdRacks: [], scenario: 'Template', source: 'Build programme'
  };
  return { plan, eval: { tasks, finish, capex, capexTotal: capex.reduce((a, c) => a + c.amount, 0) }, template: gf ? `Greenfield · ${gf.name}` : t?.name ?? x.template };
}

/* ---- the seeded portfolio: template projects + programmes around the planner's projects (stable per persona × geography).
   29-Oct-2026 (user: "make the programme data correct"): every name, count and site comes from the estate as generated — the hall the
   planner's PLN-0002 fits out, the routers on lot 22B and their real optic, the WAN edge routers on an old release, the servers, switches,
   firewalls and racks past end of sale at the story sites (lifecycle.ts), the UPS on battery and its autonomy, the planned site — and the
   persona decides what goes into the new hall (no GPU pod for a telco or a colocation operator). */
export function seedPortfolio(db: Db, plannerIds: string[], finishOf: (id: string) => number | undefined, plannerTitle: (id: string) => string | undefined = () => undefined): { projects: TplProject[]; programmes: Programme[] } {
  const now = db.now, ppl = activeGeo().people, persona = db.persona;
  /* sites by estate position (the same story sites in every geography): 9 = the UPS site, 5 / 8 = live sites with older kit, 20 = the DCI far end */
  const siteAt = (pos: number) => (db.datacenters.some(d => d.id === dcAt(pos)) ? dcAt(pos) : db.datacenters[0].id);
  const has = (pid: string) => plannerIds.includes(pid.replace('PRJ-', 'PLN-'));
  const p2 = has('PRJ-0002'), p3 = has('PRJ-0003'), p9 = has('PRJ-0009');
  const site1 = db.datacenters[0];
  const after = (pid: string, fallback: number) => (finishOf(pid.replace('PRJ-', 'PLN-')) ?? fallback) + WEEK;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /* PGM-01: the hall PLN-0002 fits out (the planner names it), else the hero site's last room */
  const hall = /·\s*(.+?) fit-out/.exec(plannerTitle('PLN-0002') ?? '')?.[1] ?? site1.floors.flatMap(f => f.rooms).slice(-1)[0] ?? 'Hall B';
  const FILL: Record<string, { what: string; n: number; leafs: number }> = {
    network: { what: 'NFVI compute racks', n: 12, leafs: 4 }, colocation: { what: 'tenant cabinets with A and B power', n: 24, leafs: 4 },
    cloud: { what: 'compute racks', n: 16, leafs: 8 }, enterprise: { what: 'compute and storage racks', n: 12, leafs: 6 }, neocloud: { what: 'storage racks', n: 12, leafs: 8 },
  };
  const fill = FILL[persona] ?? FILL.cloud;
  const fitStart = now + 2 * WEEK;
  /* the fabric is gated on the fit-out: it starts the week after the hall is handed over (the fit-out's own schedule, long-lead included) */
  const fitFinish = synth({ id: 'PLN-1009', template: 'hall-fitout', name: '', dcId: site1.id, start: fitStart, qty: fill.n, manager: '', status: 'Approved' }).eval.finish;
  const fabricStart = p2 ? after('PRJ-0002', now + 8 * WEEK) : fitFinish + WEEK;
  const fillStart = fabricStart + 15 * WEEK;

  /* PGM-02: UPS-2 at the UPS site (A side) and its autonomy now */
  const s9 = db.datacenters.find(d => d.id === siteAt(9))!;
  const ups2 = s9.power.ups.find(u => /UPS-2$/.test(u.id)) ?? s9.power.ups[0];
  const strings = ups2.capacityKw > 1000 ? 8 : ups2.capacityKw > 400 ? 6 : 4;

  /* PGM-03: the WAN edge routers on the oldest release, the lot 22B routers (the hero edge router + the 4 that show the same decay) */
  const juniperEdge = db.nes.filter(n => n.role === 'Router' && /juniper/i.test(n.vendor) && (/^MX/.test(n.model)));
  const oldest = [...new Set(juniperEdge.map(n => `${n.model}|${n.os}`))].sort((a, b) => (a.split('|')[1] ?? '').localeCompare(b.split('|')[1] ?? ''))[0] ?? 'MX204|21.4R3';
  const [edgeModel = 'MX204', edgeOs = '21.4R3'] = oldest.split('|');
  const edgeFleet = juniperEdge.filter(n => n.model === edgeModel && n.os === edgeOs);
  const toOs = /^2[01]\./.test(edgeOs) ? '23.4R2' : '24.2R2';
  const lotNes = [...new Set([edgeId(persona, site1.id, 1), ...db.alerts.filter(a => /lot 22B/.test(a.description ?? '')).map(a => a.neId)])].filter((id): id is string => !!id && db.neById.has(id));
  const lotOptics = lotNes.flatMap(id => db.ifaces.get(id) ?? []).filter(i => i.optics?.model === 'SFP-10G-LR').length || lotNes.length * 4;
  const far = siteAt(20);

  /* PGM-04: what is really past end of sale at the story sites */
  const pastSale = (dcId: string, roles: string[]) => (siteLifecycle(db, dcId)?.assets ?? []).filter(a => a.endOfSale < now && roles.includes(db.neById.get(a.neId)?.role ?? ''));
  /* never the sites the planner's own refresh plans (server / leaf / rack, PLN-0013…15) already cover: the same kit cannot be in a draft plan
     and in a running project (in the USA PLN-0014's leaf refresh sits at dcAt(5)) */
  const planned2 = new Set(['PLN-0013', 'PLN-0014', 'PLN-0015'].map(id => (plannerTitle(id) ?? '').split(' · ')[0]).filter(Boolean));
  const free = (...pos: number[]) => pos.map(siteAt).find(id => !planned2.has(id)) ?? siteAt(pos[0]);
  const s5 = free(5, 4, 3, 6, 7), s8 = free(8, 10, 12, 14);
  const oldServers = Math.max(1, pastSale(s5, ['Server']).length);
  const oldSwitches = Math.max(2, pastSale(s5, ['Switch']).length);
  const oldFw = pastSale(s9.id, ['Firewall']);
  const fwModel = oldFw[0] ? db.neById.get(oldFw[0].neId)?.model ?? 'FortiGate 3700F' : 'FortiGate 3700F';
  const oldRacks = (siteLifecycle(db, s8)?.racks ?? []).filter(r => r.old || r.condition === 'Damaged');
  const nRacks = Math.max(1, oldRacks.length);
  const rackWhy = oldRacks.some(r => r.condition === 'Damaged') ? (oldRacks.some(r => r.old) ? 'old and damaged' : 'damaged') : 'old';
  const refreshTotal = oldServers + oldSwitches + Math.max(2, oldFw.length) + nRacks;

  /* PGM-05: the planned site, built from the greenfield blueprint (kicked off 30 weeks ago: feasibility done, construction under way) */
  const planned = db.datacenters.find(d => d.status === 'planned');
  const gf = planned ? greenfieldProjects(0, planned.id, `${planned.id} ${planned.city}`, now - 30 * WEEK, ppl[7] ?? 'Programme lead', 'PGM-05') : null;
  if (gf) for (const q of gf.projects) {
    const g = GREENFIELD.find(x => x.key === q.greenfield)!;
    const end = q.start + span(g.phases) * WEEK;
    q.status = end <= now ? 'Delivered' : q.start <= now ? 'Executing' : 'Approved';
  }

  /* PGM-06: the other site being built (not the hero, which has its own hall programme): collector + discovery, then the IST */
  const building = db.datacenters.find(d => d.status === 'in-progress' && d.id !== site1.id);
  const silent = building ? db.nes.filter(n => n.dcId === building.id && n.discovery === 'not-discovered').length : 0;
  /* PGM-07 (GPU estates): the site whose CDU flow alarm slows its GPUs */
  const cduAlarm = db.gpu ? db.alerts.find(a => /CDU Flow Low/i.test(a.title)) : undefined;
  const cduSite = cduAlarm ? db.datacenters.find(d => d.id === cduAlarm.dcId) : undefined;
  const cdus = cduSite ? cduSite.cooling.units.filter(u => u.type === 'CDU').length : 0;

  /* the incidents behind the projects they raised */
  const incLot = db.incidents.find(i => /22B/.test(JSON.stringify(i.rca ?? [])) || /Optical degradation/.test(i.title));
  const incUps = db.incidents.find(i => i.dcId === s9.id && /UPS|battery/i.test(i.title));
  const incCdu = cduSite ? db.incidents.find(i => i.dcId === cduSite.id && /CDU|flow/i.test(i.title)) : undefined;

  const CAGE: Record<string, string> = { network: 'NFVI compute racks', colocation: 'reserved tenant cage', cloud: 'reserved cluster', enterprise: 'business-unit compute racks', neocloud: 'reserved GPU cluster' };
  const P: TplProject[] = [
    ...(p2 ? [] : [{ id: 'PLN-1009', template: 'hall-fitout', name: `${site1.id} · ${hall} fit-out (${fill.n} racks)`, dcId: site1.id, start: fitStart, qty: fill.n, manager: ppl[3] ?? 'Delivery lead', status: 'Approved' as const, programmeId: 'PGM-01' }]),
    { id: 'PLN-1001', template: 'network-install', name: `${site1.id} · ${hall} leaf–spine fabric (${fill.leafs} leaf switches)`, dcId: site1.id, start: fabricStart, qty: fill.leafs, manager: ppl[3] ?? 'Delivery lead', status: 'Approved', programmeId: 'PGM-01' },
    { id: 'PLN-1002', template: 'rack-install', name: `${site1.id} · ${hall} first ${fill.what} (${fill.n})`, dcId: site1.id, start: fillStart, qty: fill.n, manager: ppl[3] ?? 'Delivery lead', status: 'Approved', programmeId: 'PGM-01' },
    { id: 'PLN-1003', template: 'battery-replacement', name: `${s9.id} · ${ups2.name} battery strings (A side, ${strings} strings)`, dcId: s9.id, start: now - 9 * WEEK, qty: strings, manager: ppl[5] ?? 'Facilities lead', status: 'Executing', programmeId: 'PGM-02',
      origin: `Raised after the last battery test showed ageing strings on ${ups2.name}`,
      events: incUps ? [{ at: incUps.detected, text: `${incUps.id} (${incUps.title}): ${ups2.name} is on these strings now; the swap is prioritised` }] : [] },
    { id: 'PLN-1004', template: 'firmware-campaign', name: `WAN edge OS upgrade · ${edgeFleet.length} ${edgeModel} to Junos ${toOs}`, dcId: site1.id, start: now - 3 * WEEK, qty: Math.max(1, edgeFleet.length), manager: ppl[2] ?? 'Network lead', status: 'Executing', programmeId: 'PGM-03' },
    { id: 'PLN-1005', template: 'optics-refresh', name: `Lot 22B optics swap · ${lotOptics} SFP-10G-LR on ${plural(lotNes.length, 'edge router')}`, dcId: site1.id, start: now - 1 * WEEK, qty: lotOptics, manager: ppl[2] ?? 'Network lead', status: 'Executing', programmeId: 'PGM-03',
      line: { line: 'Optics · SFP-10G-LR (lot 24A)', unitRs: 12000 },
      origin: `Raised from the problem record "SFP lot 22B": the same Rx-power decay on ${lotNes.length} edge routers`,
      events: incLot ? [{ at: incLot.detected, text: `${incLot.id} (${incLot.title}) is the same optic lot: its router goes first` }] : [] },
    /* still running: the servers it retires are still in the estate (lifecycle.ts lists them past end of sale) */
    { id: 'PLN-1006', template: 'decommission', name: `${s5} · decommission ${oldServers} past-end-of-sale servers`, dcId: s5, start: now - 5 * WEEK, qty: oldServers, manager: ppl[6] ?? 'Delivery lead', status: 'Executing', programmeId: 'PGM-04' },
    { id: 'PLN-1007', template: 'rack-replacement', name: `${s8} · replace ${plural(nRacks, `${rackWhy} rack`)}`, dcId: s8, start: now - 7 * WEEK, qty: nRacks, manager: ppl[6] ?? 'Delivery lead', status: 'Executing', programmeId: 'PGM-04' },
    { id: 'PLN-1010', template: 'switch-refresh', name: `${s5} · replace ${oldSwitches} past-end-of-sale switches`, dcId: s5, start: now - 4 * WEEK, qty: oldSwitches, manager: ppl[6] ?? 'Delivery lead', status: 'Executing', programmeId: 'PGM-04' },
    { id: 'PLN-1011', template: 'firewall-refresh', name: `${s9.id} · ${fwModel} pair replacement`, dcId: s9.id, start: now + 2 * WEEK, qty: 2, manager: ppl[6] ?? 'Delivery lead', status: 'Approved', programmeId: 'PGM-04' },
    ...(building ? [
      { id: 'PLN-1012', template: 'site-onboarding', name: `${building.id} · collectors and discovery (${silent} devices not reporting)`, dcId: building.id, start: now - 3 * WEEK, qty: Math.max(1, silent), manager: ppl[4] ?? 'Delivery lead', status: 'Executing' as const, programmeId: 'PGM-06' },
      { id: 'PLN-1013', template: 'site-ist', name: `${building.id} · integrated systems test and handover`, dcId: building.id, start: now + 5 * WEEK, qty: 1, manager: ppl[5] ?? 'Facilities lead', status: 'Approved' as const, programmeId: 'PGM-06' },
    ] : []),
    ...(cduSite && cdus ? [
      { id: 'PLN-1014', template: 'firmware-campaign', name: `${cduSite.id} · CDU controller firmware (flow-control fix, ${cdus} CDUs)`, dcId: cduSite.id, start: now - 2 * WEEK, qty: cdus, manager: ppl[5] ?? 'Facilities lead', status: 'Executing' as const, programmeId: 'PGM-07',
        origin: `Raised after the CDU Flow Low alarm at ${cduSite.id}: the vendor's controller release fixes the flow-control loop`,
        events: incCdu ? [{ at: incCdu.detected, text: `${incCdu.id} (${incCdu.title}) is the same fault` }] : [] },
      { id: 'PLN-1015', template: 'cdu-upgrade', name: `${cduSite.id} · CDU pump modules (${cdus} CDUs, one loop at a time)`, dcId: cduSite.id, start: now + 1 * WEEK, qty: cdus, manager: ppl[5] ?? 'Facilities lead', status: 'Approved' as const, programmeId: 'PGM-07' },
    ] : []),
    { id: 'PLN-1008', template: 'rack-install', name: `${siteAt(15)} · ${CAGE[persona] ?? 'reserved cluster'} (8 racks)`, dcId: siteAt(15), start: now + 3 * WEEK, qty: 8, manager: ppl[4] ?? 'Delivery lead', status: 'Approved' },
  ];
  /* a project is created two weeks before it starts, or a few weeks ago when it starts later */
  P.forEach((x, i) => { x.created = Math.min(x.start - 2 * WEEK, now - (2 + i) * WEEK); });
  if (gf) gf.projects.forEach((q, i) => { q.created = Math.min(q.start - 2 * WEEK, now - (31 + i) * WEEK); });
  const ids = (xs: string[]) => xs.map(x => x.replace('PLN-', 'PRJ-'));
  const fitId = p2 ? 'PRJ-0002' : 'PRJ-1009';
  const G: Programme[] = [
    { id: 'PGM-01', name: `${site1.id} ${hall} build-out`, type: 'Site expansion', description: `Fit out ${hall}, build its leaf–spine fabric, then install the first ${fill.n} ${fill.what}.`, sponsor: ppl[0] ?? 'COO', manager: ppl[3] ?? 'Programme lead', status: 'Active', created: now - 20 * WEEK,
      projectIds: [fitId, ...ids(['PLN-1001', 'PLN-1002'])], deps: { 'PRJ-1001': [fitId], 'PRJ-1002': ['PRJ-1001'] } },
    { id: 'PGM-02', name: `${s9.id} power resilience`, type: 'Resilience',
      description: p3 ? `Restore N+1 power: the UPS and chiller expansion, then replace ${ups2.name}'s ageing battery strings (A side, ${ups2.batteryMin} min autonomy today).`
        : `${ups2.name} (A side) is down to ${ups2.batteryMin} min of autonomy: replace its ${strings} ageing battery strings and prove the ride-through with a discharge test. The UPS and chiller expansion is still in the planner (PLN-0003).`,
      sponsor: ppl[1] ?? 'Head of facilities', manager: ppl[5] ?? 'Programme lead', status: 'Active', created: now - 16 * WEEK,
      projectIds: [...(p3 ? ['PRJ-0003'] : []), 'PRJ-1003'], deps: {} },
    { id: 'PGM-03', name: 'DCI 400G and edge modernisation', type: 'Network modernisation',
      description: `${p9 ? `Uplift the ${site1.id}–${far} interconnect to 400G once ` : 'Bring '}the ${edgeFleet.length} ${edgeModel} WAN edge routers ${p9 ? 'are on' : 'to'} Junos ${toOs}, and swap the ${lotOptics} lot 22B optics before more of them fail.`,
      sponsor: ppl[0] ?? 'CTO', manager: ppl[2] ?? 'Programme lead', status: 'Active', created: now - 10 * WEEK,
      projectIds: [...(p9 ? ['PRJ-0009'] : []), 'PRJ-1004', 'PRJ-1005'], deps: { ...(p9 ? { 'PRJ-0009': ['PRJ-1004'] } : {}) } },
    { id: 'PGM-04', name: 'End-of-sale refresh 2026', type: 'Refresh wave', description: `Replace ${refreshTotal} items past vendor end of sale at ${s5}, ${s8} and ${s9.id}: servers, switches, a ${fwModel} pair and ${plural(nRacks, `${rackWhy} rack`)}.`,
      sponsor: ppl[1] ?? 'Head of infrastructure', manager: ppl[6] ?? 'Programme lead', status: 'Active', created: now - 14 * WEEK,
      projectIds: ids(['PLN-1006', 'PLN-1010', 'PLN-1007', 'PLN-1011']), deps: {} },
    ...(gf && planned ? [{ id: 'PGM-05', name: `${planned.id} ${planned.city} new build`, type: 'Greenfield build' as const, description: `Build ${planned.city} from the greenfield blueprint: 6 phases, each gated on the ones before it; generators, switchgear and chillers ordered at kick-off.`,
      sponsor: ppl[0] ?? 'COO', manager: ppl[7] ?? 'Programme lead', status: 'Active' as const, created: now - 32 * WEEK, projectIds: gf.projects.map(q => q.id.replace('PLN-', 'PRJ-')), deps: gf.deps, blueprint: 'Greenfield datacenter build' }] : []),
    ...(building ? [{ id: 'PGM-06', name: `${building.id} ${building.city} into service`, type: 'Greenfield build' as const,
      description: `Bring ${building.city} into service: connect the collectors and discover the ${silent} devices that do not report yet, then run the integrated systems test and hand the site to operations.`,
      sponsor: ppl[1] ?? 'Head of operations', manager: ppl[4] ?? 'Programme lead', status: 'Active' as const, created: now - 6 * WEEK, projectIds: ['PRJ-1012', 'PRJ-1013'], deps: { 'PRJ-1013': ['PRJ-1012'] } }] : []),
    ...(cduSite && cdus ? [{ id: 'PGM-07', name: `${cduSite.id} liquid cooling resilience`, type: 'Resilience' as const,
      description: `CDU flow at ${cduSite.id} fell below its set point and ${persona === 'colocation' ? 'the tenant AI cages it cools run hot' : 'the GPUs it cools are slowing down'}: fix the flow-control firmware now, then upgrade the pump modules on its ${cdus} CDUs one loop at a time.`,
      sponsor: ppl[1] ?? 'Head of facilities', manager: ppl[5] ?? 'Programme lead', status: 'Active' as const, created: now - 3 * WEEK, projectIds: ['PRJ-1014', 'PRJ-1015'], deps: { 'PRJ-1015': ['PRJ-1014'] } }] : []),
  ];
  return { projects: [...P, ...(gf?.projects ?? [])], programmes: G };
}

/* a greenfield programme from the blueprint: one project per phase, gated on its predecessors */
export function greenfieldProjects(seq: number, dcId: string, site: string, start: number, manager: string, programmeId: string): { projects: TplProject[]; deps: Record<string, string[]> } {
  const id = (k: string) => `PLN-${2000 + seq * 10 + GREENFIELD.findIndex(g => g.key === k) + 1}`;
  const deps: Record<string, string[]> = {};
  const startOf = new Map<string, number>();
  const projects: TplProject[] = [];
  for (const g of GREENFIELD) {
    const s = g.dependsOn.length ? Math.max(...g.dependsOn.map(d => startOf.get(d)! + GREENFIELD.find(x => x.key === d)!.phases.filter(p => !p.parallel).reduce((a, p) => a + p.weeks, 0) * WEEK)) : start;
    /* MEP's long-lead plant is ordered at kick-off, so the project starts with the programme (its installs still wait for construction) */
    const s0 = g.key === 'mep' ? start : s;
    startOf.set(g.key, s);
    projects.push({ id: id(g.key), template: 'greenfield', greenfield: g.key, name: `${site} · ${g.name}`, dcId, start: s0, qty: 1, manager, status: 'Approved', programmeId });
    deps[id(g.key).replace('PLN-', 'PRJ-')] = g.dependsOn.map(d => id(d).replace('PLN-', 'PRJ-'));
  }
  return { projects, deps };
}
