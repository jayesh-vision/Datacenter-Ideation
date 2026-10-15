/**
 * Plan outputs — what a plan turns into so it can be built.
 *
 *  - Bill of materials: every item the sizing implies, with quantity, unit cost, lead time and phase.
 *  - IP and network plan: allocated from IPAM (the site's container, or a fresh container for a new
 *    site from the private supernet), VLANs free at the site, private ASNs unique across plans.
 *  - Basis of design: the plan document, section by section, with the source of each figure.
 *  - Initiation pack: the delivery vehicle (programme, project or change), one project set per plan
 *    phase back-scheduled from that phase's go-live, budgets split by CapEx category, permits gating projects,
 *    long-lead orders, permits to file, design documents and the work order to start.
 *
 * All builders are pure: the Plan pack tab renders them, and approval (usePlannerActions.execute)
 * writes the same objects into procurement, IPAM, permits, design documents and delivery.
 */
import type * as T from '../p2b/types';
import type { AtpSystem, CxLevel, ProjectTemplate } from '../p2b/enums';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../p2b/dcTypes';
import { blueprintSpanWeeks, getBlueprint, type BlueprintPhase, type ProgramBlueprint } from '../p2b/delivery/programBlueprints';
import { Allocator, intToIp, overlapsInUse, parseCidr, type Range } from './ipam';
import type { PlannerData } from './plannerData';
import { CATALOGUE, kindOfModel, priceOf, type ItemKind } from './catalogue';
import { ASPECT_LABEL, SCOPE_LABEL, SOURCE_LABEL, fmtKw, fmtUsd, type Evaluation } from './engine';
import { modelFor } from './scopes';
import { MATERIAL_CHANGES_ITEM, applyOverrides, keyLines, priceContext, priceLine, type AppliedOverride } from './materials';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const num = (ev: Evaluation, k: string, d = 0) => { const v = ev.params[k]?.value; return typeof v === 'number' ? v : Number(v ?? d) || d; };

/* ================================================================== bill of materials */
export type BomCategory = 'Power' | 'Cooling' | 'Network' | 'Cabling' | 'Racks and containment' | 'Compute and storage' | 'Fire and security' | 'Monitoring';
export interface BomItem { id: string; kind: ItemKind; category: BomCategory; item: string; spec: string; qty: number; unit: string; unitCost: number; total: number; leadWeeks?: number; leadItem?: string; partNumber: string; manufacturer: string; /** Phase, wave or stage the line is needed for (purchase orders are raised per phase). */ phaseId?: string; needBy?: string; /** Site the line goes to (edge, portfolio, network ends). */ siteRef?: string; /** Service charges billed monthly (carrier circuits) rather than bought. */ monthly?: boolean; model?: string; /** Why the quantity differs from a standalone build (e.g. shared with the campus). */ note?: string;
  /* priced and edited lines (planner/lib/materials.ts) */
  /** Stable key (kind|item|phase|site) the planner's overrides are kept against. */ key?: string;
  /** Resolved to its catalogue model and priced (sourcing does not price it again). */ priced?: boolean;
  /** Vendor the line is bought from (the model's catalogue vendor, or the planner's choice). */ vendorName?: string;
  /** Preferred models skipped (end of life, inactive vendor). */ substituted?: string;
  /** Per-rack IT line priced in units: racks, rack kW and usable height (a model swap re-fits the units per rack). */ perRack?: { racks: number; rackKw: number; usableU: number; perRack: number };
  /** The planner's overrides as applied: vendor chosen (and its lead-time difference), source forced, what changed. */
  chosenVendor?: string; leadDelta?: number; /** Price-book unit cost before a channel's premium (what stock and site capacity avoid). */ listUnitCost?: number; forceSource?: T.PlannerMaterialSource; applied?: AppliedOverride }
/** `total` counts what is bought; monthly service charges (circuits) are summed in `monthlyTotal` and never added to CapEx. */
export interface Bom { lines: BomItem[]; total: number; byCategory: { category: BomCategory; total: number; lines: number }[]; capexCompared: number; coveragePct: number; monthlyTotal?: number;
  /** Overrides that no longer match a line, and notes on overrides that could not be applied as asked. */ materials?: { stale: T.PlannerMaterialOverride[]; warnings: string[] } }

export const REPLACE_SCOPES: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];
/** Item name → catalogue kind, so sourcing can match each line to a model, vendor and stock. */
const ITEM_KIND: Record<string, ItemKind> = {
  Transformer: 'transformer', 'Diesel generator': 'generator', 'UPS system': 'ups', 'Power distribution unit': 'pdu', 'Medium-voltage switchgear': 'switchgear', 'Utility connection': 'utility', 'Rack power strips': 'rack-pdu',
  'UPS per site': 'ups-small', 'Generator per site': 'generator-small', 'Cooling per site': 'cooling-small', 'Prefabricated enclosure': 'enclosure',
  'Computer room air handler': 'crah', 'Coolant distribution unit': 'cdu', 'In-row cooler': 'inrow', 'Rear-door heat exchanger': 'reardoor', Chiller: 'chiller', 'Secondary fluid network': 'sfn', 'Floor reinforcement': 'floor',
  Rack: 'rack', 'Aisle containment': 'containment', Cage: 'cage', 'Leaf switch': 'leaf', 'Spine switch': 'spine', 'Core router': 'core', Optics: 'optics', 'DCI line system': 'dci', 'Out-of-band switch': 'oob', 'Patch and cross-connects': 'patch',
  'Fibre trunk': 'fibre', 'Copper and DAC': 'dac', 'White space fit-out': 'fitout', 'Electrical installation': 'install', 'Mechanical installation': 'install', 'Installation and integration': 'install', 'Move services': 'move', 'Certified data disposal': 'disposal',
  'Suppression system': 'suppression', 'Very early smoke detection': 'vesda', 'Access control and CCTV': 'access', 'Building management and DCIM sensors': 'bms',
};

/** Unit costs are indicative list prices; the planner calibrates totals against the CapEx estimate. Lines are priced from the approved
 *  catalogue and carry the planner's overrides (materials.ts); `proposal` leaves the overrides out (the planner's own proposal). */
export function buildBom(plan: T.PlannerPlan, ev: Evaluation, benchmarks: T.PlannerBenchmark[], opts: { proposal?: boolean } = {}): Bom {
  const lines: BomItem[] = [];
  const lead = leadOf(benchmarks);
  // The plan type's family emits its own lines; when they are the whole bill, the generic lines are skipped.
  const model = modelFor(plan.scope);
  const own = model.bom ? model.bom(ev, l => {
    if (l.qty <= 0) return;
    const n = lines.length + 1;
    lines.push({ ...l, id: `B${n}`, qty: r0(l.qty), unitCost: r0(l.unitCost), total: r0(r0(l.qty) * l.unitCost), leadWeeks: l.leadWeeks ?? (l.leadItem ? lead(l.leadItem) : undefined), partNumber: l.partNumber ?? `${l.category.slice(0, 3).toUpperCase()}-${String(n).padStart(3, '0')}` });
  }) : false;
  if (!own) genericBomLines(plan, ev, benchmarks, lines);
  keyLines(lines);
  const pc = priceContext(plan, ev);
  const priced = lines.map(l => priceLine(plan, l, pc));
  if (opts.proposal || !plan.materialOverrides?.length) return finishBom(priced, ev);
  const o = applyOverrides(priced, plan.materialOverrides, { ...pc, lead });
  return { ...finishBom(o.lines, ev), materials: { stale: o.stale, warnings: o.warnings } };
}
/** Lead time in weeks for a lead-time benchmark name (the high end of the band, the conservative figure). */
const leadOf = (benchmarks: T.PlannerBenchmark[]) => (name: string) => { const b = benchmarks.find(x => x.metric === `leadWeeks:${name}`); return b ? r0(b.high ?? b.value ?? 0) : undefined; };

/**
 * The generic bill of materials for a plan, appended to `lines` (numbering continues). A family
 * that only changes some lines (an expansion sharing campus plant) starts from these.
 */
