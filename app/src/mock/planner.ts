/* Planner (13-Oct-2026, P2B merge phase 4). P2B's planner engine is tied to its own record store, so it is rebuilt here on our estate
   with the same method: a plan (scope + where + requirements) is sized at its redundancy, CHECKED against what the site really has
   (P2B's checks passed by construction because it sized the plant from the load; here an in-site plan is compared with the site's UPS,
   generator, cooling, CDU and floor positions, so it can fail and says what to add), costed from benchmarks (CapEx lines, OpEx with PUE at
   part load, a ten-year cash flow, NPV / IRR / payback), scheduled from lead times, and routed through an approval chain set by its CapEx.
   Executing a plan writes Capacity plans (and, for racks, planned racks in DCIM), so Planner → Capacity → DCIM stay one story.
   Seed plans are derived: one per existing facility capacity plan, the planned site's build, and drafts where the estate is under pressure. */
import type {
  Datacenter, PlanApproval, PlanBenchmark, PlanCheck, PlanEval, PlanFinding, PlanInput, PlanPlantLine, PlannerPlan, PlanScenarioRow, PlanScope, PlanStatus,
  PlanTask, PlanTemplate, NeRole
} from '../api/types';
import type { Db } from './generate';
import { activeGeo, money } from './geo';
import { dcimModel } from './dcim';
import { modelDates } from './lifecycle';
import { DAY } from './seed';
import { currencySymbol, fmtMoney } from '../lib/format';

const WEEK = 7 * DAY;
const r0 = Math.round, r1 = (n: number) => Math.round(n * 10) / 10, r2 = (n: number) => Math.round(n * 100) / 100;
const PF = 0.95;                 // transformers and UPS at 0.95 power factor (one constant everywhere)
const GEN_PF = 0.8;              // standby generators are rated in kVA at 0.8 pf (ISO 8528)
const LIQUID_SHARE = { Air: 0, 'Rear-door': 0.85, 'Liquid-to-chip': 0.75 } as const; // share of rack heat taken by water
const HOT = () => activeGeo().id === 'in';
export const designPue = (cooling: PlanInput['cooling']) => (cooling === 'Liquid-to-chip' ? (HOT() ? 1.28 : 1.22) : cooling === 'Rear-door' ? (HOT() ? 1.42 : 1.35) : HOT() ? 1.55 : 1.45);
/* PUE rises at part load (fixed losses spread over less IT): + 0.35 × (1 − load)² */
const pueAt = (design: number, load: number) => r2(design + 0.35 * (1 - load) ** 2);
const RAMP = [0.3, 0.55, 0.75, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85];

/* ---- reference values (each with its source); money in rupees, converted per geography */
const RATE = {
  mep: { 'Tier II': 3_60_000, 'Tier III': 4_80_000, 'Tier IV': 5_80_000 } as Record<string, number>, // ₹ per IT kW, electrical + mechanical
  shellM2: 55_000, rack: 6_00_000, liquidRack: 9_00_000, cdu: 1_40_00_000, upsKw: 45_000, crah: 38_00_000, gen: 4_50_00_000, xfmr: 1_20_00_000, chiller: 2_10_00_000,
  tariff: 8.5, maint: 0.025, contingency: 0.1,
  device: { Router: 60_00_000, Switch: 18_00_000, Firewall: 30_00_000, DWDM: 75_00_000, Access: 6_00_000, Server: 6_00_000, Storage: 40_00_000, GPU: 2_60_00_000, 'Tenant gear': 0 } as Record<NeRole, number>,
  migrate: 40_000
};
/* ₹ per IT kW per month: colocation sells space + power; a cloud sells compute (CPU racks) or GPU time (GPU racks: ≈ 8 GPUs per 10 kW node
   at the persona's GPU rate); telco and enterprise plans are cost-only */
const REVENUE_KW = { colocation: 11_000, cloud: 70_000, neocloud: 60_000, network: 0, enterprise: 0 } as const;
const REVENUE_GPU_KW = { cloud: 1_40_000, neocloud: 1_17_000 } as const;
export function benchmarks(): PlanBenchmark[] {
  const m = (n: number) => fmtMoney(money(n));
  return [
    { key: 'pue-air', group: 'Energy', label: 'Design PUE, air cooled', value: `${designPue('Air')}`, source: HOT() ? 'Indian hot-humid climate; Uptime Institute 2024 survey average 1.56' : 'Temperate US climate; Uptime Institute 2024 survey average 1.56' },
    { key: 'pue-rdhx', group: 'Energy', label: 'Design PUE, rear-door heat exchangers', value: `${designPue('Rear-door')}`, source: 'Water at the rack, fewer CRAH fans; vendor RDHx guidance' },
    { key: 'pue-dlc', group: 'Energy', label: 'Design PUE, direct liquid to chip', value: `${designPue('Liquid-to-chip')}`, source: 'ASHRAE TC 9.9 liquid-cooling guidance; ~75% of heat to water' },
    { key: 'pue-part', group: 'Energy', label: 'PUE at part load', value: 'design + 0.35 × (1 − load)²', source: 'Fixed losses (UPS, transformers, fans) spread over less IT load' },
    { key: 'tariff', group: 'Energy', label: 'Electricity tariff', value: `${currencySymbol()}${money(RATE.tariff).toFixed(2)} per kWh`, source: HOT() ? 'Commercial HT tariff, Indian state utilities (2025 range ₹7–10)' : 'US commercial average (EIA 2025)' },
    { key: 'grid', group: 'Energy', label: 'Grid emission factor', value: HOT() ? '0.716 kg CO₂/kWh' : '0.371 kg CO₂/kWh', source: HOT() ? 'CEA CO₂ baseline database v19' : 'EPA eGRID 2022' },
    { key: 'pf', group: 'Power', label: 'Power factor (transformers, UPS)', value: `${PF}`, source: 'One constant across the planner' },
    { key: 'genpf', group: 'Power', label: 'Generator rating', value: `kVA × ${GEN_PF}`, source: 'Standby rating, ISO 8528' },
    { key: 'ups', group: 'Power', label: 'UPS module', value: '250 kW (≤ 1 MW IT per hall) or 500 kW', source: 'Modular UPS frames' },
    { key: 'xfmr', group: 'Power', label: 'Transformer', value: '2,500 kVA', source: 'MV/LV distribution transformer' },
    { key: 'gen', group: 'Power', label: 'Generator', value: '3,000 kVA standby (2,400 kW), +10% margin', source: 'Facility load with step-load margin' },
    { key: 'fuel', group: 'Power', label: 'Fuel autonomy', value: '12 h (Tier III) · 72 h (TIA-942 Rated 3)', source: 'Uptime Institute minimum 12 h; TIA-942-C' },
    { key: 'red', group: 'Power', label: 'Redundancy check', value: '2N: one side carries all · N+1: all but the largest unit', source: 'Uptime Institute topology definitions' },
    { key: 'crah', group: 'Cooling', label: 'CRAH unit', value: '250 kW, +10% margin', source: 'Chilled-water CRAH' },
    { key: 'cdu', group: 'Cooling', label: 'Coolant distribution unit', value: '1,000 kW', source: 'In-row / facility CDU' },
    { key: 'chiller', group: 'Cooling', label: 'Chiller / dry cooler', value: '1,500 kW, with the plan\'s redundancy', source: 'Heat rejection sized on IT + 5% losses' },
    { key: 'air30', group: 'Cooling', label: 'Air cooling limit', value: '≈ 30 kW per rack (15 kW without containment)', source: 'ASHRAE TC 9.9; vendor guidance' },
    { key: 'white', group: 'Space', label: 'White space per rack', value: '2.6 m² air · 3.2 m² liquid / AI', source: 'Rack + share of aisles' },
    { key: 'gross', group: 'Space', label: 'Gross building', value: 'white space × 1.6', source: 'Support, plant rooms, circulation' },
    { key: 'mep', group: 'Cost', label: 'Electrical & mechanical per IT kW', value: `${m(RATE.mep['Tier II'])} · ${m(RATE.mep['Tier III'])} · ${m(RATE.mep['Tier IV'])} (Tier II · III · IV)`, source: 'Delivered programmes; Turner & Townsend DC cost index 2024' },
    { key: 'shell', group: 'Cost', label: 'Building shell per m²', value: m(RATE.shellM2), source: 'Construction rate, Grade-A shell' },
    { key: 'rack', group: 'Cost', label: 'Rack fit-out', value: `${m(RATE.rack)} per rack · +${m(RATE.liquidRack)} for liquid`, source: 'Rack, two PDUs, containment and cabling share' },
    { key: 'plant', group: 'Cost', label: 'Plant items', value: `UPS ${m(RATE.upsKw)}/kW · CRAH ${m(RATE.crah)} · CDU ${m(RATE.cdu)} · generator ${m(RATE.gen)} · transformer ${m(RATE.xfmr)} · chiller ${m(RATE.chiller)}`, source: 'Supplier quotes, last 12 months' },
    { key: 'cont', group: 'Cost', label: 'Contingency', value: '10% of CapEx', source: 'Own line, not hidden in rates' },
    { key: 'maint', group: 'Cost', label: 'Maintenance', value: '2.5% of facility CapEx per year', source: 'PM contracts' },
    { key: 'rev', group: 'Revenue', label: 'Revenue per IT kW per month', value: `colocation ${m(REVENUE_KW.colocation)} · cloud compute ${m(REVENUE_KW.cloud)} · GPU cloud compute ${m(REVENUE_KW.neocloud)} · GPU racks ${m(REVENUE_GPU_KW.cloud)} (cloud) / ${m(REVENUE_GPU_KW.neocloud)} (GPU cloud)`, source: 'Current price book at the planned utilisation; telco and enterprise plans are cost-only' },
    { key: 'it', group: 'Cost', label: 'Compute bought with the capacity', value: `GPU node ${m(RATE.device.GPU)} (≈10 kW) · server ${m(RATE.device.Server)} (≈0.7 kW)`, source: 'Cloud and enterprise plans buy the compute that earns or serves; colocation tenants bring their own' },
    { key: 'ramp', group: 'Revenue', label: 'Utilisation ramp', value: '30% · 55% · 75% · 85% from year 4', source: 'Sales pipeline history' },
    { key: 'wacc', group: 'Revenue', label: 'Discount rate', value: HOT() ? '11%' : '8%', source: 'Group WACC' },
    { key: 'lead', group: 'Schedule', label: 'Long-lead items', value: 'transformer 40 w · generator 36 w · UPS 20 w · chiller 24 w · CDU 20 w · CRAH 16 w · racks & PDUs 8 w', source: 'Supplier lead times, last two quarters' },
    { key: 'cx', group: 'Schedule', label: 'Commissioning L1–L5', value: '2 w (racks) · 6 w (hall) · 10 w (site)', source: 'Factory test → integrated systems test' }
  ];
}

