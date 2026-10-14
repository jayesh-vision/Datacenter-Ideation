/* Delivery project templates and the seeded delivery portfolio (14-Oct-2026, P2B gap fill: programmes, project templates).
   A template project is delivery work that does not need a planner plan (a rack install, a network upgrade, a firmware campaign, a
   decommission, a battery swap, a greenfield phase). It is turned into a synthetic plan + schedule + cost lines so mock/delivery.ts
   gives it work orders, purchase orders, commissioning, permits and documents exactly as it does for a planner project.
   Money constants are rupees wrapped with money(); dates are relative to the mock clock. */
import type { DeliveryTemplate, PlannerPlan, PlanScope, Programme } from '../api/types';
import type { Db } from './generate';
import { activeGeo, dcAt, money } from './geo';

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
    lines: [{ line: 'New equipment · leaf switches 400G', qty: n => n, unitRs: 4500000 }, { line: 'New equipment · 400G optics', qty: n => n * 32, unitRs: 120000 }] },
  { key: 'firmware-campaign', name: 'Firmware / OS campaign', description: 'Validate in the lab, then upgrade devices in change windows wave by wave.', scope: 'refresh', icon: 'RefreshCcw', unit: 'devices', defaultQty: 24,
    phases: [{ name: 'Lab validation', weeks: 2 }, { name: 'Change window · wave 1', weeks: 1 }, { name: 'Change window · wave 2', weeks: 1 }, { name: 'Change window · wave 3', weeks: 1 }, { name: 'Commission and close', weeks: 1 }],
    lines: [{ line: 'Vendor support hours', qty: n => Math.ceil(n / 4), unitRs: 85000 }] },
  { key: 'optics-refresh', name: 'Optics refresh', description: 'Replace a failing optics lot: analyse, order replacements, swap them in change windows and re-test the links.', scope: 'refresh', icon: 'Cable', unit: 'optics', defaultQty: 48,
    phases: [{ name: 'Failure analysis', weeks: 1 }, { name: 'Procurement · replacement optics', weeks: 4, longLead: true, parallel: true }, { name: 'Change window · swap optics', weeks: 2 }, { name: 'Commission the links', weeks: 1 }],
    lines: [{ line: 'New equipment · 100G LR4 optics', qty: n => n, unitRs: 35000 }] },
  { key: 'battery-replacement', name: 'UPS battery replacement', description: 'Survey, order battery strings, swap them string by string in change windows and run a discharge test.', scope: 'plant-upgrade', icon: 'BatteryCharging', unit: 'strings', defaultQty: 4,
    phases: [{ name: 'Battery survey', weeks: 1 }, { name: 'Procurement · UPS battery strings', weeks: 10, longLead: true, parallel: true }, { name: 'Change window · string swap', weeks: 2 }, { name: 'Commission and discharge test', weeks: 1 }],
    lines: [{ line: 'UPS battery strings · VRLA 40-block', qty: n => n, unitRs: 1800000 }] },
  { key: 'rack-replacement', name: 'Rack replacement', description: 'Order new racks, move devices to temporary racks, install the new racks and move the devices back.', scope: 'rack-expansion', icon: 'Replace', unit: 'racks', defaultQty: 6,
    phases: [{ name: 'Procurement · racks', weeks: 6, longLead: true }, { name: 'Migrate devices to temporary racks', weeks: 2 }, { name: 'Install new racks', weeks: 2 }, { name: 'Cable and power', weeks: 1 }, { name: 'Commission', weeks: 1 }],
    lines: [{ line: 'Racks · 48U 800 mm deep', qty: n => n, unitRs: 140000 }] },
  { key: 'decommission', name: 'Decommission', description: 'Migrate workloads off, sanitise data, remove and recycle the equipment and close out the space.', scope: 'refresh', icon: 'Trash2', unit: 'devices', defaultQty: 20,
    phases: [{ name: 'Migrate workloads', weeks: 4 }, { name: 'Decommission and data sanitisation', weeks: 2 }, { name: 'Remove and recycle', weeks: 1 }, { name: 'Close out', weeks: 1 }],
    lines: [{ line: 'Disposal and sanitisation', qty: n => n, unitRs: 15000 }] },
];
/* greenfield blueprint: one project per phase, each gated on the ones before it; MEP long-lead plant is ordered at programme kick-off */
export const GREENFIELD: { key: string; name: string; dependsOn: string[]; phases: Phase[]; lines: Line[] }[] = [
  { key: 'feasibility', name: 'Master planning and feasibility', dependsOn: [], phases: [{ name: 'Site selection and feasibility', weeks: 8 }, { name: 'Master plan and basis of design', weeks: 6 }], lines: [{ line: 'Studies and design fees', qty: () => 1, unitRs: 45000000 }] },
  { key: 'construction', name: 'Permits and site construction', dependsOn: ['feasibility'], phases: [{ name: 'Permits and enabling works', weeks: 10 }, { name: 'Shell and core construction', weeks: 30 }], lines: [{ line: 'Civil and structure', qty: () => 1, unitRs: 1800000000 }] },
  { key: 'mep', name: 'MEP and plant installation', dependsOn: ['construction'], phases: [{ name: 'Procurement · generators and switchgear', weeks: 52, longLead: true, parallel: true }, { name: 'Procurement · chillers', weeks: 40, longLead: true, parallel: true }, { name: 'Plant additions · MEP install', weeks: 20 }, { name: 'Commission the plant', weeks: 6 }],
    lines: [{ line: 'Generators · 2.5 MW', qty: () => 12, unitRs: 45000000 }, { line: 'Chillers · 1.5 MW', qty: () => 10, unitRs: 30000000 }, { line: 'Transformers · 3 MVA', qty: () => 10, unitRs: 18000000 }, { line: 'UPS · 1.2 MW modules', qty: () => 16, unitRs: 22000000 }] },
  { key: 'network', name: 'Network backbone', dependsOn: ['construction'], phases: [{ name: 'Carrier diversity and fibre entry', weeks: 12 }, { name: 'Install the backbone', weeks: 4 }, { name: 'Commission the backbone', weeks: 2 }], lines: [{ line: 'New equipment · border routers', qty: () => 4, unitRs: 9000000 }] },
  { key: 'whitespace', name: 'White-space fit-out', dependsOn: ['mep'], phases: [{ name: 'White-space fit-out', weeks: 12 }, { name: 'Cable the halls', weeks: 6 }], lines: [{ line: 'Racks · 48U 800 mm deep', qty: () => 320, unitRs: 140000 }, { line: 'CRAH units · 150 kW', qty: () => 24, unitRs: 6500000 }] },
  { key: 'rfs', name: 'First hall fit-out and RFS', dependsOn: ['whitespace', 'network'], phases: [{ name: 'First hall install', weeks: 6 }, { name: 'Commission · integrated systems test and RFS', weeks: 4 }], lines: [{ line: 'Load banks and IST', qty: () => 1, unitRs: 25000000 }] },
];
export const templateInfo = (): DeliveryTemplate[] => [
  ...TEMPLATES.map(t => ({ key: t.key, name: t.name, description: t.description, scope: t.scope, icon: t.icon, unit: t.unit, defaultQty: t.defaultQty, weeks: span(t.phases), phases: t.phases.map(p => p.name), budgetFrom: money(t.lines.reduce((a, l) => a + l.qty(t.defaultQty ?? 1) * l.unitRs, 0)) })),
];
function span(ph: Phase[]) { let w = 0; let lead = 0; for (const p of ph) { if (p.parallel) lead = Math.max(lead, p.weeks); else w += p.weeks; } return Math.max(w, lead); }