export function genericBomLines(plan: T.PlannerPlan, ev: Evaluation, benchmarks: T.PlannerBenchmark[], lines: BomItem[] = []): BomItem[] {
  const s = ev.sizing;
  const lead = leadOf(benchmarks);
  const add = (category: BomCategory, item: string, spec: string, qty: number, unit: string, unitCost: number, leadItem?: string, manufacturer = 'To tender', kind?: ItemKind) => {
    if (qty <= 0) return;
    lines.push({ id: `B${lines.length + 1}`, kind: kind ?? ITEM_KIND[item] ?? 'install', category, item, spec, qty: r0(qty), unit, unitCost: r0(unitCost), total: r0(qty * unitCost), leadItem, leadWeeks: leadItem ? lead(leadItem) : undefined, partNumber: `${category.slice(0, 3).toUpperCase()}-${String(lines.length + 1).padStart(3, '0')}`, manufacturer });
  };
  {
  const builds = plan.scope === 'new-dc' || plan.scope === 'expansion' || plan.scope === 'portfolio';
  const facility = s.itKw > 0 && plan.scope !== 'network' && plan.scope !== 'migration';

  const plantItems = String(ev.params['plantItems']?.value ?? 'Mixed');
  const wants = (kind: string) => plan.scope !== 'plant' || plantItems === 'Mixed' || plantItems.toLowerCase().startsWith(kind);

  // Edge: many small sites, each with its own small plant.
  if (plan.scope === 'edge') {
    const sites = Math.max(1, s.sites || s.halls); const perSiteKw = s.itKw / sites;
    add('Power', 'UPS per site', `${fmtKw(perSiteKw * 1.25)} modular`, sites, 'site', Math.max(15000, perSiteKw * 1.25 * 420), 'UPS (1 MW module)');
    add('Power', 'Generator per site', `${fmtKw(perSiteKw * 1.5)} with auto transfer`, sites, 'site', Math.max(30000, perSiteKw * 1.5 * 600), 'Generator (2.5 MVA)');
    add('Cooling', 'Cooling per site', `${s.cooling.type === 'air-crah' ? 'Direct expansion units' : 'Close-coupled units'}, N+1`, sites * 2, 'unit', Math.max(12000, perSiteKw * 350), 'CRAH / CDU');
    add('Racks and containment', 'Prefabricated enclosure', 'Weatherproof, fire rated', sites, 'site', 85000);
  }
  // Replacement plans: new equipment for the affected devices or racks, services and disposal.
  if (plan.scope === 'server-refresh' || plan.scope === 'network-refresh' || plan.scope === 'rack-replace') {
    const affected = num(ev, 'affectedCount', 0); const disposal = String(ev.params['oldEquipment']?.value ?? 'Certified disposal') === 'Certified disposal';
    if (plan.scope === 'rack-replace') {
      const racks = num(ev, 'affectedRacks', affected); const model = String(ev.params['rackModel']?.value ?? 'NetShelter SX 48U');
      add('Racks and containment', 'Rack', model, racks, 'each', priceOf(model) ?? 3800, 'Racks and containment', CATALOGUE.rack.options.find(o => o.model === model)?.manufacturer ?? 'APC', 'rack');
      if (ev.params['replacePdus']?.value !== false) add('Power', 'Rack power strips', 'Geist rPDU 3-phase, A and B feed', racks * 2, 'each', priceOf('Geist rPDU 3-phase') ?? 1400, 'PDU', 'Vertiv', 'rack-pdu');
      if (ev.params['reRack']?.value !== false) add('Racks and containment', 'Move services', 'De-rack and re-rack, per device', num(ev, 'affectedDevices', racks * 12), 'device', 150, undefined, 'NetBuild Corp', 'move');
      if (disposal) add('Fire and security', 'Certified data disposal', 'Old racks removed and recycled', racks, 'rack', 200, undefined, 'CBRE Data Center Solutions', 'disposal');
    } else {
      const model = String(ev.params['replacementModel']?.value ?? (plan.scope === 'server-refresh' ? 'PowerEdge R760' : '7050X3-48YC8'));
      const units = plan.scope === 'server-refresh' ? Math.ceil(affected / Math.max(1, num(ev, 'consolidationRatio', 2))) : affected;
      const kind = kindOfModel(model) ?? (plan.scope === 'server-refresh' ? 'server' : 'leaf');
      add(plan.scope === 'server-refresh' ? 'Compute and storage' : 'Network', CATALOGUE[kind].label, `${model}, replacing ${affected} old device${affected === 1 ? '' : 's'}`, units, 'each', priceOf(model) ?? 15000, plan.scope === 'server-refresh' ? (kind === 'gpu-server' ? 'GPU servers' : 'General servers') : 'Spine / leaf switches', CATALOGUE[kind].options.find(o => o.model === model)?.manufacturer ?? 'To tender', kind);
      if (plan.scope === 'network-refresh') add('Network', 'Optics', '400G transceivers not reused', Math.round(affected * 8 * (1 - num(ev, 'opticsReusePct', 60) / 100)), 'each', 1200, 'Optics (400G)', 'Corning', 'optics');
      add('Cabling', 'Copper and DAC', 'Rails, cables and labels', units, 'unit', 350, undefined, 'Corning', 'dac');
      add('Racks and containment', 'Move services', `${String(ev.params['migrationApproach']?.value ?? 'Rolling, rack by rack')}, per old device`, affected, 'device', plan.scope === 'server-refresh' ? 250 : 300, undefined, 'NetBuild Corp', 'move');
      if (disposal) add('Fire and security', 'Certified data disposal', 'Wipe or shred with certificate', affected, 'device', 120, undefined, 'CBRE Data Center Solutions', 'disposal');
    }
  }
  // Power
  if (facility && plan.scope !== 'rack' && plan.scope !== 'edge' && !REPLACE_SCOPES.includes(plan.scope)) {
    for (const p of s.plant) {
      if (p.kind === 'transformer' && (builds || plan.scope === 'plant') && wants('transformer')) add('Power', 'Transformer', p.name, p.count, 'each', 120000, 'Transformer (33 kV)');
      if (p.kind === 'generator' && (builds || plan.scope === 'plant') && wants('generator')) add('Power', 'Diesel generator', `${fmtKw(p.capacityKw)} prime, ${p.redundancy}`, p.count, 'each', 900000, 'Generator (2.5 MVA)');
      if (p.kind === 'ups' && wants('ups')) add('Power', 'UPS system', `${p.name}, ${fmtKw(p.capacityKw)}`, p.count, 'system', p.capacityKw * 350, 'UPS (1 MW module)');
      if (p.kind === 'pdu' && plan.scope !== 'plant') add('Power', 'Power distribution unit', `${p.name}, ${fmtKw(p.capacityKw)}`, p.count, 'each', 28000, 'PDU');
    }
    if (builds || (plan.scope === 'plant' && (plantItems === 'Mixed' || plantItems === 'Transformers'))) add('Power', 'Medium-voltage switchgear', 'A and B line-ups', Math.max(2, Math.ceil(s.itKw / 5000) * 2), 'line-up', 250000, 'Switchgear');
    if (builds) add('Power', 'Utility connection', `${fmtKw(s.itKw * 1.3)} capacity`, Math.ceil((s.itKw * 1.3) / 1000), 'MW', 150000);
    if (plan.scope !== 'plant') add('Power', 'Rack power strips', 'Two per rack, metered', s.racks * 2, 'each', 1200);
  }
  if (plan.scope === 'rack') add('Power', 'Rack power strips', 'Two per rack, metered, A and B feed', s.racks * 2, 'each', 1200, 'PDU');

  // Cooling
  if (facility && plan.scope !== 'rack' && plan.scope !== 'edge' && !REPLACE_SCOPES.includes(plan.scope) && (plan.scope !== 'plant' || wants('chiller') || plantItems === 'Mixed')) {
    const c = s.cooling;
    const unit = c.type === 'liquid-to-chip' || c.type === 'immersion' ? ['Coolant distribution unit', 350000] as const : c.type === 'in-row' ? ['In-row cooler', 25000] as const : c.type === 'rear-door' ? ['Rear-door heat exchanger', 18000] as const : ['Computer room air handler', 85000] as const;
    if (plan.scope !== 'plant') add('Cooling', unit[0], `${fmtKw(c.unitKw)} each, ${c.redundancy}`, c.units, 'each', unit[1], 'CRAH / CDU');
    if ((builds || plan.scope === 'plant') && c.type !== 'air-economiser') add('Cooling', 'Chiller', '1.5 MW, magnetic bearing', Math.ceil((s.itKw * 1.2) / 1500) + 1, 'each', 600000, 'Chiller');
    if (c.type === 'liquid-to-chip' || c.type === 'immersion') add('Cooling', 'Secondary fluid network', 'Manifolds, valves, leak detection', s.racks, 'rack', 6500);
    if (plan.scope === 'retrofit') add('Cooling', 'Floor reinforcement', 'For liquid-cooled racks', Number(ev.params['liquidRacks']?.value ?? s.racks), 'rack', 4000);
  }

  // Racks and containment
  if (s.racks > 0 && plan.scope !== 'network' && plan.scope !== 'plant' && plan.scope !== 'migration' && !REPLACE_SCOPES.includes(plan.scope)) {
    add('Racks and containment', 'Rack', `${num(ev, 'rackUnitsNeeded', 48) > 42 ? '48U' : '42U'}, 800 × 1200 mm`, s.racks, 'each', 3500, 'Racks and containment', 'APC / Vertiv / Rittal');
    if (plan.scope !== 'rack') add('Racks and containment', 'Aisle containment', 'Cold-aisle doors and roof', Math.ceil(s.racks / 20), 'row', 18000, 'Racks and containment');
    if (plan.scope === 'pod' && ev.params['cageRequired']?.value) add('Racks and containment', 'Cage', 'Mesh partition with badge door', 1, 'cage', 45000);
  }

  // Network
  // A rack plugs into the existing fabric (patching only); a pod brings its own leaves but uses the existing spines.
  const podOnly = plan.scope === 'pod';
  if ((s.network.leaves > 0 && !['migration', 'plant', 'rack', ...REPLACE_SCOPES].includes(plan.scope)) || plan.scope === 'network') {
    const fast = s.network.uplinkGbps >= 800;
    if (s.network.leaves) add('Network', 'Leaf switch', `${fast ? '800G' : '400G'} uplinks, 48 × 100G down`, s.network.leaves, 'each', fast ? 70000 : 40000, 'Spine / leaf switches');
    if (s.network.spines && !podOnly) add('Network', 'Spine switch', `64 × ${fast ? '800G' : '400G'}`, s.network.spines, 'each', fast ? 150000 : 90000, 'Spine / leaf switches');
    if (s.network.cores && builds) add('Network', 'Core router', 'Edge and DCI', s.network.cores, 'each', 250000, 'Spine / leaf switches');
    add('Network', 'Optics', `${fast ? '800G' : '400G'} transceivers`, podOnly ? s.network.uplinks * 2 : s.network.uplinks * 2 + s.network.cores * 8, 'each', fast ? 2500 : 1200, 'Optics (400G)');
    if (plan.scope === 'network') add('Network', 'DCI line system', `${s.network.dciGbps.toLocaleString('en-US')} Gbps over ${num(ev, 'diversePaths', 2)} diverse paths`, num(ev, 'diversePaths', 2), 'path', 420000, 'Optics (400G)');
    add('Network', 'Out-of-band switch', 'Management network', Math.max(1, Math.ceil(s.racks / 16)), 'each', 4500);
  }
  if (plan.scope === 'rack') add('Network', 'Patch and cross-connects', `${num(ev, 'portsPerRack', 4)} ports per rack`, s.racks * num(ev, 'portsPerRack', 4), 'port', 350);

  // Cabling
  if (s.network.leaves > 0 && !['migration', 'plant', 'network', 'rack', ...REPLACE_SCOPES].includes(plan.scope)) { add('Cabling', 'Fibre trunk', 'MPO-24, leaf to spine', s.network.leaves * 2, 'each', 1500, 'Fibre trunks'); add('Cabling', 'Copper and DAC', 'In-rack server cabling', s.racks, 'rack', 800); }

  // Compute and storage
  if (ev.params['operatorOwnedIt']?.value === true && s.racks > 0 && !['plant', 'network', 'migration', ...REPLACE_SCOPES].includes(plan.scope)) {
    const price: Record<string, number> = { GPU: 650000, Compute: 180000, Storage: 120000 };
    for (const c of s.rackClasses) add('Compute and storage', `${c.name} racks`, `${c.kw} kW per rack, fully populated`, c.racks, 'rack', price[c.name] ?? 180000, c.name === 'GPU' ? 'GPU servers' : 'General servers', c.name === 'GPU' ? 'NVIDIA partner' : 'To tender', c.name === 'GPU' ? 'gpu-server' : c.name === 'Storage' ? 'storage' : 'server');
  }

  // Fit-out and installation works where halls are built or fitted out.
  if (builds || plan.scope === 'hall') {
    add('Racks and containment', 'White space fit-out', 'Raised floor or slab, ceiling, lighting, containment supports', s.whiteSpaceM2, 'm²', 2500);
    add('Power', 'Electrical installation', 'Busbars, cabling, earthing, testing', Math.ceil(s.itKw), 'kW', 250);
    add('Cooling', 'Mechanical installation', 'Pipework, pumps, controls', Math.ceil(s.itKw), 'kW', 200);
  }
  if (plan.scope === 'plant') add('Power', 'Installation and integration', 'Cut-in under concurrent maintenance', 1, 'lot', Math.max(150000, s.itKw * 60));
  if (plan.scope === 'migration') {
    add('Racks and containment', 'Move services', 'De-rack, transport, re-rack, test', num(ev, 'racksToMove', s.racks), 'rack', 4500);
    if (ev.params['dataDisposal']?.value !== false) add('Fire and security', 'Certified data disposal', 'Wipe or shred with certificate', num(ev, 'racksToMove', s.racks), 'rack', 800);
  }

  // Fire and security, monitoring
  if (facility && s.halls > 0 && !['rack', 'pod', 'plant', ...REPLACE_SCOPES].includes(plan.scope)) {
    add('Fire and security', 'Suppression system', `${String(ev.params['suppressionType']?.value ?? 'Clean agent gas')}, one per hall`, s.halls, 'hall', 180000);
    add('Fire and security', 'Very early smoke detection', 'Aspirating, per hall', s.halls, 'hall', 40000);
    add('Fire and security', 'Access control and CCTV', `${num(ev, 'securityZones', 4)} zones`, Math.max(1, s.buildings) * num(ev, 'securityZones', 4), 'zone', 60000);
    add('Monitoring', 'Building management and DCIM sensors', 'Power, temperature, leak per hall', s.halls, 'hall', 50000);
  }
  }
  return lines;
}