export const TEMPLATES: PlanTemplate[] = [
  { scope: 'rack-expansion', name: 'Rack expansion', group: 'Grow in place', needsSite: true, description: 'Add racks in an existing hall: checks free positions, rack power, UPS, generator and cooling headroom of the site.', defaults: { racks: 8, kwPerRack: 10, cooling: 'Air', redundancy: 'N+1' }, checks: ['positions', 'rack-power', 'site-power', 'ups', 'generator', 'cooling'] },
  { scope: 'ai-pod', name: 'AI / GPU pod', group: 'Grow in place', needsSite: true, description: 'High-density liquid-cooled racks for GPU nodes: adds CDU capacity, liquid manifolds and the power to feed 40–80 kW racks.', defaults: { racks: 8, kwPerRack: 45, cooling: 'Liquid-to-chip', redundancy: 'N+1' }, checks: ['positions', 'rack-power', 'density', 'site-power', 'ups', 'generator', 'cooling', 'cdu'] },
  { scope: 'new-hall', name: 'New hall', group: 'Build new', needsSite: true, description: 'Fit out a new data hall in an existing building with its own UPS and cooling; the site\'s utility intake and generators must carry it.', defaults: { racks: 40, kwPerRack: 12, cooling: 'Air', redundancy: 'N+1' }, checks: ['site-power', 'generator'] },
  { scope: 'new-site', name: 'New datacenter', group: 'Build new', needsSite: false, description: 'A new building: utility intake, transformers, generators, UPS, cooling plant, halls and shell, sized at the chosen tier.', defaults: { racks: 200, kwPerRack: 12, cooling: 'Air', redundancy: '2N', tier: 'Tier III' }, checks: [] },
  { scope: 'plant-upgrade', name: 'Plant upgrade', group: 'Upgrade & refresh', needsSite: true, description: 'Add UPS modules, cooling units or a generator to restore redundancy or raise the site\'s ceiling.', defaults: { plant: 'UPS', plantKw: 500, racks: 0, kwPerRack: 0 }, checks: ['ups', 'generator', 'cooling'] },
  { scope: 'refresh', name: 'Equipment refresh', group: 'Upgrade & refresh', needsSite: true, description: 'Replace a device model that is leaving vendor support with a current one; checks the extra draw against the site\'s headroom.', defaults: { racks: 0, kwPerRack: 0 }, checks: ['site-power', 'ups', 'cooling'] }
];
export const templateOf = (s: PlanScope) => TEMPLATES.find(t => t.scope === s)!;

/* ------------------------------------------------------------------ store */

let store: PlannerPlan[] | null = null;
let storeDb: Db | null = null;
let seq = 0;
export const resetPlanner = () => { store = null; storeDb = null; };
export function plans(db: Db): PlannerPlan[] {
  if (!store || storeDb !== db) { storeDb = db; seq = 0; store = seed(db); }
  return store;
}
const nextId = () => `PLN-${String(++seq).padStart(3, '0')}`;
const people = () => { const p = activeGeo().people; return { lead: p[3] ?? 'Site lead', head: p[1] ?? 'Head of DC operations', cfo: p[5] ?? 'CFO', planner: p[2] ?? 'Capacity planner' }; };

export function approvalChain(capex: number): PlanApproval[] {
  const pp = people();
  const steps: PlanApproval[] = [{ step: 1, role: 'Site lead', who: pp.lead, decision: 'Pending' }];
  if (capex > money(1_00_00_000)) steps.push({ step: 2, role: 'Head of DC operations', who: pp.head, decision: 'Waiting' });
  if (capex > money(10_00_00_000)) steps.push({ step: 3, role: 'CFO', who: pp.cfo, decision: 'Waiting' });
  return steps;
}