export interface TplProject { id: string; template: string; name: string; dcId: string; start: number; qty: number; manager: string; status: PlannerPlan['status']; programmeId?: string; greenfield?: string; created?: number }
export interface Synth { plan: PlannerPlan; eval: { tasks: { name: string; weeks: number; start: number; end: number; longLead?: boolean }[]; finish: number; capex: { line: string; amount: number; basis: string }[]; capexTotal: number }; template: string }

/* a template project as a plan the delivery engine understands */
export function synth(x: TplProject): Synth {
  const gf = x.greenfield ? GREENFIELD.find(g => g.key === x.greenfield) : undefined;
  const t = TEMPLATES.find(k => k.key === x.template);
  const phases = gf?.phases ?? t?.phases ?? [{ name: 'Delivery', weeks: 4 }];
  const lines = gf?.lines ?? t?.lines ?? [];
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
    id: x.id, status: x.status, created: x.created ?? x.start - 2 * WEEK, updated: x.start, scope, name: x.name, dcId: x.dcId, racks: x.template === 'rack-install' || x.template === 'rack-replacement' ? x.qty : 0, kwPerRack: 0,
    redundancy: 'N+1', tier: 'Tier III', cooling: 'Air', plant: scope === 'plant-upgrade' ? 'UPS' : undefined, target: finish + 2 * WEEK, owner: x.manager,
    approvals: [{ step: 1, role: 'Delivery lead', who: x.manager, decision: 'Approved', at: x.start - WEEK }],
    history: [{ at: x.created ?? x.start - 2 * WEEK, who: x.manager, text: `Project created from the ${gf ? `greenfield blueprint (${gf.name})` : t?.name ?? x.template} template` }],
    capacityPlanIds: [], createdRacks: [], scenario: 'Template', source: 'Build programme'
  };
  return { plan, eval: { tasks, finish, capex, capexTotal: capex.reduce((a, c) => a + c.amount, 0) }, template: gf ? `Greenfield · ${gf.name}` : t?.name ?? x.template };
}