/** Totals, category split and the comparison with the CapEx estimate. */
export function finishBom(lines: BomItem[], ev: Evaluation): Bom {
  const bought = lines.filter(l => !l.monthly);
  const total = bought.reduce((a, l) => a + l.total, 0);
  const monthlyTotal = lines.filter(l => l.monthly).reduce((a, l) => a + l.total, 0);
  const cats = [...new Set(bought.map(l => l.category))];
  const capexCompared = ev.estimate.capex.filter(l => !/Land and shell|Services and contingency/.test(l.item) && l.item !== MATERIAL_CHANGES_ITEM).reduce((a, l) => a + l.amount, 0);
  return { lines, total, monthlyTotal: monthlyTotal || undefined, byCategory: cats.map(c => ({ category: c, total: bought.filter(l => l.category === c).reduce((a, l) => a + l.total, 0), lines: bought.filter(l => l.category === c).length })).sort((a, b) => b.total - a.total), capexCompared, coveragePct: capexCompared ? r0((total / capexCompared) * 100) : 0 };
}

/* ================================================================== IP and network plan */
export interface IpItem { id: string; scope: string; purpose: 'Production' | 'Storage' | 'Management' | 'OOB' | 'Transit' | 'Loopback'; name: string; cidr: string; prefix: number; hosts: number; vlan?: number; gateway?: string; notes: string; /** Container subnet in IPAM the prefix is carved from (existing sites). */ parentSubnetId?: string }
export interface IpContainer { cidr: string; isNew: boolean; parentSubnetId?: string; cidrBlockId?: string; cidrBlockName?: string }
export interface IpPlan {
  aggregate: string; items: IpItem[]; vlans: { number: number; name: string; purpose: string; scope: string }[]; asns: { role: string; asn: string }[]; usedAddresses: number; totalAddresses: number;
  /** True until the platform data has loaded: nothing is allocated yet. */
  pending?: boolean;
  /** Where the prefixes come from: the site's container(s), or a new container for a new site. */
  containers?: IpContainer[];
  /** Allocation problems (container full, no container at the site…). */
  warnings?: string[];
}
/** One prefix the plan needs, before it is allocated. */
export interface IpRequest { scope: string; purpose: IpItem['purpose']; name: string; hosts: number; /** First VLAN number to try (the next free one at the site is used). */ vlanFrom?: number; notes: string }