function seed(db: Db): PlannerPlan[] {
  const out: PlannerPlan[] = [];
  const pp = people();
  const dm = dcimModel(db);
  const live = db.datacenters.filter(d => d.status !== 'planned');
  const dcOf = (id: string) => db.datacenters.find(d => d.id === id)!;
  /* dates follow the schedule: work in flight was started early enough to land on its target; drafts and plans in review target
     their own finish plus three weeks (the AI pod keeps a tight target: its CDU lead time is the finding) */
  const mk = (x: PlanInput, status: PlanStatus, source: PlannerPlan['source'], capacityPlanIds: string[] = [], tight = false): PlannerPlan => {
    const p: PlannerPlan = { ...x, id: nextId(), status, created: db.now, updated: db.now, approvals: [], history: [], capacityPlanIds, createdRacks: [], scenario: 'base', source };
    const span = evaluate(db, { ...p, target: db.now }).finish - db.now;
    if (status === 'Draft' || status === 'In review') { p.created = db.now - (status === 'Draft' ? 4 : 12) * DAY; if (!tight) p.target = db.now + span + 21 * DAY; }
    else if (status === 'Approved') p.created = db.now - 10 * DAY;   // approved last week, not started: its own lead times decide whether it meets its target
    else p.created = Math.min(db.now - 10 * DAY, p.target - span - 7 * DAY);
    p.updated = p.created;
    p.history.push({ at: p.created, who: x.owner, text: `Plan created (${templateOf(x.scope).name})` });
    const ev = evaluate(db, p);
    p.approvals = approvalChain(ev.capexTotal);
    if (status !== 'Draft' && status !== 'In review') { p.approvals.forEach(a => { a.decision = 'Approved'; a.at = p.created + 2 * DAY * a.step; }); p.history.push({ at: p.created + 2 * DAY * p.approvals.length, who: p.approvals[p.approvals.length - 1].who, text: 'Approved' }); }
    if (status === 'In review') { p.history.push({ at: p.created + DAY, who: x.owner, text: 'Submitted for approval' }); if (p.approvals[1]) { p.approvals[0].decision = 'Approved'; p.approvals[0].at = p.created + 2 * DAY; p.approvals[1].decision = 'Pending'; } }
    if (status === 'Executing') p.history.push({ at: p.created + 2 * DAY * p.approvals.length + DAY, who: x.owner, text: 'Execution started: capacity plans raised' });
    return p;
  };
  const workHalls = (dcId: string) => { const hs = dm.halls.filter(h => h.dcId === dcId && h.racks > 0 && h.kind !== 'Network room' && h.kind !== 'Meet-me room'); return hs.length ? hs : dm.halls.filter(h => h.dcId === dcId && h.racks > 0); };
  const roomiest = (dcId: string, named?: string) => { const hs = workHalls(dcId); return (named ? dm.halls.find(h => h.dcId === dcId && named.toLowerCase().includes(h.name.toLowerCase())) : undefined) ?? [...hs].sort((a, b) => freePositions(db, b.id) - freePositions(db, a.id))[0]; };
  const avgBudget = (hallId?: string) => { const rs = dm.racks.filter(r => r.hallId === hallId && r.budgetKw); return rs.length ? Math.max(4, Math.round(rs.reduce((a, r) => a + r.budgetKw, 0) / rs.length)) : 8; };
  /* how much IT the site can still take before its intake, UPS or generator runs out (80% of the tightest) */
  const itRoom = (d: Datacenter) => { const s = siteNow(db, d); return Math.max(0, 0.8 * Math.min((s.cap - s.facility) / d.power.pue, s.upsUsable - s.upsUse, s.genKw / 1.1 / d.power.pue - s.facility / d.power.pue)); };
  const siteRed = (d: Datacenter) => d.power.ups[0]?.redundancy ?? 'N+1';

  /* 1 · every facility capacity plan becomes the planner plan behind it */
  for (const c of db.plans) {
    if (c.dimension !== 'Power' && c.dimension !== 'Cooling' && c.dimension !== 'Space') continue;
    const st: PlanStatus = c.status === 'Submitted' ? 'In review' : c.status === 'Approved' ? 'Approved' : c.status === 'Executing' ? 'Executing' : 'Delivered';
    const d = dcOf(c.dcId);
    if (c.dimension === 'Space') {
      const h = roomiest(c.dcId, c.title);
      const racks = Math.max(1, Math.round(c.amount / 42));
      const kw = Math.max(2, Math.min(avgBudget(h?.id), Math.floor(itRoom(d) / racks)));
      out.push(mk({ scope: 'rack-expansion', name: c.title, dcId: c.dcId, hallId: h?.id, racks, kwPerRack: kw, redundancy: siteRed(d), tier: d.tier, cooling: kw > 30 ? 'Liquid-to-chip' : 'Air', target: c.target, owner: pp.planner }, st, 'Capacity plan', [c.id]));
    } else {
      out.push(mk({ scope: 'plant-upgrade', name: c.title, dcId: c.dcId, plant: c.dimension === 'Power' ? 'UPS' : 'Cooling', plantKw: c.amount, racks: 0, kwPerRack: 0, redundancy: siteRed(d), tier: d.tier, cooling: 'Air', target: c.target, owner: pp.planner }, st, 'Capacity plan', [c.id]));
    }
  }
  /* 2 · the planned site is being built */
  const planned = db.datacenters.find(d => d.status === 'planned');
  if (planned) out.push(mk({ scope: 'new-site', name: `Build ${planned.id} ${planned.city}`, dcId: planned.id, city: planned.city, racks: Math.max(planned.racks.length * 10, 60), kwPerRack: 12, redundancy: planned.tier === 'Tier IV' ? '2N' : 'N+1', tier: planned.tier, cooling: 'Air', target: db.now + 420 * DAY, owner: pp.head }, 'Executing', 'Build programme'));
  /* 3 · drafts where the estate is under pressure */
  const upsPct = (d: Datacenter) => { const s = siteNow(db, d); return s.upsUse / Math.max(1, s.upsUsable); };
  const tight = [...live].sort((a, b) => upsPct(b) - upsPct(a))[0];
  if (tight && !out.some(p => p.dcId === tight.id && p.scope === 'plant-upgrade')) {
    const s = siteNow(db, tight); const kw = Math.max(250, Math.ceil(Math.max(0, s.upsUse * 1.3 - s.upsUsable) / 250) * 250);
    out.push(mk({ scope: 'plant-upgrade', name: `Restore UPS headroom at ${tight.id}`, dcId: tight.id, plant: 'UPS', plantKw: kw, racks: 0, kwPerRack: 0, redundancy: siteRed(tight), tier: tight.tier, cooling: 'Air', target: db.now, owner: pp.planner }, 'Draft', 'Site pressure'));
  }
  const fill = (d: Datacenter) => d.racks.reduce((x, r) => x + r.usedU, 0) / Math.max(1, d.racks.reduce((x, r) => x + r.heightU, 0));
  const fullest = [...live].sort((a, b) => fill(b) - fill(a))[0];
  if (fullest) {
    const kw = Math.max(4, Math.round(fullest.racks.reduce((a, r) => a + r.budgetKw, 0) / fullest.racks.length));
    const racks = Math.max(4, Math.min(40, Math.floor(itRoom(fullest) / kw)));
    out.push(mk({ scope: 'new-hall', name: `New hall at ${fullest.id}`, dcId: fullest.id, racks, kwPerRack: kw, redundancy: siteRed(fullest), tier: fullest.tier, cooling: kw > 30 ? 'Liquid-to-chip' : 'Air', target: db.now, owner: pp.planner }, 'Draft', 'Site pressure'));
  }
  if (db.gpu?.cdus.length) {
    const cdu = db.gpu.cdus.reduce((m2, c) => (c.capacityKw - c.loadKw > m2.capacityKw - m2.loadKw ? c : m2));
    const d = dcOf(cdu.dcId), h = roomiest(cdu.dcId);
    const racks = Math.max(2, Math.min(6, h ? freePositions(db, h.id) : 6, Math.floor(itRoom(d) / 45)));
    out.push(mk({ scope: 'ai-pod', name: `GPU pod in ${h?.name ?? 'hall'} at ${cdu.dcId}`, dcId: cdu.dcId, hallId: h?.id, racks, kwPerRack: 45, redundancy: siteRed(d), tier: d.tier, cooling: 'Liquid-to-chip', target: db.now + 120 * DAY, owner: pp.planner }, 'In review', 'Site pressure', [], true));
  }
  /* 4 · two recent deliveries: the last racks added in the two biggest halls were a rack expansion handed over 1–3 months ago */
  const big = [...dm.halls].filter(h => h.racks >= 4 && db.datacenters.find(d => d.id === h.dcId)?.status === 'on-air').sort((a, b) => b.racks - a.racks).filter((h, i, all) => all.findIndex(x => x.dcId === h.dcId) === i).slice(0, 2);
  big.forEach((h, i) => {
    const d = dcOf(h.dcId); const rs = dm.racks.filter(r => r.hallId === h.id).slice(-Math.min(4, Math.floor(h.racks / 2)));
    const kw = Math.max(4, Math.round(rs.reduce((a, r) => a + r.budgetKw, 0) / rs.length));
    const x = mk({ scope: 'rack-expansion', name: `${rs.length} racks in ${h.name} at ${h.dcId}`, dcId: h.dcId, hallId: h.id, racks: rs.length, kwPerRack: kw, redundancy: siteRed(d), tier: d.tier, cooling: kw > 30 ? 'Liquid-to-chip' : 'Air', target: db.now - (30 + i * 45) * DAY, owner: pp.planner }, 'Delivered', 'Planner');
    x.createdRacks = rs.map(r => r.id);
    x.history.push({ at: x.target, who: pp.head, text: 'Handed over to operations (HOTO): plan delivered' });
    out.push(x);
  });
  /* 5 · a refresh of the network model closest to (or past) end of vendor support */
  const types = dm.types.filter(t => t.devices && t.category === 'network');
  const old = [...types].sort((a, b) => modelDates(a.model, db.now).endOfSupport - modelDates(b.model, db.now).endOfSupport)[0];
  if (old) {
    const site = [...live].sort((a, b) => dm.devices.filter(d => d.dcId === b.id && d.typeId === old.id).length - dm.devices.filter(d => d.dcId === a.id && d.typeId === old.id).length)[0];
    const to = types.filter(t => t.role === old.role && t.id !== old.id).sort((a, b) => modelDates(b.model, db.now).endOfSupport - modelDates(a.model, db.now).endOfSupport)[0];
    if (site && to) out.push(mk({ scope: 'refresh', name: `Replace ${old.model} at ${site.id}`, dcId: site.id, refreshTypeId: old.id, refreshToTypeId: to.id, racks: 0, kwPerRack: 0, redundancy: siteRed(site), tier: site.tier, cooling: 'Air', target: db.now, owner: pp.planner }, 'Draft', 'Site pressure'));
  }
  return out;
}