/* ---- the seeded portfolio: template projects + programmes around the planner's projects (stable per persona × geography) */
export function seedPortfolio(db: Db, plannerIds: string[], finishOf: (id: string) => number | undefined): { projects: TplProject[]; programmes: Programme[] } {
  const now = db.now, ppl = activeGeo().people;
  /* sites by estate position (the same story sites in every geography): 9 = the UPS site, 5 / 8 / 15 = live sites with older kit */
  const siteAt = (pos: number) => (db.datacenters.some(d => d.id === dcAt(pos)) ? dcAt(pos) : db.datacenters[0].id);
  const has = (pid: string) => plannerIds.includes(pid.replace('PRJ-', 'PLN-'));
  const p2 = has('PRJ-0002'), p3 = has('PRJ-0003'), p9 = has('PRJ-0009');
  const site2 = db.datacenters[0].id;
  const after = (pid: string, fallback: number) => (finishOf(pid.replace('PRJ-', 'PLN-')) ?? fallback) + WEEK;
  const P: TplProject[] = [
    { id: 'PLN-1001', template: 'network-install', name: `${site2} · Hall 3 network fabric`, dcId: site2, start: p2 ? after('PRJ-0002', now + 8 * WEEK) : now + 2 * WEEK, qty: 8, manager: ppl[3] ?? 'Delivery lead', status: 'Approved', programmeId: 'PGM-01' },
    { id: 'PLN-1002', template: 'rack-install', name: `${site2} · Hall 3 GPU pod install (16 racks)`, dcId: site2, start: (p2 ? after('PRJ-0002', now + 8 * WEEK) : now + 2 * WEEK) + 15 * WEEK, qty: 16, manager: ppl[3] ?? 'Delivery lead', status: 'Approved', programmeId: 'PGM-01' },
    { id: 'PLN-1003', template: 'battery-replacement', name: `${siteAt(9)} · UPS-2 battery strings`, dcId: siteAt(9), start: now - 9 * WEEK, qty: 4, manager: ppl[5] ?? 'Facilities lead', status: 'Executing', programmeId: 'PGM-02' },
    { id: 'PLN-1004', template: 'firmware-campaign', name: 'Border router OS upgrade · Junos 23.4R2', dcId: site2, start: now - 3 * WEEK, qty: 24, manager: ppl[2] ?? 'Network lead', status: 'Executing', programmeId: 'PGM-03' },
    { id: 'PLN-1005', template: 'optics-refresh', name: `${site2} · 100G LR4 optics refresh (lot 22B)`, dcId: site2, start: now - 1 * WEEK, qty: 48, manager: ppl[2] ?? 'Network lead', status: 'Executing', programmeId: 'PGM-03' },
    { id: 'PLN-1006', template: 'decommission', name: `${siteAt(5)} · Legacy storage decommission`, dcId: siteAt(5), start: now - 12 * WEEK, qty: 20, manager: ppl[6] ?? 'Delivery lead', status: 'Delivered', programmeId: 'PGM-04' },
    { id: 'PLN-1007', template: 'rack-replacement', name: `${siteAt(8)} · Row C rack replacement`, dcId: siteAt(8), start: now - 7 * WEEK, qty: 6, manager: ppl[6] ?? 'Delivery lead', status: 'Executing', programmeId: 'PGM-04' },
    { id: 'PLN-1008', template: 'rack-install', name: `${siteAt(15)} · Reserved cluster cage (8 racks)`, dcId: siteAt(15), start: now + 3 * WEEK, qty: 8, manager: ppl[4] ?? 'Delivery lead', status: 'Approved' },
  ];
  /* a project is created two weeks before it starts, or a few weeks ago when it starts later */
  P.forEach((x, i) => { x.created = Math.min(x.start - 2 * WEEK, now - (2 + i) * WEEK); });
  const ids = (xs: string[]) => xs.map(x => x.replace('PLN-', 'PRJ-'));
  const G: Programme[] = [
    { id: 'PGM-01', name: `${site2} Hall 3 expansion`, type: 'Site expansion', description: 'Fit out Hall 3, build its network fabric, then install the first GPU pod.', sponsor: ppl[0] ?? 'COO', manager: ppl[3] ?? 'Programme lead', status: 'Active', created: now - 20 * WEEK,
      projectIds: [...(p2 ? ['PRJ-0002'] : []), ...ids(['PLN-1001', 'PLN-1002'])], deps: { 'PRJ-1001': p2 ? ['PRJ-0002'] : [], 'PRJ-1002': ['PRJ-1001'] } },
    { id: 'PGM-02', name: `${siteAt(9)} power resilience`, type: 'Resilience', description: 'Restore N+1 power: UPS and chiller expansion, then replace the ageing UPS-2 battery strings.', sponsor: ppl[1] ?? 'Head of facilities', manager: ppl[5] ?? 'Programme lead', status: 'Active', created: now - 16 * WEEK,
      projectIds: [...(p3 ? ['PRJ-0003'] : []), 'PRJ-1003'], deps: {} },
    { id: 'PGM-03', name: 'DCI 400G modernisation', type: 'Network modernisation', description: 'Uplift the data-centre interconnect to 400G, upgrade the border routers and replace the failing optics lot.', sponsor: ppl[0] ?? 'CTO', manager: ppl[2] ?? 'Programme lead', status: 'Active', created: now - 10 * WEEK,
      projectIds: [...(p9 ? ['PRJ-0009'] : []), 'PRJ-1004', 'PRJ-1005'], deps: { ...(p9 ? { 'PRJ-0009': ['PRJ-1004'] } : {}) } },
    { id: 'PGM-04', name: 'End-of-support refresh 2026', type: 'Refresh wave', description: 'Retire equipment past vendor support and replace under-rated racks across the estate.', sponsor: ppl[1] ?? 'Head of infrastructure', manager: ppl[6] ?? 'Programme lead', status: 'Active', created: now - 14 * WEEK,
      projectIds: ['PRJ-1006', 'PRJ-1007'], deps: {} },
  ];
  return { projects: P, programmes: G };
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