const prefixFor = (hosts: number) => Math.max(20, Math.min(30, 32 - Math.ceil(Math.log2(Math.max(4, hosts + 3)))));
/** Plan types that build a site that does not exist yet: they need a new container from the private supernet. */
const NEW_SITE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'edge'];
const TERMINAL: T.PlannerPlanStatus[] = ['Rejected', 'Cancelled', 'Completed'];
const byCreated = (a: T.PlannerPlan, b: T.PlannerPlan) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
/**
 * Container size a new site needs, from the plan record alone (so every plan computes the same
 * slots for the others): about 120 addresses per rack (servers, storage, GPU fabric, management,
 * out of band, with alignment), at least a /16, at most a /14.
 */
export const containerPrefixFor = (p: Pick<T.PlannerPlan, 'designPowerKw' | 'params' | 'demand'>) => {
  const density = Math.max(1, Number(p.params?.densityKwPerRack ?? p.demand?.densityKwPerRack ?? 10) || 10);
  const addresses = Math.max(65536, Math.ceil(p.designPowerKw / density) * 120);
  return Math.max(14, Math.min(16, 32 - Math.ceil(Math.log2(addresses))));
};
/** A plan that will need a new site container and has not written its subnets yet. */
const needsNewContainer = (p: T.PlannerPlan) => !p.dataCenterId && NEW_SITE_SCOPES.includes(p.scope) && !TERMINAL.includes(p.status) && !(p.artefacts?.subnetIds?.length);

const CONTAINER_MEMO = new WeakMap<PlannerData, Map<string, { cidr?: string; block?: T.CIDRBlock; warnings: string[] }>>();
/**
 * The new container a site-building plan gets. Every open plan that builds a new site is given a
 * container in creation order, so two plans never get the same block before either is executed;
 * a draft that is not saved yet comes after all of them. Nothing is written to IPAM here.
 */
export function newSiteContainer(data: PlannerData, plan: T.PlannerPlan): { cidr?: string; block?: T.CIDRBlock; warnings: string[] } {
  const prefix = containerPrefixFor(plan);
  const key = `${plan.id}|${prefix}`;
  let memo = CONTAINER_MEMO.get(data); if (!memo) { memo = new Map(); CONTAINER_MEMO.set(data, memo); }
  const hit = memo.get(key); if (hit) return hit;
  const alloc = new Allocator(data);
  let out: { cidr?: string; block?: T.CIDRBlock } | undefined;
  for (const p of data.plannerPlans.filter(needsNewContainer).sort(byCreated)) {
    if (p.id === plan.id) { out = alloc.newContainer(prefix, plan.plnId); break; }
    alloc.newContainer(containerPrefixFor(p), p.plnId);
  }
  if (!out) out = alloc.newContainer(prefix, plan.plnId);
  const res = { ...out, warnings: [...alloc.warnings] };
  memo.set(key, res);
  return res;
}

/** RFC 6996 private 4-byte ASNs (4200000000 to 4294967294); each plan gets its own block of 1,000. */
const ASN_PRIVATE_BASE = 4_200_000_000;
const ASN_BLOCK = 1000;
/**
 * ASNs for a plan: a block per plan in creation order (so no two plans share a number) and no
 * number already registered in IPAM (`asns`, when the platform data carries it).
 */
export function allocateAsns(data: PlannerData, plan: T.PlannerPlan, roles: { role: string; count: number }[]): IpPlan['asns'] {
  const all = [...data.plannerPlans].sort(byCreated);
  const idx = all.findIndex(p => p.id === plan.id);
  const slot = idx >= 0 ? idx : all.length;
  const used = new Set(((data as unknown as { asns?: { asn: number }[] }).asns ?? []).map(a => a.asn));
  let next = ASN_PRIVATE_BASE + slot * ASN_BLOCK + 1;
  const take = () => { while (used.has(next)) next++; used.add(next); return next++; };
  return roles.filter(r => r.count > 0).map(r => {
    const first = take(); let last = first;
    for (let i = 1; i < r.count; i++) last = take();
    return { role: r.role, asn: r.count > 1 ? `${first} to ${last}` : `${first}` };
  });
}

/** What the generic plan needs: per-hall production, storage, GPU fabric, management and out-of-band, plus loopbacks, links and carrier hand-offs. */
export function ipRequests(plan: T.PlannerPlan, ev: Evaluation): IpRequest[] {
  const s = ev.sizing; const out: IpRequest[] = [];
  const site = plan.newSiteName || plan.title.split('·')[0].trim() || 'Site';
  const halls = Math.max(1, plan.scope === 'network' ? 0 : s.halls);
  const racksPerHall = Math.max(1, s.building.racksPerHall || Math.ceil(s.racks / Math.max(1, s.halls)));
  const gpuShare = plan.demand.gpuPct / 100, stoShare = plan.demand.storagePct / 100;
  if (plan.scope !== 'network') {
    for (let h = 1; h <= Math.min(halls, 40); h++) {
      const scope = s.halls > 1 ? `Hall ${h}` : plan.scope === 'rack' ? 'Rack' : plan.scope === 'pod' ? 'Pod' : 'Hall';
      const v = 100 + h * 10;
      out.push({ scope, purpose: 'Production', name: `${scope} servers`, hosts: racksPerHall * 40, vlanFrom: v, notes: `${racksPerHall} racks × about 40 hosts` });
      if (stoShare > 0) out.push({ scope, purpose: 'Storage', name: `${scope} storage`, hosts: Math.max(16, racksPerHall * 40 * stoShare * 2), vlanFrom: v + 1, notes: 'storage network' });
      if (gpuShare > 0.3) out.push({ scope, purpose: 'Production', name: `${scope} GPU fabric`, hosts: racksPerHall * 32, vlanFrom: v + 2, notes: 'RDMA, lossless' });
      out.push({ scope, purpose: 'Management', name: `${scope} management`, hosts: Math.max(30, racksPerHall * 4), vlanFrom: v + 5, notes: 'BMC, PDU and switch management' });
      out.push({ scope, purpose: 'OOB', name: `${scope} out of band`, hosts: Math.max(30, racksPerHall * 2), vlanFrom: 900 + h, notes: 'console servers' });
    }
  }
  const devices = s.network.leaves + s.network.spines + s.network.cores;
  if (devices) out.push({ scope: 'Site', purpose: 'Loopback', name: `${site} loopbacks`, hosts: devices + 8, notes: `${devices} switches and routers, one /32 each` });
  if (s.network.uplinks) out.push({ scope: 'Site', purpose: 'Transit', name: `${site} point-to-point links`, hosts: s.network.uplinks * 2 + s.network.cores * 8, notes: `${s.network.uplinks} leaf uplinks as /31 pairs` });
  const dciPaths = plan.scope === 'network' ? num(ev, 'diversePaths', 2) : s.network.carriers;
  for (let i = 1; i <= dciPaths; i++) out.push({ scope: 'Site', purpose: 'Transit', name: `${plan.scope === 'network' ? 'Interconnect path' : 'Carrier'} ${i}`, hosts: 2, vlanFrom: 3000 + i, notes: plan.scope === 'network' ? `${Math.round(s.network.dciGbps / Math.max(1, dciPaths))} Gbps` : 'internet and transit hand-off' });
  return out;
}

/**
 * Allocate a list of prefix requests from IPAM:
 *  - plan at an existing site: carved from the site's container subnets, clear of every subnet in use
 *    and of prefixes other open plans recorded in their IP allocation;
 *  - new site: one fresh container from the private supernet, shared by every prefix of the plan.
 * VLANs are the next numbers free at the site. Nothing is stored until execution.
 */