/* ------------------------------------------------------------------ site today */

export function siteNow(db: Db, dc: Datacenter) {
  const it = dc.power.split[0]?.kw ?? 0;
  const facility = dc.power.split.reduce((a, s) => a + s.kw, 0);
  const ups = dc.power.ups.filter(u => u.state !== 'Fault');
  const upsSum = ups.reduce((a, u) => a + u.capacityKw, 0), upsMax = Math.max(0, ...ups.map(u => u.capacityKw));
  const red = dc.power.ups[0]?.redundancy ?? 'N+1';
  const upsUsable = red === '2N' ? upsSum / 2 : red === 'N+1' ? upsSum - upsMax : upsSum;
  const upsUse = dc.power.ups.reduce((a, u) => a + (u.capacityKw * u.loadPct) / 100, 0);
  const genKw = dc.power.dg.kva * GEN_PF;
  const cu = dc.cooling.units.filter(u => u.type !== 'CDU' && u.status === 'Operational');
  const coolSum = cu.reduce((a, u) => a + u.capacityKw, 0), coolMax = Math.max(0, ...cu.map(u => u.capacityKw));
  const coolUsable = dc.cooling.redundancy === 'N+1' ? coolSum - coolMax : dc.cooling.redundancy === '2N' ? coolSum / 2 : coolSum;
  const cdus = db.gpu?.cdus.filter(c => c.dcId === dc.id) ?? [];
  return { it, facility, cap: dc.power.capacityKw, upsUsable, upsUse, upsRed: red, genKw, coolUsable, coolLoad: dc.cooling.loadKw, coolRed: dc.cooling.redundancy,
    cduFree: cdus.reduce((a, c) => a + Math.max(0, c.capacityKw - c.loadKw), 0), cdus: cdus.length, feeds: dc.power.feeds.filter(f => f.type === 'AC').length };
}
/* free rack positions in a hall on the twin's grid (rowCols racks per row) */
export function freePositions(db: Db, hallId: string) {
  const h = dcimModel(db).hallById.get(hallId); if (!h) return 0;
  /* halls are laid out for at least two row pairs; a partial pair is completed */
  const rows = Math.max(4, h.gridRows % 2 ? h.gridRows + 1 : h.gridRows);
  return Math.max(0, h.gridCols * rows - h.racks);
}

/* ------------------------------------------------------------------ evaluation */

export function evaluate(db: Db, p: PlanInput, now = db.now): PlanEval {
  const dc = db.datacenters.find(d => d.id === p.dcId);
  const dm = dcimModel(db);
  const scope = p.scope;
  const inSite = scope !== 'new-site' && !!dc && dc.status !== 'planned';
  /* the IT load the plan adds (design, worst case) */
  let itKw = (scope === 'plant-upgrade' ? 0 : p.racks * p.kwPerRack);
  let refreshNote = '';
  let refreshCount = 0;
  if (scope === 'refresh') {
    const from = dm.typeById.get(p.refreshTypeId ?? ''), to = dm.typeById.get(p.refreshToTypeId ?? '');
    refreshCount = dm.devices.filter(d => d.dcId === p.dcId && d.typeId === p.refreshTypeId).length;
    const dW = (to?.typicalW || (from?.typicalW ?? 0) * 1.3) - (from?.typicalW ?? 0);
    itKw = r1((refreshCount * dW) / 1000);
    refreshNote = `${refreshCount} × ${from?.model ?? '?'} → ${to?.model ?? 'newer model'} (${dW >= 0 ? '+' : ''}${r0(dW)} W each)`;
  }
  const liquid = LIQUID_SHARE[p.cooling];
  const liquidKw = r1(itKw * liquid), airKw = r1(itKw - liquidKw);
  const pueD = inSite && p.cooling === 'Air' ? dc!.power.pue : designPue(p.cooling);
  const facilityKw = r1(itKw * pueD);
  const site = dc ? siteNow(db, dc) : null;
  const checks: PlanCheck[] = [];
  const plant: PlanPlantLine[] = [];
  const add = (c: PlanCheck) => checks.push(c);
  const m = (n: number) => money(n);
  const tpl = templateOf(scope);
  const want = (k: string) => (k === 'cdu' && LIQUID_SHARE[p.cooling] > 0 && scope !== 'plant-upgrade' && scope !== 'refresh' && scope !== 'new-hall' ? true : scope === 'plant-upgrade' ? k === ({ UPS: 'ups', Cooling: 'cooling', Generator: 'generator' } as const)[p.plant ?? 'UPS'] : tpl.checks.includes(k));
  const hall = p.hallId ? dm.hallById.get(p.hallId) : undefined;

  /* ---- checks against what the site has (in-site scopes) */
  let upsAdd = 0, crahAdd = 0, cduAdd = 0, genAdd = 0;
  /* rack-level checks hold for every plan with racks, new buildings included */
  if (p.racks && p.kwPerRack) {
    add({ key: 'rack-power', label: 'Rack power per cabinet', need: p.kwPerRack, have: 86, unit: 'kW', ok: p.kwPerRack <= 86, basis: 'Largest rack feed in the catalogue: busway tap-off 3-ph 125 A (86 kW)', fix: 'Split the load over more racks' });
    if (p.kwPerRack > 15 || p.cooling !== 'Air') add({ key: 'density', label: 'Cooling method for the density', need: p.kwPerRack, have: p.cooling === 'Air' ? 30 : p.cooling === 'Rear-door' ? 50 : 120, unit: 'kW / rack', ok: p.kwPerRack <= (p.cooling === 'Air' ? 30 : p.cooling === 'Rear-door' ? 50 : 120), basis: 'Air ≈ 30 kW per rack with containment · rear-door ≈ 50 kW · liquid to chip ≈ 120 kW', fix: 'Choose a cooling method for this density or spread the load' });
  }
  if (inSite && site) {
    if (scope === 'plant-upgrade') {
      if (p.plant === 'UPS') site.upsUsable += p.plantKw ?? 0;
      if (p.plant === 'Cooling') site.coolUsable += p.plantKw ?? 0;
      if (p.plant === 'Generator') site.genKw += p.plantKw ?? 0;
    }
    if (want('positions') && hall) { const free = freePositions(db, hall.id); add({ key: 'positions', label: `Free rack positions in ${hall.name}`, need: p.racks, have: free, unit: 'racks', ok: free >= p.racks, basis: `${hall.gridCols} per row; a hall holds at least two row pairs, a partial pair is completed`, fix: free >= p.racks ? undefined : 'Not enough floor in this hall: pick another hall or plan a New hall' }); }
    if (want('site-power')) { const need = r1(site.facility + facilityKw), have = site.cap; add({ key: 'site-power', label: 'Utility intake (facility load)', need, have, unit: 'kW', ok: need <= have, basis: `Today ${r0(site.facility)} kW + ${r0(facilityKw)} kW added (IT × PUE ${pueD})`, fix: 'Raise the contracted intake with the utility (long lead) or phase the plan' }); }
    if (want('ups')) { const need = r1(site.upsUse + itKw), have = r1(site.upsUsable), ok = need <= have; if (!ok) upsAdd = need - have;
      add({ key: 'ups', label: `UPS at ${site.upsRed}`, need, have, unit: 'kW', ok, basis: `${site.upsRed === 'N+1' ? 'All modules but the largest' : site.upsRed === '2N' ? 'One side' : 'All modules'}${scope === 'plant-upgrade' && p.plant === 'UPS' ? ` incl. +${p.plantKw} kW planned` : ''}; today ${r0(site.upsUse)} kW`, fix: ok ? undefined : `Add ${Math.ceil(upsAdd / 250)} × 250 kW UPS module${Math.ceil(upsAdd / 250) > 1 ? 's' : ''}` }); }
    if (want('generator')) { const need = r1((site.facility + facilityKw) * 1.1), have = r1(site.genKw), ok = need <= have; if (!ok) genAdd = need - have;
      add({ key: 'generator', label: 'Generator (facility + 10%)', need, have, unit: 'kW', ok, basis: `DG ${dc!.power.dg.kva} kVA × ${GEN_PF}`, fix: ok ? undefined : `Add ${Math.ceil(genAdd / 2400)} × 3,000 kVA generator` }); }
    if (want('cooling')) { const need = r1(site.coolLoad + airKw * 1.05), have = r1(site.coolUsable), ok = need <= have; if (!ok) crahAdd = need - have;
      add({ key: 'cooling', label: `Air cooling at ${site.coolRed}`, need, have, unit: 'kW', ok, basis: `Running units${site.coolRed === 'N+1' ? ' less the largest' : ''}; today ${r0(site.coolLoad)} kW + ${r0(airKw)} kW of air heat`, fix: ok ? undefined : `Add ${Math.ceil(crahAdd / 250)} × 250 kW CRAH` }); }
    if (want('cdu') && liquidKw) { const have = r1(site.cduFree), ok = liquidKw <= have; if (!ok) cduAdd = liquidKw - have;
      add({ key: 'cdu', label: 'Liquid loop (CDU) headroom', need: liquidKw, have, unit: 'kW', ok, basis: site.cdus ? `${site.cdus} CDU${site.cdus > 1 ? 's' : ''} at the site, free capacity` : 'No CDU at this site yet', fix: ok ? undefined : `Add ${Math.ceil(cduAdd / 1000)} × 1,000 kW CDU + facility water` }); }
  }
  if (scope === 'new-hall' && site) {
    /* the hall's own plant is sized; the site must carry it (checks above), so size UPS + air units */
    upsAdd = itKw; crahAdd = airKw * 1.05; cduAdd = liquidKw;
  }

  /* ---- plant to add (sized at the plan's redundancy) */
  const redCount = (n: number, red: PlanInput['redundancy']) => (n <= 0 ? 0 : red === '2N' ? 2 * n : red === 'N+1' ? n + 1 : n);
  const line = (stage: string, units: number, unitSize: string, red: string, capacity: string, note: string, cost: number) => units > 0 && plant.push({ stage, units, unitSize, redundancy: red, capacity, note, cost: r0(cost) });
  if (scope === 'new-site') {
    const xf = Math.ceil(facilityKw / PF / 2500), gen = Math.ceil((facilityKw * 1.1) / 2400), mod = itKw > 1000 ? 500 : 250, ups = Math.ceil(itKw / mod);
    const crah = Math.ceil((airKw * 1.1) / 250), cdu = Math.ceil(liquidKw / 1000), ch = Math.ceil((itKw * 1.05) / 1500);
    line('Utility intake', 2, `${r1(facilityKw / 1000 / PF)} MVA`, p.tier === 'Tier II' ? 'single' : 'dual feed', `${r0(facilityKw)} kW facility`, p.tier === 'Tier II' ? 'Tier II: one feed accepted by design' : 'Two independent feeds', 0);
    line('Transformers', redCount(xf, p.redundancy), '2,500 kVA', p.redundancy, `${r0(xf * 2500 * PF)} kW per path`, `facility ${r0(facilityKw)} kW ÷ ${PF}`, redCount(xf, p.redundancy) * m(RATE.xfmr));
    line('Generators', redCount(gen, p.tier === 'Tier IV' ? '2N' : 'N+1'), '3,000 kVA', p.tier === 'Tier IV' ? '2N' : 'N+1', `${r0(gen * 2400)} kW`, `${p.tier === 'Tier II' ? '12' : '24'} h fuel on site`, redCount(gen, p.tier === 'Tier IV' ? '2N' : 'N+1') * m(RATE.gen));
    line('UPS modules', redCount(ups, p.redundancy), `${mod} kW`, p.redundancy, `${r0(ups * mod)} kW per path`, `IT ${r0(itKw)} kW`, redCount(ups, p.redundancy) * mod * m(RATE.upsKw));
    line('CRAH units', redCount(crah, 'N+1'), '250 kW', 'N+1', `${r0(crah * 250)} kW`, `air heat ${r0(airKw)} kW + 10%`, redCount(crah, 'N+1') * m(RATE.crah));
    line('CDUs', redCount(cdu, 'N+1'), '1,000 kW', 'N+1', `${r0(cdu * 1000)} kW`, `liquid heat ${r0(liquidKw)} kW`, redCount(cdu, 'N+1') * m(RATE.cdu));
    line('Chillers / dry coolers', redCount(ch, p.redundancy === '2N' ? 'N+1' : p.redundancy), '1,500 kW', p.redundancy === '2N' ? 'N+1' : p.redundancy, `${r0(ch * 1500)} kW`, 'IT + 5% losses', redCount(ch, p.redundancy === '2N' ? 'N+1' : p.redundancy) * m(RATE.chiller));
  } else {
    if (scope === 'plant-upgrade') {
      const kw = p.plantKw ?? 0;
      if (p.plant === 'UPS') line('UPS modules', Math.ceil(kw / 250), '250 kW', 'added to the site group', `+${kw} kW`, 'Hot-swap into the existing frames', kw * m(RATE.upsKw));
      if (p.plant === 'Cooling') line('CRAH units', Math.ceil(kw / 250), '250 kW', 'added', `+${kw} kW`, 'On the existing chilled-water loop', Math.ceil(kw / 250) * m(RATE.crah));
      if (p.plant === 'Generator') line('Generators', Math.ceil(kw / 2400), '3,000 kVA', 'added', `+${kw} kW`, 'Paralleled with the existing set', Math.ceil(kw / 2400) * m(RATE.gen));
    }
    if (upsAdd > 0) { const n = Math.ceil(upsAdd / 250) + (scope === 'new-hall' && p.redundancy !== 'N' ? (p.redundancy === '2N' ? Math.ceil(upsAdd / 250) : 1) : 0); line('UPS modules', n, '250 kW', scope === 'new-hall' ? p.redundancy : 'to restore headroom', `${n * 250} kW`, scope === 'new-hall' ? 'The hall\'s own A and B UPS' : 'The UPS check failed', n * 250 * m(RATE.upsKw)); }
    if (crahAdd > 0) { const n = Math.ceil(crahAdd / 250) + (scope === 'new-hall' ? 1 : 0); line('CRAH units', n, '250 kW', scope === 'new-hall' ? 'N+1' : 'to restore headroom', `${n * 250} kW`, scope === 'new-hall' ? 'The hall\'s air cooling' : 'The cooling check failed', n * m(RATE.crah)); }
    if (cduAdd > 0) { const n = Math.ceil(cduAdd / 1000) + 1; line('CDUs', n, '1,000 kW', 'N+1', `${n * 1000} kW`, 'Liquid loop for the new racks', n * m(RATE.cdu)); }
    if (genAdd > 0) { const n = Math.ceil(genAdd / 2400); line('Generators', n, '3,000 kVA', 'added', `${n * 2400} kW`, 'The generator check failed', n * m(RATE.gen)); }
  }

  /* ---- space */
  const perRack = p.cooling === 'Air' ? 2.6 : 3.2;
  const whiteM2 = r0(p.racks * perRack), grossM2 = scope === 'new-site' ? r0(whiteM2 * 1.6) : 0;
  const halls = scope === 'new-site' ? Math.max(1, Math.ceil(itKw / 2000)) : scope === 'new-hall' ? 1 : 0;
  const space = { racks: p.racks, rows: p.racks ? Math.ceil(p.racks / 10) : 0, whiteM2, grossM2, halls, freePositions: hall ? freePositions(db, hall.id) : undefined, hallName: hall ? `${hall.floor} · ${hall.name}` : undefined };

  /* ---- CapEx */
  const capex: PlanEval['capex'] = [];
  const cx = (line2: string, amount: number, basis: string) => amount > 0 && capex.push({ line: line2, amount: r0(amount), basis });
  if (scope === 'new-site') { cx('Building shell', grossM2 * m(RATE.shellM2), `${grossM2} m² × ${fmtMoney(m(RATE.shellM2))}`); cx('Electrical & mechanical fit-out', itKw * m(RATE.mep[p.tier]), `${r0(itKw)} kW × ${fmtMoney(m(RATE.mep[p.tier]))} (${p.tier})`); }
  if (scope === 'new-hall') cx('Hall fit-out (electrical & mechanical)', itKw * m(RATE.mep[p.tier]) * 0.85, `${r0(itKw)} kW × ${fmtMoney(m(RATE.mep[p.tier]))} × 0.85 (shell exists)`);
  if (p.racks && scope !== 'new-site') cx('Racks, PDUs, containment, cabling', p.racks * m(RATE.rack), `${p.racks} × ${fmtMoney(m(RATE.rack))}`);
  if (p.racks && liquid) cx('Liquid manifolds per rack', p.racks * m(RATE.liquidRack), `${p.racks} × ${fmtMoney(m(RATE.liquidRack))}`);
  for (const pl of plant) if (scope !== 'new-site' || pl.cost) cx(pl.stage, pl.cost, `${pl.units} × ${pl.unitSize}`);
  if (scope === 'refresh') {
    const to = dm.typeById.get(p.refreshToTypeId ?? '');
    cx('New equipment', refreshCount * m(RATE.device[to?.role ?? 'Switch']), `${refreshCount} × ${fmtMoney(m(RATE.device[to?.role ?? 'Switch']))} (${to?.role ?? 'device'} benchmark)`);
    cx('Migration and decommissioning', refreshCount * m(RATE.migrate), `${refreshCount} × ${fmtMoney(m(RATE.migrate))}`);
  }
  /* where the business model sells compute, the revenue needs the compute: GPU nodes (≈10 kW each) or servers (≈0.7 kW each) */
  const sellsCompute = (db.persona === 'cloud' || db.persona === 'neocloud' || db.persona === 'enterprise') && itKw > 0 && scope !== 'refresh' && scope !== 'plant-upgrade';
  if (sellsCompute) { const gpuK = scope === 'ai-pod' || p.kwPerRack >= 30; const units = Math.ceil(itKw / (gpuK ? 10 : 0.7)); cx(gpuK ? 'IT equipment (GPU nodes)' : 'IT equipment (servers)', units * m(RATE.device[gpuK ? 'GPU' : 'Server']), `${units} × ${fmtMoney(m(RATE.device[gpuK ? 'GPU' : 'Server']))} (${gpuK ? '≈10 kW per 8-GPU node' : '≈0.7 kW per server'})`); }
  const sub = capex.reduce((a, c) => a + c.amount, 0);
  cx('Contingency', sub * RATE.contingency, '10% of the lines above');
  const capexTotal = capex.reduce((a, c) => a + c.amount, 0);
  const facilityCapex = capexTotal - capex.filter(c => c.line === 'New equipment' || c.line.startsWith('IT equipment')).reduce((a, c) => a + c.amount * (1 + RATE.contingency), 0);

  /* ---- OpEx, revenue, cash flow (10 years) */
  const tariff = m(RATE.tariff);
  const rev: number = REVENUE_KW[db.persona];
  const gpuGrade = scope === 'ai-pod' || p.kwPerRack >= 30;
  const revKw = scope === 'refresh' || scope === 'plant-upgrade' ? 0 : gpuGrade && (db.persona === 'cloud' || db.persona === 'neocloud') ? REVENUE_GPU_KW[db.persona] : rev;
  const disc = HOT() ? 0.11 : 0.08;
  const cash: PlanEval['cash'] = [];
  let cum = 0, npv = 0;
  const flows: number[] = [];
  for (let y = 0; y <= 10; y++) {
    const u = y === 0 ? 0 : RAMP[y - 1];
    const cap = scope === 'new-site' ? (y === 0 ? capexTotal * 0.6 : y === 1 ? capexTotal * 0.4 : 0) : y === 0 ? capexTotal : 0;
    const energy = y === 0 ? 0 : itKw * u * pueAt(pueD, u) * 8760 * tariff;
    const opex = y === 0 ? 0 : energy + facilityCapex * RATE.maint;
    /* colocation bills metered power to its tenants at cost: the energy line is passed through */
    const revenue = y === 0 ? 0 : itKw * u * revKw * 12 + (db.persona === 'colocation' && revKw ? energy : 0);
    const net = revenue - opex - cap;
    cum += net; npv += net / (1 + disc) ** y; flows.push(net);
    cash.push({ year: y, capex: r0(cap), opex: r0(opex), revenue: r0(revenue), net: r0(net), cum: r0(cum) });
  }
  const irr = revKw ? irrOf(flows) : null;
  const payIdx = cash.findIndex(c => c.cum >= 0 && c.year > 0);
  const opexYear: PlanEval['opexYear'] = [
    { line: 'Energy (year 4, 85% load)', amount: r0(itKw * 0.85 * pueAt(pueD, 0.85) * 8760 * tariff), basis: `${r0(itKw * 0.85)} kW IT × PUE ${pueAt(pueD, 0.85)} × 8,760 h × ${currencySymbol()}${tariff.toFixed(2)}/kWh` },
    { line: 'Maintenance', amount: r0(facilityCapex * RATE.maint), basis: '2.5% of facility CapEx' }
  ].filter(x => x.amount > 0);

  /* ---- schedule */
  const longLead = (k: string) => ({ ups: 20, crah: 16, cdu: 20, gen: 36, xfmr: 40, chiller: 24 })[k] ?? 8;
  const T: [string, number, boolean?, boolean?][] = scope === 'new-site' ? [['Site, design and permits', 28], ['Shell construction', 44], ['Transformers (long lead, during the shell)', longLead('xfmr'), true, true], ['Generators (long lead, during the shell)', longLead('gen'), true, true], ['Electrical & mechanical fit-out', 26], ['Commissioning L1–L5', 10]]
    : scope === 'new-hall' ? [['Design and approvals', 10], ['UPS & CRAH (long lead)', Math.max(longLead('ups'), longLead('crah')), true], ['Hall fit-out', 20], ['Commissioning L1–L5', 6]]
    : scope === 'ai-pod' ? [['Design', 6], ['CDU & manifolds (long lead)', longLead('cdu'), true], ['Racks & busway', 8, true, true], ['Install & cable', 4], ['Commissioning L3–L5', 3]]
    : scope === 'plant-upgrade' ? [['Design & method statement', 4], [`${p.plant ?? 'Plant'} equipment (long lead)`, p.plant === 'Generator' ? longLead('gen') : p.plant === 'Cooling' ? longLead('crah') : longLead('ups'), true], ['Install in a change window', 2], ['Commissioning', 1]]
    : scope === 'refresh' ? [['Design & migration plan', 3], ['Order equipment', 10, true], ['Migrate (per maintenance window)', Math.max(2, Math.ceil(refreshCount / 4))], ['Decommission old units', 2]]
    : [['Design & approval', 4], ['Racks & PDUs (lead time)', 8, true], ['Install & cable', 3], ['Commissioning L3–L5', 2]];
  if (plant.length && scope !== 'new-site' && scope !== 'plant-upgrade' && scope !== 'new-hall') T.splice(1, 0, ['Plant additions (long lead)', Math.max(...plant.map(x => (x.stage.startsWith('UPS') ? longLead('ups') : x.stage.startsWith('CDU') ? longLead('cdu') : x.stage.startsWith('Gen') ? longLead('gen') : longLead('crah')))), true, true]);
  const tasks: PlanTask[] = [];
  const pl = p as Partial<PlannerPlan>;
  /* work in flight runs from its creation; a draft, a plan in review or one approved but not yet executing starts no earlier than today */
  let t0 = pl.created === undefined ? now : pl.status === 'Draft' || pl.status === 'In review' || pl.status === 'Approved' ? Math.max(now, pl.created) : pl.created;
  for (const [name, weeks, ll, par] of T) {
    const start = par && tasks.length ? tasks[tasks.length - 1].start : t0;
    const end = start + weeks * WEEK;
    tasks.push({ name, weeks, start, end, longLead: ll, parallel: par });
    t0 = Math.max(t0, end);
  }
  const finish = Math.max(...tasks.map(x => x.end));
  const lateDays = Math.max(0, r0((finish - p.target) / DAY));

  /* ---- findings */
  const findings: PlanFinding[] = [];
  for (const c of checks.filter(x => !x.ok)) findings.push({ severity: c.key === 'positions' || c.key === 'density' || c.key === 'site-power' ? 'critical' : 'major', title: `${c.label}: needs ${c.need} ${c.unit}, has ${c.have}`, detail: c.fix ?? c.basis });
  if ((scope === 'new-site' || scope === 'new-hall') && p.tier === 'Tier IV' && p.redundancy !== '2N') findings.push({ severity: 'major', title: 'Tier IV needs 2N distribution', detail: 'Fault tolerance requires two independent paths; N+1 meets Tier III only.' });
  if (inSite && site && site.feeds < 2 && (p.tier === 'Tier III' || p.tier === 'Tier IV') && scope !== 'refresh') findings.push({ severity: 'major', title: 'The site has a single utility feed', detail: `${p.dcId} has one AC feed, so it cannot meet ${p.tier} however the plan is built.` });
  if (lateDays > 0) findings.push({ severity: lateDays > 60 ? 'major' : 'minor', title: `Finishes ${Math.ceil(lateDays / 7)} week${lateDays > 7 ? 's' : ''} after the target date`, detail: `The longest item is "${[...tasks].sort((a, b) => b.weeks - a.weeks)[0].name}" (${[...tasks].sort((a, b) => b.weeks - a.weeks)[0].weeks} weeks). Order long-lead items at approval or move the target.` });
  if (inSite && dc && p.cooling === 'Air' && p.kwPerRack > 15 && p.kwPerRack <= 30) findings.push({ severity: 'minor', title: `${p.kwPerRack} kW racks need aisle containment`, detail: 'Above about 15 kW per rack, air cooling only works with hot- or cold-aisle containment.' });
  if (scope === 'refresh') findings.push({ severity: 'warning', title: refreshNote, detail: `The extra draw (${itKw} kW) is what the power and cooling checks carry.` });
  if (revKw && npv < 0) findings.push({ severity: 'minor', title: 'Negative NPV over ten years', detail: 'At the price book and ramp used, the plan does not pay back within ten years.' });
  const rank = { critical: 0, major: 1, minor: 2, warning: 3 } as const;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const crit = findings.filter(f => f.severity === 'critical').length, maj = findings.filter(f => f.severity === 'major').length;
  const verdict = crit ? { state: 'blocked' as const, text: `${crit} blocking check${crit > 1 ? 's' : ''}: ${findings[0].title}` }
    : maj ? { state: 'warn' as const, text: `Feasible with ${maj} item${maj > 1 ? 's' : ''} to resolve: ${findings[0].title}` }
    : { state: 'ready' as const, text: checks.length && inSite ? `Fits: all ${checks.length} checks pass against ${p.dcId}${plant.length ? `, with ${plant.length} plant line${plant.length > 1 ? 's' : ''} added` : ''}` : 'Sized: every stage at its redundancy, no rule broken' };

  return { itKw: r1(itKw), facilityKw, pue: pueD, liquidKw, airKw, checks, plant, space, capex, capexTotal, opexYear, cash, npv: r0(npv), irr, payback: payIdx >= 0 ? payIdx : null,
    revenueBasis: revKw ? `${fmtMoney(m(revKw))} per IT kW per month, utilisation ramp ${RAMP.slice(0, 4).map(x => `${x * 100}%`).join(' · ')}${db.persona === 'colocation' ? '; metered power re-billed to tenants at cost' : ''}` : scope === 'refresh' || scope === 'plant-upgrade' ? 'Cost only: the plan protects existing revenue' : 'Cost only: this business model does not sell capacity per kW',
    discount: disc, tasks, finish, lateDays, findings, verdict };
}