export function allocateIpPlan(plan: T.PlannerPlan, ev: Evaluation, requests: IpRequest[], asnRoles: { role: string; count: number }[]): IpPlan {
  const data = ev.ctx.data;
  const base = (r: IpRequest, i: number, cidr: string, prefix: number): IpItem => ({ id: `IP${i + 1}`, scope: r.scope, purpose: r.purpose, name: r.name, cidr, prefix, hosts: 2 ** (32 - prefix) - 3, notes: r.notes });
  if (!data || !data.ready) {
    const items = requests.map((r, i) => base(r, i, 'Allocated when platform data loads', prefixFor(r.hosts)));
    return { aggregate: 'Allocated when platform data loads', items, vlans: [], asns: [], usedAddresses: items.reduce((a, x) => a + 2 ** (32 - x.prefix), 0), totalAddresses: 0, pending: true, warnings: [] };
  }
  const alloc = new Allocator(data, { excludePlanId: plan.id });
  const warnings: string[] = [];
  const dcId = plan.dataCenterId;
  // Prefixes other open plans recorded at the same site are held for them.
  if (dcId) for (const p of data.plannerPlans) {
    if (p.id === plan.id || TERMINAL.includes(p.status) || p.artefacts?.subnetIds?.length) continue;
    for (const it of p.ipAllocation?.items ?? []) { if (it.dataCenterId !== dcId || it.reuse) continue; const r = parseCidr(it.cidr); if (r) alloc.carve(r, Number(it.cidr.split('/')[1]), `${p.plnId} ${it.name}`); }
  }
  const items: IpItem[] = []; const vlans: IpPlan['vlans'] = [];
  let containers: IpContainer[] = [];
  if (dcId) {
    containers = alloc.containers(dcId).map(c => ({ cidr: c.cidr, isNew: false, parentSubnetId: c.id, cidrBlockId: c.cidrBlockId }));
    requests.forEach((r, i) => {
      const prefix = prefixFor(r.hosts);
      const { cidr, parent } = alloc.atSite(dcId, prefix, r.name);
      items.push({ ...base(r, i, cidr ?? 'No free block', prefix), parentSubnetId: parent?.id });
    });
  } else {
    const c = newSiteContainer(data, plan);
    warnings.push(...c.warnings);
    const range = c.cidr ? parseCidr(c.cidr) : undefined;
    if (range) containers = [{ cidr: range.cidr, isNew: true, cidrBlockId: c.block?.id, cidrBlockName: c.block?.name }];
    // Carve in order of size (largest first) so the blocks stay aligned and the container is used densely.
    const order = requests.map((r, i) => ({ r, i, prefix: prefixFor(r.hosts) })).sort((a, b) => a.prefix - b.prefix || a.i - b.i);
    let cursor = range?.start ?? 0;
    const placed = new Map<number, string>();
    for (const o of order) {
      if (!range) { placed.set(o.i, 'No container'); continue; }
      const size = 2 ** (32 - o.prefix);
      cursor = Math.ceil(cursor / size) * size;
      let cidr: string | undefined;
      while (cursor + size - 1 <= range.end) {
        const cand: Range = { start: cursor, end: cursor + size - 1, cidr: `${intToIp(cursor)}/${o.prefix}` };
        cursor += size;
        if (overlapsInUse(data, cand.cidr, plan.id).length) continue;
        cidr = cand.cidr; break;
      }
      if (!cidr) warnings.push(`No free /${o.prefix} left in ${range.cidr} for ${o.r.name}`);
      placed.set(o.i, cidr ?? 'No free block');
    }
    requests.forEach((r, i) => items.push(base(r, i, placed.get(i)!, prefixFor(r.hosts))));
  }
  requests.forEach((r, i) => {
    const it = items[i];
    const start = parseCidr(it.cidr)?.start;
    if (start !== undefined && it.purpose !== 'Loopback' && it.purpose !== 'Transit') it.gateway = intToIp(start + 1);
    if (r.vlanFrom !== undefined) { const n = alloc.vlan(dcId, r.vlanFrom); it.vlan = n; vlans.push({ number: n, name: r.name, purpose: r.purpose, scope: r.scope }); }
  });
  warnings.push(...alloc.warnings);
  const total = containers.reduce((a, c) => { const r = parseCidr(c.cidr); return a + (r ? r.end - r.start + 1 : 0); }, 0);
  return {
    aggregate: containers.length ? containers.map(c => c.cidr).join(', ') : dcId ? 'No container subnet at the site' : 'No free container in the private supernet',
    items, vlans, asns: allocateAsns(data, plan, asnRoles), usedAddresses: items.reduce((a, x) => a + (parseCidr(x.cidr) ? 2 ** (32 - x.prefix) : 0), 0), totalAddresses: total, containers, warnings: [...new Set(warnings)],
  };
}

export function buildIpPlan(plan: T.PlannerPlan, ev: Evaluation): IpPlan {
  const s = ev.sizing;
  const generic = allocateIpPlan(plan, ev, ipRequests(plan, ev), [{ role: 'Spine layer', count: s.network.spines ? 1 : 0 }, { role: `Leaf pairs (${s.network.leaves / 2})`, count: s.network.leaves / 2 }, { role: 'Core and DCI', count: s.network.cores ? 1 : 0 }]);
  return modelFor(plan.scope).ipPlan?.(ev, generic) ?? generic;
}

/* ================================================================== basis of design */
export interface BodRow { label: string; value: string; source?: string }
export interface BodSection { id: string; title: string; text?: string; rows: BodRow[] }