function irrOf(flows: number[]): number | null {
  const f = (r: number) => flows.reduce((a, v, i) => a + v / (1 + r) ** i, 0);
  let lo = -0.9, hi = 20;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return Math.round(((lo + hi) / 2) * 1000) / 10;
}

/* alternatives of the same plan: cooling and redundancy variants */
export function scenarios(db: Db, p: PlannerPlan): PlanScenarioRow[] {
  const vs: { id: string; name: string; note: string; patch: Partial<PlanInput> }[] = [{ id: 'base', name: 'As planned', note: `${p.cooling} · ${p.redundancy}`, patch: {} }];
  if (p.racks) {
    if (p.cooling !== 'Liquid-to-chip') vs.push({ id: 'liquid', name: 'Liquid to chip', note: 'lower PUE, CDUs and manifolds', patch: { cooling: 'Liquid-to-chip' } });
    if (p.cooling !== 'Air' && p.kwPerRack <= 30) vs.push({ id: 'air', name: 'Air cooled', note: 'no liquid loop; ≤ 30 kW per rack', patch: { cooling: 'Air' } });
    if (p.cooling !== 'Rear-door' && p.kwPerRack <= 50) vs.push({ id: 'rdhx', name: 'Rear-door heat exchangers', note: 'water at the rack door', patch: { cooling: 'Rear-door' } });
    vs.push({ id: 'dense', name: 'Half the racks, twice the density', note: `${Math.ceil(p.racks / 2)} × ${p.kwPerRack * 2} kW`, patch: { racks: Math.ceil(p.racks / 2), kwPerRack: p.kwPerRack * 2, cooling: p.kwPerRack * 2 > 30 ? 'Liquid-to-chip' : p.cooling } });
  }
  if (p.scope === 'new-site' || p.scope === 'new-hall') vs.push({ id: 'red', name: p.redundancy === '2N' ? 'N+1 distribution' : '2N distribution', note: p.redundancy === '2N' ? 'cheaper, Tier III at most' : 'fault tolerant', patch: { redundancy: p.redundancy === '2N' ? 'N+1' : '2N' } });
  return vs.map(v => {
    const e = evaluate(db, { ...p, ...v.patch });
    return { id: v.id, name: v.name, note: v.note, capex: e.capexTotal, pue: e.pue, opex: e.opexYear.reduce((a, x) => a + x.amount, 0), npv: e.npv, finish: e.finish, blocked: e.findings.filter(f => f.severity === 'critical').length, chosen: p.scenario === v.id };
  });
}
export const scenarioPatch = (p: PlannerPlan, id: string): Partial<PlanInput> => {
  if (id === 'liquid') return { cooling: 'Liquid-to-chip' };
  if (id === 'air') return { cooling: 'Air' };
  if (id === 'rdhx') return { cooling: 'Rear-door' };
  if (id === 'dense') return { racks: Math.ceil(p.racks / 2), kwPerRack: p.kwPerRack * 2, cooling: p.kwPerRack * 2 > 30 ? 'Liquid-to-chip' : p.cooling };
  if (id === 'red') return { redundancy: p.redundancy === '2N' ? 'N+1' : '2N' };
  return {};
};

/* ------------------------------------------------------------------ mutations */

export function createPlan(db: Db, x: PlanInput, who: string): PlannerPlan {
  const list = plans(db);
  if (!x.name.trim()) throw new Error('Give the plan a name');
  const tpl = templateOf(x.scope);
  if (tpl.needsSite && !db.datacenters.some(d => d.id === x.dcId)) throw new Error('Pick a datacenter');
  if ((x.scope === 'rack-expansion' || x.scope === 'ai-pod') && !x.hallId) throw new Error('Pick a hall');
  if (x.scope !== 'plant-upgrade' && x.scope !== 'refresh' && (x.racks < 1 || x.kwPerRack <= 0)) throw new Error('Racks and kW per rack must be above zero');
  const p: PlannerPlan = { ...x, id: nextId(), status: 'Draft', created: db.now, updated: db.now, approvals: [], history: [{ at: db.now, who, text: `Plan created (${tpl.name})` }], capacityPlanIds: [], createdRacks: [], scenario: 'base', source: 'Planner' };
  p.approvals = approvalChain(evaluate(db, p).capexTotal);
  list.unshift(p);
  return p;
}
export function updatePlan(db: Db, id: string, patch: Partial<PlanInput>, who: string) {
  const p = plans(db).find(x => x.id === id); if (!p) throw new Error('Unknown plan');
  if (p.status !== 'Draft') throw new Error('Only a draft can be edited; reject it back to draft first');
  Object.assign(p, patch); p.updated = db.now; p.history.push({ at: db.now, who, text: `Requirements edited (${Object.keys(patch).join(', ')})` });
  p.approvals = approvalChain(evaluate(db, p).capexTotal);
  return p;
}
export function chooseScenario(db: Db, id: string, scen: string, who: string) {
  const p = plans(db).find(x => x.id === id); if (!p) throw new Error('Unknown plan');
  if (p.status !== 'Draft') throw new Error('Choose a scenario while the plan is a draft');
  const patch = scenarioPatch(p, scen); if (!Object.keys(patch).length) return p;
  Object.assign(p, patch); p.scenario = 'base'; p.updated = db.now; p.history.push({ at: db.now, who, text: `Scenario adopted: ${scen} (${Object.entries(patch).map(([k, v]) => `${k} ${v}`).join(', ')})` });
  p.approvals = approvalChain(evaluate(db, p).capexTotal);
  return p;
}
export function submitPlan(db: Db, id: string, who: string) {
  const p = plans(db).find(x => x.id === id); if (!p) throw new Error('Unknown plan');
  if (p.status !== 'Draft') throw new Error('Only a draft can be submitted');
  const e = evaluate(db, p);
  if (e.verdict.state === 'blocked') throw new Error(`Blocked: ${e.verdict.text}. Fix the plan or choose a scenario first.`);
  p.status = 'In review'; p.updated = db.now; p.approvals = approvalChain(e.capexTotal); p.history.push({ at: db.now, who, text: `Submitted for approval (${fmtMoney(e.capexTotal)})` });
  return p;
}
export function decidePlan(db: Db, id: string, approve: boolean, who: string, comment: string) {
  const p = plans(db).find(x => x.id === id); if (!p) throw new Error('Unknown plan');
  if (p.status !== 'In review') throw new Error('The plan is not waiting for approval');
  const step = p.approvals.find(a => a.decision === 'Pending'); if (!step) throw new Error('No step waiting');
  step.decision = approve ? 'Approved' : 'Rejected'; step.at = db.now; step.comment = comment || undefined;
  p.history.push({ at: db.now, who, text: `${step.role} ${approve ? 'approved' : 'rejected'}${comment ? `: ${comment}` : ''}` });
  if (!approve) { p.status = 'Draft'; p.approvals = approvalChain(evaluate(db, p).capexTotal); p.history.push({ at: db.now, who, text: 'Back to draft' }); }
  else { const next = p.approvals.find(a => a.decision === 'Waiting'); if (next) next.decision = 'Pending'; else { p.status = 'Approved'; p.history.push({ at: db.now, who, text: 'Approved: ready to execute' }); } }
  p.updated = db.now;
  return p;
}
/* executing writes the capacity plans the plan delivers (and planned racks in DCIM); the caller adds them through the server */
export function executionLines(db: Db, p: PlannerPlan) {
  const e = evaluate(db, p);
  const lines: { dimension: 'Power' | 'Cooling' | 'Space'; amount: number; unit: string; title: string; capex: number }[] = [];
  const share = (n: number) => r0(e.capexTotal * n);
  if (p.scope === 'plant-upgrade') lines.push({ dimension: p.plant === 'Cooling' ? 'Cooling' : 'Power', amount: p.plantKw ?? 0, unit: 'kW', title: p.name, capex: e.capexTotal });
  else {
    const ups = e.plant.filter(x => x.stage.startsWith('UPS')).reduce((a, x) => a + x.units * 250, 0), cool = e.plant.filter(x => x.stage.startsWith('CRAH') || x.stage.startsWith('CDU')).reduce((a, x) => a + x.units * (x.stage.startsWith('CDU') ? 1000 : 250), 0);
    if (ups) lines.push({ dimension: 'Power', amount: ups, unit: 'kW', title: `${p.name}: UPS`, capex: share(0.35) });
    if (cool) lines.push({ dimension: 'Cooling', amount: cool, unit: 'kW', title: `${p.name}: cooling`, capex: share(0.25) });
    if (p.racks) lines.push({ dimension: 'Space', amount: p.racks * 42, unit: 'U', title: `${p.name}: ${p.racks} racks`, capex: share(ups || cool ? 0.4 : 1) });
  }
  return lines;
}
export const planOf = (db: Db, id: string) => plans(db).find(p => p.id === id) ?? null;
export const nowOf = (db: Db) => db.now;
export type { PlanTemplate };