export function buildBasisOfDesign(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, siteName: string): BodSection[] {
  const s = ev.sizing; const e = ev.estimate; const P = ev.params;
  const src = (k: string) => (P[k] ? SOURCE_LABEL[P[k].source] : undefined);
  const v = (k: string, unit = '') => { const x = P[k]?.value; return x === undefined ? '—' : `${typeof x === 'number' ? x.toLocaleString('en-US') : String(x)}${unit}`; };
  const profile = DC_TYPE_CATALOG.find(p => p.key === plan.dcTypeKey);
  const covered = new Set((template?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => a.aspect));
  const out: BodSection[] = [
    { id: 'purpose', title: '1. Purpose and demand', text: plan.intent || `${SCOPE_LABEL[plan.scope]} for ${siteName}.`, rows: [
      { label: 'Plan type', value: template?.name ?? SCOPE_LABEL[plan.scope] }, { label: 'Kind of site', value: profile?.name ?? plan.dcTypeKey },
      { label: 'IT capacity', value: fmtKw(s.itKw) }, { label: 'Workload mix', value: `${plan.demand.gpuPct}% GPU, ${plan.demand.computePct}% compute, ${plan.demand.storagePct}% storage` },
      { label: 'Growth', value: `${plan.demand.growthPctPerYear}% a year` }, { label: 'Needed by', value: new Date(plan.targetGoLive).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) } ] },
    { id: 'site', title: '2. Site and climate', rows: [{ label: 'Site', value: siteName }, { label: 'Climate', value: plan.climate }, { label: 'Utility intake', value: v('feedVoltage', ' V'), source: src('feedVoltage') }] },
    { id: 'resilience', title: '3. Tier and redundancy', rows: [{ label: 'Tier', value: v('tier'), source: src('tier') }, { label: 'Power', value: v('redundancy'), source: src('redundancy') }, { label: 'Cooling', value: v('coolingRedundancy'), source: src('coolingRedundancy') }, { label: 'UPS runtime', value: v('upsRuntimeMin', ' min'), source: src('upsRuntimeMin') }, { label: 'Fuel on site', value: v('generatorFuelHours', ' h'), source: src('generatorFuelHours') }] },
    { id: 'space', title: '4. Space and building', rows: [
      { label: 'Racks', value: `${s.racks.toLocaleString('en-US')} at ${v('densityKwPerRack', ' kW')}`, source: src('densityKwPerRack') }, { label: 'Data halls', value: `${s.halls} of ${fmtKw(num(ev, 'hallDesignKw', 0))}`, source: src('hallDesignKw') },
      { label: 'Buildings', value: `${s.buildings} × ${s.building.floorsPerBuilding} floors × ${s.building.hallsPerFloor} halls per floor` }, { label: 'White space', value: `${s.whiteSpaceM2.toLocaleString('en-US')} m²` },
      { label: 'Gross floor area', value: `${s.grossAreaM2.toLocaleString('en-US')} m²` }, { label: 'Floor loading', value: v('floorLoadingKgPerRack', ' kg per rack'), source: src('floorLoadingKgPerRack') } ] },
    { id: 'power', title: '5. Power chain', rows: s.plant.filter(p => p.kind !== 'cooling' && p.kind !== 'cdu').map(p => ({ label: p.name, value: `${p.count} × ${fmtKw(p.capacityKw)} (${p.redundancy})` })) },
    { id: 'cooling', title: '6. Cooling and environment', rows: [{ label: 'Cooling', value: v('coolingType'), source: src('coolingType') }, { label: 'Units', value: `${s.cooling.units} × ${fmtKw(s.cooling.unitKw)}` }, { label: 'Inlet setpoint', value: v('inletSetpointC', ' °C'), source: src('inletSetpointC') }, { label: 'PUE', value: String(s.pue.value), source: SOURCE_LABEL[s.pue.source] }] },
    { id: 'network', title: '7. Network', rows: [{ label: 'Fabric', value: `${s.network.leaves} leaf, ${s.network.spines} spine, ${s.network.cores} core` }, { label: 'Uplinks', value: `${s.network.uplinks} × ${s.network.uplinkGbps} Gbps, ${v('oversubscription', ':1')} oversubscription` }, { label: 'Carriers', value: String(s.network.carriers) }, { label: 'Interconnect', value: `${s.network.dciGbps.toLocaleString('en-US')} Gbps` }] },
    { id: 'firesec', title: '8. Fire, life safety and security', rows: [{ label: 'Suppression', value: v('suppressionType') }, { label: 'Security zones', value: v('securityZones') }] },
    { id: 'sustainability', title: '9. Sustainability', rows: [{ label: 'Energy', value: `${ev.sustainability.energyMwhYear.toLocaleString('en-US')} MWh a year` }, { label: 'Renewable share', value: v('renewableSharePct', '%') }, { label: 'Carbon', value: `${ev.sustainability.carbonTYear.toLocaleString('en-US')} t CO₂ a year` }, { label: 'Water', value: `${ev.sustainability.wue} L/kWh` }] },
    { id: 'operations', title: '10. Operations', rows: [{ label: 'Staff', value: `${s.staffing.fte} FTE, ${s.staffing.shifts} shifts` }, { label: 'Spares', value: fmtUsd(s.spares.valueUsd) }] },
    { id: 'schedule', title: '11. Phasing and schedule', rows: [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).map(p => ({ label: p.name, value: `${fmtKw(p.itKw)} live ${new Date(p.goLive).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` })) },
    { id: 'cost', title: '12. Cost', rows: [{ label: 'CapEx', value: `${fmtUsd(e.capexTotal)} (${fmtUsd(e.capexPerKw)} per kW plant)` }, { label: 'OpEx', value: `${fmtUsd(e.opexMonthly)} a month` }, { label: 'Payback', value: e.paybackMonths === null ? 'no positive margin' : `${e.paybackMonths} months` }] },
    { id: 'risks', title: '13. Risks and permits', rows: [...plan.risks.slice(0, 6).map(r => ({ label: r.title, value: `${r.probability} probability, ${r.impact} impact · ${r.owner}` })), ...plan.permits.map(p => ({ label: p.name, value: `${p.authority}, ${p.leadWeeks} weeks, ${p.status}` }))] },
    { id: 'standards', title: '14. Standards and checks', rows: ev.findings.filter(f => f.status !== 'n/a').map(f => ({ label: f.rule.title, value: `${f.status === 'pass' ? 'Pass' : f.status === 'fail' ? 'Fail' : 'Warning'} · ${f.detail}`, source: f.rule.standard })) },
  ];
  // Keep only sections the plan type covers, plus the always-on ones.
  const sectionAspects: Record<string, T.PlannerAspect[]> = { resilience: ['resilience', 'power'], space: ['space'], power: ['power'], cooling: ['cooling'], network: ['network'], firesec: ['fire', 'security'], sustainability: ['sustainability'], operations: ['operations'], schedule: ['schedule'], cost: ['finance'], risks: ['risk', 'compliance'] };
  const kept = out.filter(sec => !sectionAspects[sec.id] || sectionAspects[sec.id].some(a => covered.has(a))).filter(sec => sec.rows.length || sec.text);
  return modelFor(plan.scope).bod?.(ev, kept, template) ?? kept;
}
export const aspectsCovered = (t?: T.PlannerTemplate) => (t?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => ASPECT_LABEL[a.aspect]);

/* ================================================================== initiation pack */
export interface InitProject {
  name: string; start: string; end: string; budget: number; gate: string; longLead: boolean; template?: ProjectTemplate;
  /** Unique key in the initiation: `<phase id>:<blueprint key>`, or `shared:<key>` for projects that run once. */
  uid?: string; key?: string;
  /** Plan phase (or edge wave) the project delivers; shared projects carry the first phase. */
  planPhaseId?: string; phaseName?: string;
  /** Projects (uids) that must finish before this one starts. */
  dependsOn?: string[];
  shared?: boolean; commissioning?: boolean; perSite?: boolean;
  /** Back-scheduled from the phase go-live, the start is already in the past. */
  late?: boolean;
  /** How the budget was worked out. */
  budgetBasis?: string;
  /** Permits that must be approved before the project starts (names). */
  gatedBy?: string[];
}
/** A per-site work order (edge sites). */
export interface InitWorkOrder { name: string; siteRef?: string; planPhaseId?: string; start: string; end: string; process: string; key: string }
/** One acceptance test (ATP) the plan creates, with its steps from the checklist template. */
export interface InitAtp { uid: string; planPhaseId?: string; phaseName?: string; projectUid?: string; name: string; system: AtpSystem; level: CxLevel; siteRef?: string; steps: { description: string; method: string; expected: string }[]; template?: string }
/** A child plan a portfolio creates instead of building anything itself. */
export interface InitChildPlan { rowId: string; scope: T.PlannerScope; title: string; site: string; itKw: number; goLive: string; budget: number; note?: string }
/** Delivery template a single-project plan starts as. */
export const PROJECT_TEMPLATE_FOR: Partial<Record<T.PlannerScope, ProjectTemplate>> = { 'server-refresh': 'Rack Deployment', 'network-refresh': 'Network Refresh', 'rack-replace': 'Rack Deployment', hall: 'Hall Fit-out', retrofit: 'Hall Fit-out', pod: 'Rack Deployment', plant: 'MEP & Plant Installation', network: 'Network Refresh' };
export interface Initiation {
  vehicle: 'programme' | 'project' | 'change' | 'portfolio'; name: string; budget: number; blueprintKey?: string; blueprintName?: string;
  projects: InitProject[]; orders: { item: string; category: BomCategory | 'Mixed'; value: number; orderBy: string; needBy: string; late: boolean }[];
  permits: T.PlannerPermit[]; designDocs: { name: string; type: T.DesignDocument['type']; discipline: T.DesignDocument['discipline'] }[];
  workOrder: { process: string; key: string }; change?: { title: string; type: T.ChangeRequest['type'] };
  /** CapEx split by category before it is spread over the projects (IT has its own procurement project). */
  budgetSplit?: { category: string; amount: number; basis: string }[];
  /** Permit → project it gates, with the dates compared. */
  permitGates?: PermitGate[];
  workOrders?: InitWorkOrder[];
  atps?: InitAtp[];
  childPlans?: InitChildPlan[];
  notes?: string[];
}

/** Fallback when neither the plan template nor the site type names a blueprint. */
export function blueprintFor(plan: T.PlannerPlan): string {
  switch (plan.scope) {
    case 'new-dc': case 'portfolio': return plan.dcTypeKey === 'ai-gpu-factory' ? 'ai-gpu-factory' : plan.designPowerKw >= 20000 ? 'hyperscale-campus' : 'greenfield-dc';
    case 'expansion': return 'campus-expansion';
    case 'edge': return 'edge-wave';
    case 'migration': return plan.peerDataCenterId ? 'consolidation' : 'decommission';
    default: return 'modular-pod';
  }
}
/** The blueprint a plan delivers with: the plan template's, else the site type's (new sites build the way their type builds), else the fallback. */
export function resolveBlueprintKey(plan: T.PlannerPlan, template: T.PlannerTemplate | undefined): string {
  if (template?.blueprintKey && getBlueprint(template.blueprintKey)) return template.blueprintKey;
  const prof = plan.scope === 'new-dc' ? dcTypeProfile(plan.dcTypeKey)?.build.blueprintKey : undefined;
  if (prof && getBlueprint(prof)) return prof;
  return blueprintFor(plan);
}

/** Phases in go-live order; a plan without phases is one phase at the target date. */
export function planPhases(plan: T.PlannerPlan): T.PlannerPhase[] {
  const ph = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  return ph.length ? ph : [{ id: 'PH-1', name: 'Go-live', goLive: plan.targetGoLive, itKw: plan.designPowerKw, halls: 0, racks: 0, status: 'Planned' }];
}

/** CapEx by category from the estimate: facility works, IT equipment (bought separately) and land. */
export function capexSplit(ev: Evaluation): { facility: number; it: number; land: number; landLabel: string; landHasShell: boolean; lines: { category: string; amount: number; basis: string }[] } {
  let facility = 0, it = 0, land = 0; const landItems: string[] = [];
  for (const l of ev.estimate.capex) {
    if (/\bland\b/i.test(l.item)) { land += l.amount; landItems.push(l.item.replace(/\s*\(.*\)$/, '')); }
    else if (/^IT\b|IT and network|IT equipment|servers?\b|GPU/i.test(l.item)) it += l.amount;
    else facility += l.amount;
  }
  const lines = [
    { category: 'Facility works (plant, fit-out, network, services)', amount: r0(facility), basis: 'spread over the build projects by blueprint share and phase IT load' },
    ...(it ? [{ category: 'IT equipment', amount: r0(it), basis: 'its own procurement project per phase' }] : []),
    ...(land ? [{ category: landItems.join(', '), amount: r0(land), basis: landItems.some(x => /shell/i.test(x)) ? 'with the first shell or construction project' : 'with the first project (master plan or tie-in)' }] : []),
  ];
  return { facility, it, land, landLabel: landItems.join(', '), landHasShell: landItems.some(x => /shell/i.test(x)), lines };
}

const WEEK = 7 * 864e5;
/**
 * One project set per plan phase, back-scheduled from that phase's go-live with the blueprint's
 * durations × the site type's duration factor. Shared projects (master plan, grid, substation,
 * campus shell) run once, scheduled with the first phase. Facility CapEx is split by blueprint
 * share and by each phase's share of the IT load; IT gets its own procurement project per phase.
 */
export function phasedProjects(plan: T.PlannerPlan, ev: Evaluation, bp: ProgramBlueprint, now = clockMs()): InitProject[] {
  const factor = Math.max(0.05, dcTypeProfile(plan.dcTypeKey)?.build.durationFactor ?? 1);
  const phases = planPhases(plan);
  const totalKw = phases.reduce((a, p) => a + Math.max(0, p.itKw), 0) || 1;
  const split = capexSplit(ev);
  const span = blueprintSpanWeeks(bp);
  const shareSum = bp.phases.reduce((a, p) => a + p.budgetShare, 0) || 1;
  const uidOf = (ph: T.PlannerPhase, p: BlueprintPhase) => (p.shared ? `shared:${p.key}` : `${ph.id}:${p.key}`);
  const multi = phases.length > 1;
  const out: InitProject[] = [];
  let landPlaced = false;
  // Land (and shell, when the estimate carries them together) goes with the first construction project, else the first project.
  const landKey = split.landHasShell ? bp.phases.find(p => /shell|site-construction|civil|pad/.test(p.key))?.key : undefined;
  phases.forEach((ph, i) => {
    const goLive = new Date(ph.goLive).getTime();
    const t0 = goLive - span * factor * WEEK;
    const frac = Math.max(0, ph.itKw) / totalKw;
    for (const p of bp.phases) {
      if (p.shared && i > 0) continue;
      const start = t0 + p.startWeek * factor * WEEK; const end = t0 + (p.startWeek + p.durationWeeks) * factor * WEEK;
      const share = p.budgetShare / shareSum;
      const landHere = !landPlaced && split.land > 0 && (!landKey || p.key === landKey);
      if (landHere) landPlaced = true;
      const budget = split.facility * share * (p.shared ? 1 : frac) + (landHere ? split.land : 0);
      out.push({
        uid: uidOf(ph, p), key: p.key, planPhaseId: ph.id, phaseName: p.shared ? undefined : ph.name,
        name: multi && !p.shared ? `${plan.title} — ${ph.name} — ${p.name}` : `${plan.title} — ${p.name}`,
        start: new Date(start).toISOString(), end: new Date(end).toISOString(), budget: r0(budget), gate: p.gate, longLead: !!p.longLead, template: p.template,
        dependsOn: p.dependsOn.map(k => { const d = bp.phases.find(x => x.key === k); return d ? uidOf(ph, d) : ''; }).filter(Boolean),
        shared: !!p.shared, commissioning: !!p.commissioning, perSite: !!p.perSite, late: start < now,
        budgetBasis: `${r0(share * 100)}% of facility works${p.shared ? ' (runs once)' : multi ? ` × ${r0(frac * 100)}% of the IT load in this phase` : ''}${landHere ? ` plus ${split.landLabel.toLowerCase()}` : ''}`,
      });
    }
    if (split.it > 0) {
      const cx = bp.phases.find(p => p.commissioning);
      const cxStart = cx ? t0 + cx.startWeek * factor * WEEK : goLive - 12 * WEEK;
      // IT is ordered so it arrives for commissioning; the project runs from order to go-live.
      const start = cxStart - 16 * WEEK;
      out.push({
        uid: `${ph.id}:it-procurement`, key: 'it-procurement', planPhaseId: ph.id, phaseName: ph.name,
        name: multi ? `${plan.title} — ${ph.name} — IT procurement and installation` : `${plan.title} — IT procurement and installation`,
        start: new Date(start).toISOString(), end: new Date(goLive).toISOString(), budget: r0(split.it * frac), gate: 'Halls ready for racks', longLead: true, template: 'Rack Deployment',
        dependsOn: [], shared: false, commissioning: false, late: start < now, budgetBasis: `IT equipment × ${r0(frac * 100)}% of the IT load (bought separately from the facility works)`,
      });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ permits gating projects */
export interface PermitGate {
  permit: T.PlannerPermit; projectUid?: string; projectName?: string; projectStart?: string;
  /** Earliest date the permit can be decided. */
  decisionBy?: string; ok: boolean; reason: string;
}
/** When a permit can be decided: filing date + lead; without a filing date the full lead from today (conservative). */
export function permitDecision(pm: T.PlannerPermit, now = clockMs()): { at?: number; approved: boolean; expired: boolean; basis: string } {
  if (pm.status === 'Approved') return { approved: true, expired: false, basis: 'approved' };
  if (pm.status === 'Expired') return { approved: false, expired: true, basis: 'expired' };
  const lead = pm.leadWeeks * WEEK;
  if (pm.appliedAt) return { at: Math.max(now, new Date(pm.appliedAt).getTime() + lead), approved: false, expired: false, basis: `filed ${new Date(pm.appliedAt).toISOString().slice(0, 10)} + ${pm.leadWeeks} weeks` };
  return { at: now + lead, approved: false, expired: false, basis: pm.status === 'Not started' ? `if filed today, ${pm.leadWeeks} weeks` : `no filing date recorded, ${pm.leadWeeks} weeks counted from today` };
}
/** Blueprint project a permit gates: its own `gatesProjectKey`, else by the kind of permit. */
export function permitGateKey(pm: T.PlannerPermit, bp: ProgramBlueprint): string | undefined {
  const has = (k: string) => bp.phases.some(p => p.key === k);
  if (pm.gatesProjectKey && has(pm.gatesProjectKey)) return pm.gatesProjectKey;
  const first = (...ks: string[]) => ks.find(has);
  const n = pm.name.toLowerCase();
  if (/lease|landlord|access agreement|wayleave/.test(n)) return first('power-drop', 'lease', 'pad', 'civil', 'site-construction', 'shell');
  if (/planning|zoning|building/.test(n)) return first('site-construction', 'az-shells', 'shell', 'pad', 'civil', 'install');
  if (/grid|utility|uprate|interconnect|dno|connection/.test(n)) return first('substation', 'power-drop', 'mep', 'liquid-plant', 'mep-plant', 'pad', 'dc-plant');
  if (/environment|emission|noise|water|generator/.test(n)) return first('mep-plant', 'liquid-plant', 'mep', 'install', 'pod-procure', 'dc-plant');
  if (/fire|electrical|sign-off|occupation|occupancy/.test(n)) return bp.phases.find(p => p.commissioning)?.key;
  return undefined;
}
/** Each permit against the start of the project it gates. A permit decided after that start fails. */
export function permitGates(plan: T.PlannerPlan, projects: InitProject[], bp: ProgramBlueprint | undefined, now = clockMs()): PermitGate[] {
  if (!bp) return [];
  const phases = planPhases(plan);
  return plan.permits.map(pm => {
    const key = permitGateKey(pm, bp);
    const d = permitDecision(pm, now);
    const decisionBy = d.at ? new Date(d.at).toISOString() : undefined;
    if (!key) return { permit: pm, decisionBy, ok: !d.expired, reason: d.expired ? 'Expired and not linked to a project' : 'Not linked to a project (name it with the project it gates)' };
    const site = pm.siteRef ? plan.sites?.find(s => s.id === pm.siteRef) : undefined;
    const phaseId = pm.gatesPhaseId ?? (site?.wave ? phases[site.wave - 1]?.id : undefined) ?? phases[0]?.id;
    const proj = projects.find(p => p.uid === `${phaseId}:${key}`) ?? projects.find(p => p.uid === `shared:${key}`) ?? projects.find(p => p.key === key);
    if (!proj) return { permit: pm, decisionBy, ok: !d.expired, reason: `No ${key} project in the programme` };
    const start = new Date(proj.start).getTime();
    if (d.approved) return { permit: pm, projectUid: proj.uid, projectName: proj.name, projectStart: proj.start, ok: true, reason: 'Approved' };
    if (d.expired) return { permit: pm, projectUid: proj.uid, projectName: proj.name, projectStart: proj.start, ok: false, reason: 'Expired: file again' };
    const ok = (d.at ?? 0) <= start;
    return { permit: pm, projectUid: proj.uid, projectName: proj.name, projectStart: proj.start, decisionBy, ok, reason: ok ? `Decided by ${decisionBy!.slice(0, 10)} (${d.basis}), before the project starts` : `Decided ${decisionBy!.slice(0, 10)} at the earliest (${d.basis}), after the project starts ${proj.start.slice(0, 10)}` };
  });
}

export function buildInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom): Initiation {
  const generic = genericInitiation(plan, ev, template, bom);
  return modelFor(plan.scope).initiation?.(ev, template, bom, generic) ?? generic;
}
function genericInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom): Initiation {
  const vehicle = (template?.executesAs ?? 'project') as Initiation['vehicle'];
  const budget = ev.estimate.capexTotal;
  const start = clockMs();
  if (vehicle === 'project') {
    // One project from the matching delivery template, running from now to the go-live date.
    const tpl = PROJECT_TEMPLATE_FOR[plan.scope] ?? 'Capacity Expansion';
    return { ...baseInitiation(plan, ev, template, bom, vehicle, budget), projects: [{ uid: 'project', name: plan.title, start: new Date(start).toISOString(), end: plan.targetGoLive, budget, gate: 'Plan approved', longLead: false, template: tpl, planPhaseId: planPhases(plan)[0]?.id }], blueprintKey: undefined, blueprintName: `${tpl} (delivery template)` };
  }
  if (vehicle === 'change' || vehicle === 'portfolio') return baseInitiation(plan, ev, template, bom, vehicle, budget);
  const key = resolveBlueprintKey(plan, template); const bp = getBlueprint(key);
  const projects = bp ? phasedProjects(plan, ev, bp, start) : [];
  const gates = permitGates(plan, projects, bp, start);
  for (const g of gates) { const p = projects.find(x => x.uid === g.projectUid); if (p) p.gatedBy = [...(p.gatedBy ?? []), g.permit.name]; }
  const notes: string[] = [];
  const late = projects.filter(p => p.late);
  if (late.length) notes.push(`${late.length} project${late.length === 1 ? '' : 's'} would have had to start already to meet the phase dates on blueprint durations: compress, add resources or move the phase.`);
  return { ...baseInitiation(plan, ev, template, bom, vehicle, budget), blueprintKey: bp?.key, blueprintName: bp?.name, projects, budgetSplit: capexSplit(ev).lines, permitGates: gates, notes };
}

function baseInitiation(plan: T.PlannerPlan, ev: Evaluation, template: T.PlannerTemplate | undefined, bom: Bom, vehicle: Initiation['vehicle'], budget: number): Initiation {
  const orders = ev.schedule.filter(x => x.kind === 'equipment').map(x => {
    const related = bom.lines.filter(l => !l.monthly && l.leadItem && (!x.phaseId || !l.phaseId || l.phaseId === x.phaseId) && (x.item.toLowerCase().includes(l.leadItem.split(' ')[0].toLowerCase()) || l.leadItem.toLowerCase().includes(x.item.split(' ')[0].toLowerCase())));
    return { item: x.item, category: (related[0]?.category ?? 'Mixed') as BomCategory | 'Mixed', value: related.reduce((a, l) => a + l.total, 0), orderBy: x.orderBy, needBy: x.needBy, late: x.late };
  }).filter(o => o.value > 0);
  const docs: Initiation['designDocs'] = [{ name: 'Basis of design', type: 'Concept Design', discipline: 'Architectural' }];
  const covered = new Set((template?.requiredAspects ?? []).filter(a => a.depth !== 'skipped').map(a => a.aspect));
  if (REPLACE_SCOPES.includes(plan.scope)) {
    docs.push({ name: plan.scope === 'rack-replace' ? 'Rack swap list' : 'Old-to-new device list', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Architectural' }, { name: 'Cut-over runbook', type: 'Detailed Design', discipline: plan.scope === 'network-refresh' ? 'Network' : 'Electrical' });
    covered.clear();
  }
  if (covered.has('power')) docs.push({ name: 'Electrical single-line diagram', type: 'Schematic Design', discipline: 'Electrical' });
  if (covered.has('cooling')) docs.push({ name: 'Mechanical cooling schematic', type: 'Schematic Design', discipline: 'Mechanical' });
  if (covered.has('space')) docs.push({ name: plan.scope === 'new-dc' || plan.scope === 'expansion' ? 'Building and floor plan' : 'Hall layout', type: 'Schematic Design', discipline: 'Architectural' });
  if (covered.has('network')) docs.push({ name: 'Network and IP plan', type: 'Detailed Design', discipline: 'Network' });
  if (covered.has('commissioning')) docs.push({ name: 'Commissioning and acceptance test plan', type: 'Detailed Design', discipline: 'Electrical' });
  const process = vehicle === 'change' ? { process: 'P05 Change', key: 'change' } : REPLACE_SCOPES.includes(plan.scope) ? { process: 'P10 Work order', key: 'work-order' } : plan.scope === 'hall' ? { process: 'P02 Hall fit-out', key: 'hall-fitout' } : { process: 'P06 Capacity expansion', key: 'capacity-expansion' };
  return {
    vehicle, name: plan.title, budget, projects: [], orders, permits: plan.permits, designDocs: docs, workOrder: process,
    change: vehicle === 'change' ? { title: `${plan.title}`, type: plan.scope === 'rack' ? 'RackDeploy' : 'PowerUpgrade' } : undefined,
  };
}

/* ================================================================== export helpers */
export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map(r => r.map(c => { const s = c === undefined ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
export const bomCsv = (bom: Bom) => toCsv([['Line', 'Category', 'Item', 'Specification', 'Quantity', 'Unit', 'Unit cost USD', 'Total USD', 'Lead weeks', 'Part number', 'Manufacturer'], ...bom.lines.map((l, i) => [i + 1, l.category, l.item, l.spec, l.qty, l.unit, l.unitCost, l.total, l.leadWeeks, l.partNumber, l.manufacturer])]);
export const ipCsv = (ip: IpPlan) => toCsv([['Scope', 'Purpose', 'Name', 'CIDR', 'Usable hosts', 'VLAN', 'Gateway', 'Notes'], ...ip.items.map(i => [i.scope, i.purpose, i.name, i.cidr, i.hosts, i.vlan, i.gateway, i.notes])]);
