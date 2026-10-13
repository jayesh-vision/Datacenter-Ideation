/**
 * In-site analysis — what a rack, pod, hall or retrofit plan needs from the live site, what it
 * checks, and what it buys. One result per evaluation (memoised on the evaluation context), read
 * by every hook of the in-site scope model: sizing, the estimate (the bill plus contingency), the
 * schedule, the rule checks, the bill of materials, the IP plan, the wizard panels and execution.
 *
 * Every figure comes from a platform record, a plan input or a named benchmark (unit prices are
 * benchmarks `unitCost:*` in the planner seed, or catalogue prices). A check that cannot be made
 * says so ("not checked"), and checks that read a typed input say "declared".
 */
import type * as T from '../p2b/types';
import type { BomCategory, IpItem, IpPlan } from './outputs';
import type { CheckResult, ScopeBlocker, ScopeCtx } from './scopes/types';
import type { ParamValue, Sourced } from './engine';
import { CATALOGUE, priceOf, type ItemKind } from './catalogue';
import { byId, groupBy, type PlannerData } from './plannerData';
import type { SiteBaseline, ZoneBaseline, HallBaseline } from './site';
import { Allocator, prefixForHosts } from './ipam';
import { clashes, impactOf, nextFreeWindow, type Clash } from './impact';
import {
  acFeedKw, addressesFromHall, equipmentTotals, feedConfig, hallGrid, hallPduSides, itPerRack, pickPorts, podOptions, rackCandidates, checkRack, rackOutlets, retrofitRows, spinePorts, swingPositions, perimeterM,
  type AddressPick, type EquipmentTotals, type HallGrid, type PodOption, type PodPosition, type PortPick, type RackCandidate, type RetrofitRow, type ItRack, type RackClassName, RACK_BLOCK_PCT, RACK_WARN_PCT, POSITION_W_M,
} from './placement';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const kwFmt = (n: number) => (Math.abs(n) >= 1000 ? `${r1(n / 1000)} MW` : `${r1(n)} kW`);
export type InSiteType = 'rack' | 'pod' | 'hall' | 'retrofit';
export const IN_SITE_TYPES: InSiteType[] = ['rack', 'pod', 'hall', 'retrofit'];

/* ================================================================== bill lines */
export interface InSiteLine { category: BomCategory; item: string; spec: string; qty: number; unit: string; unitCost: number; kind: ItemKind; leadItem?: string; manufacturer: string; model?: string; phaseId?: string; it?: boolean; priceSource: string }
/** A unit price: a catalogue model when listed, else the planner benchmark `unitCost:<key>`. */
interface Price { value: number; source: string }

/* ================================================================== results */
export interface Shortfall { kw: number; what: string; plantIntent: string; plantTitle: string; expansion?: boolean }
export interface RackAccepted { cand: RackCandidate; startU?: number; endU?: number; outlets: { id: string; name: string; side: 'A' | 'B' }[]; ports: PortPick[]; portNote: string; portShort: number; prod: AddressPick; mgmt: AddressPick }
export interface RackResult {
  mode: 'existing-rack' | 'new-cabinet'; count: number; equipment?: EquipmentTotals;
  perRack: { kw: number; drawKw: number; u: number; kg: number; psus: number; ports: number; hosts: number; mgmt: number; declared: string[] };
  feed: ReturnType<typeof feedConfig>; portSpeedMbps: number;
  candidates: RackCandidate[]; accepted: RackAccepted[]; missing: number;
  window?: { start: string; end: string; clashes: Clash[]; beforeGoLive: boolean }; backout: string;
}
export interface FeedRow { position: PodPosition; label: string; pduA?: string; pduB?: string; amps: number; feedsPerSide: number; kw: number }
export interface PodResult {
  count: number; kwPerRack: number; layout: 'Auto' | 'One row' | 'Facing pair'; power: string; cooling: string;
  options: PodOption[]; bestRun: number; freePositions: number; chosen?: PodOption; chosenProblems: string[]; positionsNeeded: number;
  feed: ReturnType<typeof feedConfig>; feedSchedule: FeedRow[]; pduShortKw: { A: number; B: number }; newPdus: number; buswayM: number; tapOffs: number;
  leaves: number; uplinks: number; spine: { spines: number; free: number; need: number };
  containment: { aisles: number; type: string; mismatch?: string }; cage?: { perimeterM: number; doors: number; readers: number; cameras: number };
  inRow?: { units: number; unitKw: number; positions: number };
  classes: { cls: RackClassName; racks: number; it: ItRack }[];
  cutIns: { pdu: T.PDU; side: 'A' | 'B'; circuits: number; kw: number }[];
}
export interface HallResult {
  mode: 'shell' | 'partly-used' | 'new-hall'; hall?: T.Hall; hb?: HallBaseline; floor?: T.Floor; grid?: HallGrid;
  positionsAvail: number; racks: number; kw: number; designKw: number; designLeftKw: number;
  classes: T.PlannerRackClass[]; classesFrom: 'plan' | 'mix'; classKw: number;
  zone?: ZoneBaseline; zoneSharedWith: string[]; airKw: number; liquidKw: number; residualAirKw: number;
  crah: { units: number; unitKw: number; coversKw: number }; cdus: number;
  positions: PodPosition[]; newRows: number[]; whiteSpaceM2: number; floorFreeM2?: number;
  pduPerSide: number; existingPduHeadroom: { A: number; B: number };
  leaves: number; uplinks: number; newSpines: number; spine: { spines: number; free: number; need: number };
  phases: { phase: T.PlannerPhase; racks: number; kw: number; share: number }[];
}
export interface CduPlan { type: 'In-rack' | 'In-row' | 'Facility'; unitKw: number; loops: { name: string; rowId?: string; kw: number; units: number; positionsNeeded: number; positionsFree?: number }[]; units: number; positions: number }
export interface RetrofitResult {
  hall?: T.Hall; rows: RetrofitRow[]; todayKw: number; targetKw: number; deltaKw: number; capturePct: number; coolingType: string;
  liquidKw: number; zones: { zone: ZoneBaseline; residualKw: number; airRacksLeft: number }[];
  facilityWater: { needKw: number; headroomKw: number; chillers: number };
  cdu: CduPlan; uprate: { circuitsPerSide: number; deltaKw: number; pdu: { A: number; B: number }; freeCircuits: { A: number; B: number } };
  gpuServers: number; backend?: { servers: number; ports: number; leaves: number; spines: number; optics: number };
  waves: T.PlannerWave[]; wavesProposed: boolean; swing: T.Rack[]; drainRacks: number;
  reinforce: number; kits: number; newCabinets: number; ready: number;
  services: number; customers: number; critical: number; revenueMonthly: number;
}
export interface InSiteAnalysis {
  type: InSiteType; ready: boolean; site?: SiteBaseline; data?: PlannerData;
  /** IT kW the plan adds (allocated) and the draw used for energy. */
  addedKw: number; drawKw: number; racks: number;
  checks: Record<string, CheckResult>; blockers: ScopeBlocker[]; lines: InSiteLine[]; notes: string[];
  shortfall?: Shortfall;
  rack?: RackResult; pod?: PodResult; hall?: HallResult; retrofit?: RetrofitResult;
  ip: IpPlan & { warnings: string[]; addresses: { rackId: string; rackName: string; purpose: 'Production' | 'Management'; address: string; subnetId?: string; vlan?: number }[] };
  network: { leaves: number; spines: number; uplinks: number; uplinkGbps: number; accessPorts: number };
  cooling: { type: string; units: number; unitKw: number; capacityKw: number; liquidRequired: boolean; redundancy: string };
  plant: { name: string; kind: 'pdu' | 'cooling' | 'cdu'; capacityKw: number; count: number; redundancy: string }[];
  classes: { name: string; kw: number; racks: number; sharePct: number }[];
  commissioningLevel: number;
}

/* ================================================================== helpers */
const num = (p: Record<string, Sourced<ParamValue>>, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const str = (p: Record<string, Sourced<ParamValue>>, k: string, d = '') => { const v = p[k]?.value; return v === undefined || v === '' ? d : String(v); };
const bool = (p: Record<string, Sourced<ParamValue>>, k: string, d = false) => { const v = p[k]?.value; return typeof v === 'boolean' ? v : d; };
const NA_LOADING: CheckResult = { status: 'n/a', detail: 'Not checked: platform data still loading' };
const pass = (detail: string, value?: string): CheckResult => ({ status: 'pass', detail, value });
const fail = (detail: string, value?: string): CheckResult => ({ status: 'fail', detail, value });
const warn = (detail: string, value?: string): CheckResult => ({ status: 'warn', detail, value });
const na = (detail: string): CheckResult => ({ status: 'n/a', detail });

/** Fallback unit prices when the benchmark is missing (same values as the planner seed). */
const PRICE_DEFAULTS: Record<string, number> = {
  'install-device': 150, 'install-cabinet': 900, 'feed-circuit': 1800, 'rpdu-63a': 2100, 'busway-m': 650, 'busway-tapoff': 1200,
  'cage-m': 450, 'cage-door': 6500, 'badge-reader': 3200, 'cctv-camera': 1800, 'cdu-inrow': 140000, 'cdu-inrack': 28000, 'liquid-cabinet': 6800, 'hose-kit': 1500,
  'pipework-m': 380, valve: 650, 'water-tapoff': 1100, 'water-treatment': 45000, 'flush-fill-test': 18000, 'leak-detection-row': 3500, 'drip-tray': 450,
  'bms-point': 2500, 'bms-integration': 15000, 'spreader-plate': 1800, 'leaf-400g': 85000, 'spine-400g': 95000, 'backend-switch': 120000, 'optic-100g': 300, 'optic-800g': 2500,
  'hall-enclosure-m2': 900, 'electrical-install-kw': 250, 'mechanical-install-kw': 200, 'atp-rack': 600, 'cx-kw': 35, 'liquid-cx-loop': 25000, 'move-device': 120,
};
const SIZING_DEFAULTS: Record<string, number> = { 'floor-pdu-kw': 150, 'inrow-kw': 50, 'crah-kw': 120, 'cdu-inrow-kw': 600, 'cdu-inrack-kw': 100, 'cdu-facility-kw': 1350, 'liquid-cabinet-kg': 1800, 'pipe-run-m': 40 };

function makePricing(c: ScopeCtx) {
  const bm = (metric: string) => c.benchmarks.find(b => b.metric === metric);
  const price = (key: string): Price => { const b = bm(`unitCost:${key}`); return b?.value !== undefined ? { value: b.value, source: b.source } : { value: PRICE_DEFAULTS[key] ?? 0, source: 'planner default (no benchmark recorded)' }; };
  const model = (m: string, fallbackKey?: string): Price => { const p = priceOf(m); return p ? { value: p, source: 'Approved catalogue price book 2026' } : fallbackKey ? price(fallbackKey) : { value: 0, source: 'not priced' }; };
  const sizing = (key: string) => bm(`sizing:${key}`)?.value ?? SIZING_DEFAULTS[key] ?? 0;
  return { price, model, sizing };
}
const vendorOf = (kind: ItemKind, model?: string) => CATALOGUE[kind]?.options.find(o => !model || o.model === model)?.manufacturer ?? 'To tender';

/** Rack-class split of N racks and a kW total, from the workload mix. Racks and kW always add up. */
export function classesFromMix(itKw: number, racks: number, demand: T.PlannerDemand, liquidThresholdKw = 30): T.PlannerRackClass[] {
  if (racks <= 0 || itKw <= 0) return [];
  const density = itKw / racks;
  const mix: [RackClassName, number, number][] = ([['GPU', demand.gpuPct, Math.max(density * 2, 20)], ['Compute', demand.computePct, density], ['Storage', demand.storagePct, Math.max(4, density * 0.6)]] as [RackClassName, number, number][]).filter(m => m[1] > 0);
  if (!mix.length) return [{ name: 'Compute', racks, kw: r1(density), cooling: density > liquidThresholdKw ? 'liquid' : 'air' }];
  const share = mix.reduce((a, m) => a + m[1], 0);
  let counts = mix.map(([, pct, each]) => Math.max(1, Math.round((itKw * pct / share) / each)));
  // Normalise the counts to the rack total, adjusting the largest class.
  let diff = racks - counts.reduce((a, x) => a + x, 0);
  while (diff !== 0) { const i = counts.indexOf(Math.max(...counts)); const step = diff > 0 ? 1 : -1; if (counts[i] + step < 1) break; counts[i] += step; diff -= step; }
  counts = counts.map(x => Math.max(0, x));
  const out = mix.map(([name, pct], i) => ({ name, racks: counts[i], kw: counts[i] ? r1((itKw * pct / share) / counts[i]) : 0, cooling: 'air' as const })).filter(x => x.racks > 0);
  // Absorb rounding in the last class so racks × kW adds up to the requirement.
  const last = out[out.length - 1];
  const rest = out.slice(0, -1).reduce((a, x) => a + x.racks * x.kw, 0);
  last.kw = r1((itKw - rest) / last.racks);
  return out.map(x => ({ ...x, cooling: x.kw > liquidThresholdKw ? 'liquid' : 'air' }));
}

/* ================================================================== entry */
const MEMO = new WeakMap<ScopeCtx, InSiteAnalysis>();
/** The in-site analysis for an evaluation context (memoised). */
export function inSiteAnalysis(c: ScopeCtx): InSiteAnalysis {
  const hit = MEMO.get(c); if (hit) return hit;
  const a = build(c);
  MEMO.set(c, a);
  return a;
}

function empty(c: ScopeCtx, type: InSiteType): InSiteAnalysis {
  return { type, ready: !!c.data?.ready, site: c.site, data: c.data, addedKw: 0, drawKw: 0, racks: 0, checks: {}, blockers: [], lines: [], notes: [], ip: { aggregate: '—', items: [], vlans: [], asns: [], usedAddresses: 0, totalAddresses: 0, warnings: [], addresses: [] }, network: { leaves: 0, spines: 0, uplinks: 0, uplinkGbps: 0, accessPorts: 0 }, cooling: { type: 'room', units: 0, unitKw: 0, capacityKw: 0, liquidRequired: false, redundancy: 'N+1' }, plant: [], classes: [], commissioningLevel: 3 };
}

function build(c: ScopeCtx): InSiteAnalysis {
  const type = c.plan.scope as InSiteType;
  const a = empty(c, type);
  const P = c.params; const plan = c.plan;
  const pricing = makePricing(c);
  const add = (l: Omit<InSiteLine, 'priceSource' | 'unitCost'> & { price: Price }) => { if (l.qty > 0) a.lines.push({ ...l, qty: r0(l.qty * 100) / 100, unitCost: r0(l.price.value), priceSource: l.price.source }); };
  const data = c.data; const site = c.site;
  const ready = !!data && data.ready !== false && !!site;
  a.ready = ready;
  a.commissioningLevel = type === 'rack' ? 3 : type === 'pod' ? 4 : 5;
  const ctxBits = { c, a, P, plan, pricing, add, data: data!, site: site! };
  if (type === 'rack') rackAnalysis(ctxBits, ready);
  else if (type === 'pod') podAnalysis(ctxBits, ready);
  else if (type === 'hall') hallAnalysis(ctxBits, ready);
  else retrofitAnalysis(ctxBits, ready);
  // Common checks.
  if (ready && site) {
    const gpu = type === 'rack' ? !!a.rack?.equipment?.rows.some(r => r.model?.category === 'GPU-Node') || plan.demand.gpuPct > 0 : plan.demand.gpuPct > 0;
    a.checks['ins-dc-plant'] = !site.dcPlant ? pass(`${site.dc.name} has an AC power chain (${site.stages.find(s => s.key === 'ups')?.label ?? 'UPS'})`) : gpu ? fail(`${site.dc.name} is a −48 V DC plant; GPU racks need 415 V AC or HVDC distribution. Plan the AC supply first (linked plant plan)`) : warn(`${site.dc.name} is a −48 V DC plant; check every model in the plan has DC power supplies`);
    if (site.dcPlant && gpu) a.shortfall = a.shortfall ?? { kw: a.addedKw, what: 'AC power for GPU racks at a −48 V DC site', plantIntent: `Add a 415 V AC UPS and distribution at ${site.dc.name} for ${kwFmt(a.addedKw)} of GPU racks (${plan.plnId})`, plantTitle: `${site.dc.code} · AC power for GPU racks` };
  } else if (!ready) a.checks['ins-dc-plant'] = NA_LOADING;
  // Every other in-site check reports loading until the data is there.
  if (!ready) for (const k of ['ins-u-block', 'ins-rack-power', 'ins-pdu', 'ins-zone-cooling', 'ins-weight', 'ins-ports', 'ins-ip', 'ins-site-power', 'ins-positions', 'ins-hall-design', 'ins-facility-water', 'ins-cdu', 'ins-uprate', 'ins-waves', 'ins-setpoint', 'ins-window', 'ins-containment', 'ins-spine-ports']) a.checks[k] = a.checks[k] ?? NA_LOADING;
  return a;
}

type Bits = { c: ScopeCtx; a: InSiteAnalysis; P: Record<string, Sourced<ParamValue>>; plan: T.PlannerPlan; pricing: ReturnType<typeof makePricing>; add: (l: Omit<InSiteLine, 'priceSource' | 'unitCost'> & { price: Price }) => void; data: PlannerData; site: SiteBaseline };

/** Site power chain check shared by every type: the added kW against the site's binding stage. */
function sitePowerCheck(b: Bits, kw: number): CheckResult {
  const { site, a, plan } = b;
  const head = site.headroomItKw; const bind = site.binding;
  const chain = site.stages.filter(s => s.key !== 'cooling' && s.key !== 'design').map(s => `${s.label} ${kwFmt(Math.max(0, s.headroomItKw))}`).join(', ');
  const others = `${site.reservedKw ? `${kwFmt(site.reservedKw)} reserved, ` : ''}${site.pipelineKw ? `${kwFmt(site.pipelineKw)} in approved plans (${site.pipeline.map(p => p.plnId).join(', ')}), ` : ''}`;
  if (kw <= head) return pass(`${kwFmt(kw)} within ${kwFmt(head)} of IT headroom at ${site.dc.code} after ${others}today's load (binding: ${bind?.label ?? 'none'}; ${chain})`, `${kwFmt(head - kw)} left`);
  const short = r1(kw - head);
  a.shortfall = a.shortfall ?? { kw: short, what: `${bind?.label ?? 'power chain'} at ${site.dc.code}`, plantIntent: `Add ${kwFmt(short)} of usable IT capacity at ${site.dc.name} (${bind?.label ?? 'power chain'} is the binding stage) so plan ${plan.plnId} fits`, plantTitle: `${site.dc.code} · ${bind?.label ?? 'power'} uplift for ${plan.plnId}` };
  return fail(`${kwFmt(kw)} needed, ${kwFmt(Math.max(0, head))} of IT headroom at ${site.dc.code}: short by ${kwFmt(short)}. Binding stage: ${bind?.label ?? '—'} (${bind?.basis ?? ''}). ${others}A linked plant plan is needed`, `${kwFmt(short)} short`);
}

/* ================================================================== rack */
function rackAnalysis(b: Bits, ready: boolean) {
  const { a, P, plan, pricing, add, data, site } = b;
  const count = Math.max(1, Math.min(8, num(P, 'rackCount', 1)));
  const eq = equipmentTotals(data, plan.inSite?.equipment);
  const density = num(P, 'densityKwPerRack', plan.demand.densityKwPerRack || 8);
  const declared: string[] = [];
  const u = eq?.u || (declared.push('rack units'), num(P, 'rackUnitsNeeded', 10));
  const kw = eq?.maxKw || density; if (!eq) declared.push('power');
  const kg = eq?.kg ?? (declared.push('weight (15 kg per U)'), u * 15);
  const psus = eq?.psus ?? Math.max(2, u);
  const ports = P['portsPerRack']?.source === 'user' || !eq ? num(P, 'portsPerRack', 4) : Math.max(1, eq.ports);
  const hosts = eq?.hosts ?? Math.max(1, Math.round(u / 2));
  const mgmt = eq?.devices ?? Math.max(1, Math.round(u / 2));
  const mode = /new cabinet/i.test(str(P, 'placementMode', 'Into existing racks')) ? 'new-cabinet' : 'existing-rack';
  const feed = feedConfig(P['feedType']?.value);
  const portSpeedMbps = Number(str(P, 'portSpeedGbps', '25')) * 1000;
  const r: RackResult = { mode, count, equipment: eq, perRack: { kw, drawKw: eq?.typicalKw || density, u, kg, psus, ports, hosts, mgmt, declared }, feed, portSpeedMbps, candidates: [], accepted: [], missing: count, backout: '' };
  a.rack = r;
  a.addedKw = r1(kw * count); a.drawKw = r1(r.perRack.drawKw * count); a.racks = count;
  a.classes = [{ name: eq?.rows.some(x => x.model?.category === 'GPU-Node') ? 'GPU' : 'Compute', kw, racks: count, sharePct: 100 }];
  a.cooling = { type: 'room (existing zone)', units: 0, unitKw: 0, capacityKw: 0, liquidRequired: kw > 30, redundancy: 'site' };
  if (!ready) { a.ip.aggregate = '—'; return; }
  // Block and warn thresholds from the capacity rule (R-INS-02), warning 5 points below the block.
  const blockPct = ruleThreshold(b.c, 'ins-rack-power') ?? RACK_BLOCK_PCT; const warnPct = Math.min(RACK_WARN_PCT, blockPct - 5);
  const need = { u, kw, kg, psus, mode, feed, excludePlanId: plan.id, warnPct, blockPct, zoneUsedKw: new Map<string, number>() } as const;
  r.candidates = rackCandidates(data, site, { ...need, zoneUsedKw: new Map() }, str(P, 'preferredHallId') || undefined);
  // The racks the planner accepted, re-checked live in order (each one uses up zone headroom for the next).
  const chosen = (plan.placement?.racks ?? []).map(x => x.rackId).filter(Boolean);
  const legacy = chosen.length ? chosen : String(plan.params.placementRackIds ?? '').split(',').filter(Boolean);
  const takenPorts = new Set<string>(); const takenIps = new Set<string>(); const zoneUsed = new Map<string, number>();
  for (const id of legacy.slice(0, count)) {
    const rack = byId(data, 'racks', id); if (!rack) continue;
    const cand = checkRack(data, site, rack, { ...need, zoneUsedKw: zoneUsed }); if (!cand) continue;
    if (cand.zone) zoneUsed.set(cand.zone.zone.id, (zoneUsed.get(cand.zone.zone.id) ?? 0) + kw);
    const pp = pickPorts(data, rack, portSpeedMbps, ports, takenPorts);
    const outletsFree = mode === 'existing-rack' ? rackOutlets(data, rack.id).free : [];
    const half = Math.ceil(psus / 2);
    const outlets = outletsFree.slice(0, psus).map((o, i) => ({ id: o.id, name: `${byId(data, 'devices', o.deviceId)?.name ?? o.deviceId} · ${o.name}`, side: (i < half ? 'A' : 'B') as 'A' | 'B' }));
    const prod = addressesFromHall(data, site.dc.id, rack.hallId, 'Production', hosts, takenIps);
    const mg = addressesFromHall(data, site.dc.id, rack.hallId, 'Management', mgmt, takenIps);
    r.accepted.push({ cand, startU: cand.block?.start, endU: cand.block ? cand.block.start + u - 1 : undefined, outlets, ports: pp.ports, portNote: pp.note, portShort: pp.short, prod, mgmt: mg });
  }
  r.missing = Math.max(0, count - r.accepted.length);
  // Checks on the accepted racks.
  const acc = r.accepted;
  const per = (k: keyof RackCandidate['checks'], label: string): CheckResult => {
    if (!acc.length) return na(`Not checked: no rack accepted yet (${r.candidates.filter(x => !x.blocked.length).length} of ${r.candidates.length} candidates pass)`);
    const bad = acc.filter(x => !x.cand.checks[k].ok); const notChecked = acc.filter(x => x.cand.checks[k].na); const warned = acc.filter(x => x.cand.checks[k].warn && !x.cand.checks[k].na);
    const detail = acc.map(x => `${x.cand.rack.name}: ${x.cand.checks[k].detail}`).join('; ');
    return bad.length ? fail(detail) : notChecked.length === acc.length ? na(detail) : warned.length || notChecked.length ? warn(detail) : pass(detail, label);
  };
  a.checks['ins-u-block'] = per('u', `${u}U`);
  a.checks['ins-rack-power'] = per('power', `${kw} kW`);
  a.checks['ins-pdu'] = per('pdu', 'A and B');
  a.checks['ins-weight'] = per('weight', `${kg} kg`);
  a.checks['ins-zone-cooling'] = per('cooling', `${kw} kW`);
  a.checks['ins-ports'] = !acc.length ? na('Not checked: no rack accepted yet') : acc.some(x => x.portShort) ? fail(acc.map(x => `${x.cand.rack.name}: ${x.ports.length} of ${ports} × ${portSpeedMbps / 1000}G ports (${x.portNote})`).join('; ')) : acc.some(x => x.ports.every(p => p.side === 'A')) && ports > 1 ? warn(acc.map(x => `${x.cand.rack.name}: ${x.portNote}`).join('; ')) : pass(acc.map(x => `${x.cand.rack.name}: ${ports} × ${portSpeedMbps / 1000}G on ${x.portNote.replace('Leaf pair ', '')}`).join('; '));
  a.checks['ins-ip'] = !acc.length ? na('Not checked: no rack accepted yet') : acc.some(x => !x.prod.ok || !x.mgmt.ok) ? fail(acc.map(x => `${x.cand.rack.name}: ${!x.prod.ok ? x.prod.detail : !x.mgmt.ok ? x.mgmt.detail : 'ok'}`).join('; ')) : pass(acc.map(x => `${x.cand.rack.name}: production ${x.prod.detail}; management ${x.mgmt.detail}`).join('; '));
  a.checks['ins-site-power'] = sitePowerCheck(b, a.addedKw);
  // Change window: next free slot before go-live, with a clash check.
  const after = new Date(Math.max(clockMs() + 3 * 864e5, new Date(plan.targetGoLive).getTime() - 21 * 864e5)).toISOString();
  const rackIds = acc.map(x => x.cand.rack.id);
  const leafIds = [...new Set(acc.flatMap(x => x.ports.map(p => p.deviceId)))];
  if (acc.length) {
    const w = nextFreeWindow(data, { dataCenterId: site.dc.id, rackIds, deviceIds: leafIds, hours: 4, after, excludePlanId: plan.id });
    const cl = clashes(data, { dataCenterId: site.dc.id, rackIds, deviceIds: leafIds, start: w.start, end: w.end, excludePlanId: plan.id });
    r.window = { ...w, clashes: cl, beforeGoLive: new Date(w.end).getTime() <= new Date(plan.targetGoLive).getTime() };
    a.checks['ins-window'] = cl.some(x => x.severity === 'block') ? fail(`Window ${w.start.slice(0, 16).replace('T', ' ')} UTC clashes with ${cl.filter(x => x.severity === 'block').map(x => `${x.id} ${x.title}`).join(', ')}`) : !r.window.beforeGoLive ? warn(`First free change night is ${w.start.slice(0, 10)}, after the go-live date ${plan.targetGoLive.slice(0, 10)}`) : pass(`${w.start.slice(0, 16).replace('T', ' ')} to ${w.end.slice(11, 16)} UTC; ${cl.length ? `${cl.length} open change(s) on the same equipment at other times` : 'no clashing window or change'}`);
  } else a.checks['ins-window'] = na('Not checked: no rack accepted yet');
  r.backout = mode === 'new-cabinet'
    ? 'Power down the new equipment, open the new breakers on both PDUs and label them spare, remove patching from the leaf ports and return them to free, release the addresses in IPAM, and set the cabinet back to Planned.'
    : 'Power down the new equipment, unplug it from the power strips (outlets back to free), remove patching from the leaf ports, release the units, addresses and ports in DCIM and IPAM. No change to existing equipment in the rack.';
  // Bill: only what the placement buys.
  const own = bool(P, 'operatorOwnedIt', false);
  if (mode === 'new-cabinet') {
    // New-cabinet candidates are empty cabinets already in position: no cabinet to buy, power strips only where the cabinet has none.
    const withStrips = acc.filter(x => rackOutlets(data, x.cand.rack.id).strips.length > 0).length;
    const strips = (count - withStrips) * (feed.dual ? 2 : 1);
    const rp = feed.amps > 32 ? pricing.price('rpdu-63a') : pricing.model('Geist rPDU 3-phase');
    add({ category: 'Power', item: 'Rack power strips', spec: `${feed.amps} A ${feed.phase.toLowerCase()} metered, ${feed.dual ? 'A and B' : 'single'} feed, for cabinets without strips`, qty: strips, unit: 'each', price: rp, kind: 'rack-pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: feed.amps > 32 ? undefined : 'Geist rPDU 3-phase' });
    add({ category: 'Power', item: 'Electrical installation', spec: `New ${feed.amps} A circuit from a hall PDU: breaker, cable, termination, test`, qty: count * (feed.dual ? 2 : 1), unit: 'circuit', price: pricing.price('feed-circuit'), kind: 'install', manufacturer: 'NetBuild Corp' });
    add({ category: 'Racks and containment', item: 'Installation and integration', spec: 'Prepare the empty cabinet: level, bond, blanking panels, labels', qty: count, unit: 'cabinet', price: pricing.price('install-cabinet'), kind: 'install', manufacturer: 'NetBuild Corp' });
  }
  add({ category: 'Network', item: 'Patch and cross-connects', spec: `${ports} × ${portSpeedMbps / 1000}G to the leaf pair per rack`, qty: ports * count, unit: 'port', price: pricing.model('Cross-connect'), kind: 'patch', manufacturer: 'Corning' });
  add({ category: 'Racks and containment', item: 'Installation and integration', spec: `Rack and stack, cable, label and test${eq ? `, ${eq.devices} devices per rack` : ''}`, qty: (eq?.devices ?? Math.max(1, Math.round(u / 2))) * count, unit: 'device', price: pricing.price('install-device'), kind: 'install', manufacturer: 'NetBuild Corp' });
  if (own && eq) for (const row of eq.rows) if (row.model) {
    const kind: ItemKind = row.model.category === 'GPU-Node' ? 'gpu-server' : row.model.category === 'Storage' ? 'storage' : row.model.category === 'Switch' ? 'leaf' : row.model.category === 'Router' ? 'core' : row.model.category === 'Firewall' ? 'firewall' : 'server';
    add({ category: row.model.category === 'Switch' || row.model.category === 'Router' || row.model.category === 'Firewall' ? 'Network' : 'Compute and storage', item: CATALOGUE[kind].label, spec: `${row.model.model}, ${row.model.heightU}U, ${row.model.typicalPowerW} W typical`, qty: row.line.qty * count, unit: 'each', price: row.unitPrice ? { value: row.unitPrice, source: 'Approved catalogue price book 2026' } : { value: 0, source: 'not in the price book' }, kind, leadItem: kind === 'gpu-server' ? 'GPU servers' : kind === 'leaf' || kind === 'core' ? 'Spine / leaf switches' : 'General servers', manufacturer: row.model.manufacturer, model: row.model.model, it: true });
  }
  // IP plan: addresses from the existing hall subnets, no new aggregate.
  const prodSubnet = acc[0]?.prod.subnet;
  const vl = [...new Set(acc.flatMap(x => [x.prod.vlan, x.mgmt.vlan]).filter((v): v is T.VLAN => !!v).map(v => v.vlanNumber))];
  a.ip = { ...a.ip, aggregate: prodSubnet ? `${prodSubnet.cidr} (existing hall subnet${vl.length ? `, VLAN ${vl.join(' and ')}` : ''})` : '—', items: [], vlans: [], usedAddresses: acc.reduce((s, x) => s + x.prod.addresses.length + x.mgmt.addresses.length, 0), totalAddresses: prodSubnet?.totalHosts ?? 0, warnings: acc.flatMap(x => [x.prod, x.mgmt].filter(p => !p.ok).map(p => p.detail)), addresses: acc.flatMap(x => [...x.prod.addresses.map(ad => ({ rackId: x.cand.rack.id, rackName: x.cand.rack.name, purpose: 'Production' as const, address: ad, subnetId: x.prod.subnet?.id, vlan: x.prod.vlan?.vlanNumber })), ...x.mgmt.addresses.map(ad => ({ rackId: x.cand.rack.id, rackName: x.cand.rack.name, purpose: 'Management' as const, address: ad, subnetId: x.mgmt.subnet?.id, vlan: x.mgmt.vlan?.vlanNumber }))]) };
}

/* ================================================================== pod */
function podAnalysis(b: Bits, ready: boolean) {
  const { a, P, plan, pricing, add, data, site } = b;
  const n = Math.max(1, num(P, 'rackCount', 24));
  const kwPerRack = num(P, 'densityKwPerRack', plan.demand.densityKwPerRack || 10);
  const layout = (str(P, 'podLayout', 'Auto') as PodResult['layout']);
  const power = str(P, 'podPower', 'Existing PDUs');
  const coolingType = str(P, 'coolingType', 'chilled-water');
  const closeCoupled = coolingType === 'in-row' || coolingType === 'rear-door';
  const feed = feedConfig(P['feedType']?.value ?? 'Dual 3-phase 32 A');
  const feedsPerSide = Math.max(1, Math.ceil(kwPerRack / feed.kw));
  const inRowKw = pricing.sizing('inrow-kw');
  const inRow = coolingType === 'in-row' ? { units: Math.ceil((n * kwPerRack * 1.1) / inRowKw) + 1, unitKw: inRowKw, positions: 0 } : undefined;
  if (inRow) inRow.positions = Math.ceil(inRow.units / 2);
  const positionsNeeded = n + (inRow?.positions ?? 0);
  const kw = r1(n * kwPerRack);
  a.addedKw = kw; a.drawKw = kw; a.racks = n;
  const cls = classesFromMix(kw, n, plan.demand).map(x => ({ cls: x.name as RackClassName, racks: x.racks, it: itPerRack(data, x.name as RackClassName, x.kw, Math.max(42, num(P, 'rackUnitsNeeded', 42))) }));
  a.classes = classesFromMix(kw, n, plan.demand).map(x => ({ name: x.name, kw: x.kw, racks: x.racks, sharePct: r0((x.racks / n) * 100) }));
  const racksPerLeafPair = Math.max(1, num(P, 'racksPerLeafPair', 16)); const uplinksPerLeaf = num(P, 'uplinksPerLeaf', 4); const uplinkGbps = Number(str(P, 'uplinkGbps', '100'));
  const leaves = Math.ceil(n / racksPerLeafPair) * 2; const uplinks = leaves * uplinksPerLeaf;
  a.network = { leaves, spines: 0, uplinks, uplinkGbps, accessPorts: n * 48 };
  a.cooling = { type: closeCoupled ? coolingType : 'room (existing zone)', units: inRow?.units ?? (coolingType === 'rear-door' ? n : 0), unitKw: inRow?.unitKw ?? (coolingType === 'rear-door' ? 35 : 0), capacityKw: inRow ? inRow.units * inRow.unitKw : 0, liquidRequired: kwPerRack > 30, redundancy: 'N+1' };
  const r: PodResult = { count: n, kwPerRack, layout, power, cooling: coolingType, options: [], bestRun: 0, freePositions: 0, chosenProblems: [], positionsNeeded, feed, feedSchedule: [], pduShortKw: { A: 0, B: 0 }, newPdus: 0, buswayM: 0, tapOffs: 0, leaves, uplinks, spine: { spines: 0, free: 0, need: uplinks }, containment: { aisles: 0, type: '—' }, inRow, classes: cls, cutIns: [] };
  a.pod = r;
  if (!ready) return;
  const opt = podOptions(data, site, positionsNeeded, kwPerRack * n / positionsNeeded, layout, plan.id, undefined, closeCoupled);
  r.options = opt.options; r.bestRun = opt.bestRun; r.freePositions = opt.freePositions;
  // The accepted positions, validated against today's grid.
  const stored = plan.placement?.positions ?? [];
  if (stored.length) {
    const hallId = stored[0].hallId;
    const g = hallGrid(data, site, hallId, plan.id);
    const bad = stored.filter(p => { const cell = g?.cells[p.gridY]?.[p.gridX]; return !cell || (cell.state !== 'free' && cell.state !== 'empty-rack'); });
    const same = r.options.find(o => o.positions.length === stored.length && o.positions.every(p => stored.some(s => s.hallId === p.hallId && s.gridX === p.gridX && s.gridY === p.gridY)));
    const hb = site.halls.find(h => h.hall.id === hallId);
    const zone = site.cooling.zones.find(z => z.zone.id === hb?.hall.coolingZoneId);
    r.chosen = same ?? (hb ? { id: 'stored', hall: hb.hall, kind: new Set(stored.map(s => s.gridY)).size > 1 ? 'pair' : 'row', positions: stored.map(s => ({ ...s, rackId: g?.cells[s.gridY]?.[s.gridX]?.rack?.id, rowId: g?.cells[s.gridY]?.[s.gridX]?.rowId })), gridYs: [...new Set(stored.map(s => s.gridY))], zone, zoneHeadroomKw: zone?.headroomKw, hallHeadroomKw: hb.headroomKw, pduHeadroomKw: { A: 0, B: 0 }, freeCircuits: { A: 0, B: 0 }, containment: g?.rowByY.get(stored[0].gridY)?.containment ?? 'New', newRows: [...new Set(stored.map(s => s.gridY))].filter(y => !g?.rowByY.get(y)), fits: !bad.length, problems: [], score: 0, perimeterM: perimeterM(stored), aisles: 1 } : undefined);
    if (bad.length) r.chosenProblems.push(`${bad.length} accepted position${bad.length === 1 ? ' is' : 's are'} no longer free (${bad.map(p => `x${p.gridX} y${p.gridY}`).join(', ')})`);
    if (stored.length < positionsNeeded) r.chosenProblems.push(`${stored.length} positions accepted, ${positionsNeeded} needed`);
  }
  const ch = r.chosen;
  // Space.
  a.checks['ins-positions'] = ch ? (r.chosenProblems.length ? fail(r.chosenProblems.join('; ')) : pass(`${ch.positions.length} contiguous positions in ${ch.hall.name}, ${ch.kind === 'pair' ? `facing rows ${ch.gridYs.map(y => y + 1).join(' and ')} around one aisle` : `row ${ch.gridYs[0] + 1}`}`))
    : r.options.length ? na(`Not checked: no position accepted yet (${r.options.filter(o => o.fits).length} of ${r.options.length} options fit)`)
    : fail(`No run of ${positionsNeeded} contiguous free positions at ${site.dc.code} (${r.freePositions} free in total, longest run ${r.bestRun})`, `${Math.max(0, positionsNeeded - r.bestRun)} short`);
  if (!ch && !r.options.length && r.freePositions < positionsNeeded) a.shortfall = { kw, what: `${positionsNeeded - r.freePositions} rack positions`, plantIntent: `Expand ${site.dc.name}: ${positionsNeeded - r.freePositions} more rack positions are needed for plan ${plan.plnId}`, plantTitle: `${site.dc.code} expansion for ${plan.plnId}`, expansion: true };
  // Power: site chain, then hall PDUs and a feed schedule.
  a.checks['ins-site-power'] = sitePowerCheck(b, kw);
  const hallId = ch?.hall.id ?? r.options[0]?.hall.id;
  if (hallId) {
    const sides = hallPduSides(data, hallId, plan.id).sort((x, y) => y.headroomKw - x.headroomKw);
    const left = new Map(sides.map(s => [s.pdu.id, { kw: s.headroomKw, circuits: s.freeOutlets }]));
    const cut = new Map<string, { pdu: T.PDU; side: 'A' | 'B'; circuits: number; kw: number }>();
    const take = (side: 'A' | 'B') => { const s = sides.filter(x => x.side === side).sort((x, y) => left.get(y.pdu.id)!.kw - left.get(x.pdu.id)!.kw).find(x => left.get(x.pdu.id)!.kw >= kwPerRack && left.get(x.pdu.id)!.circuits >= feedsPerSide); if (!s) return undefined; const l = left.get(s.pdu.id)!; l.kw -= kwPerRack; l.circuits -= feedsPerSide; const cc = cut.get(s.pdu.id) ?? { pdu: s.pdu, side, circuits: 0, kw: 0 }; cc.circuits += feedsPerSide; cc.kw += kwPerRack; cut.set(s.pdu.id, cc); return s.pdu.name; };
    const positions = (ch?.positions ?? r.options[0]?.positions ?? []).slice(0, n);
    r.feedSchedule = positions.map((pos, i) => { const A = power === 'New floor PDUs' ? undefined : take('A'); const B = feed.dual && power !== 'New floor PDUs' ? take('B') : undefined; return { position: pos, label: `P${String(i + 1).padStart(2, '0')}`, pduA: A, pduB: B, amps: feed.amps, feedsPerSide, kw: kwPerRack }; });
    const shortA = r.feedSchedule.filter(f => !f.pduA).length * kwPerRack, shortB = feed.dual ? r.feedSchedule.filter(f => !f.pduB).length * kwPerRack : 0;
    r.pduShortKw = { A: r1(shortA), B: r1(shortB) };
    r.newPdus = shortA || shortB ? Math.ceil(Math.max(shortA, shortB) / pricing.sizing('floor-pdu-kw')) * (feed.dual ? 2 : 1) : 0;
    r.cutIns = [...cut.values()];
    a.checks['ins-pdu'] = !sides.length ? warn('Not checked: no PDUs recorded for the hall; new floor PDUs priced') : r.newPdus ? warn(`Hall PDUs short by ${kwFmt(shortA)} on A${feed.dual ? ` and ${kwFmt(shortB)} on B` : ''}; ${r.newPdus} new floor PDUs fed from the existing UPS are in the bill`) : pass(`${n} racks on ${r.cutIns.length} existing PDUs: ${r.cutIns.map(x => `${x.pdu.name} (${x.side}) ${x.circuits} circuits, ${kwFmt(x.kw)}`).join(', ')}`);
    if (power === 'Busway') { const rowsUsed = new Set(positions.map(p => p.gridY)).size; const runM = Math.ceil(positions.length / Math.max(1, rowsUsed)) * POSITION_W_M + 3; r.buswayM = r0(runM * rowsUsed * (feed.dual ? 2 : 1)); r.tapOffs = n * feedsPerSide * (feed.dual ? 2 : 1); }
  } else a.checks['ins-pdu'] = na('Not checked: no hall with room for the pod');
  // Cooling.
  const zone = ch?.zone ?? r.options[0]?.zone;
  if (closeCoupled) {
    const fw = site.cooling.facilityWaterHeadroomKw; const chillers = (groupBy(data, 'chillers', 'dataCenterId').get(site.dc.id) ?? []).length;
    a.checks['ins-zone-cooling'] = pass(`${coolingType === 'in-row' ? `${inRow!.units} in-row units of ${inRowKw} kW (N+1)` : `${n} rear-door coolers`} take the heat at the rack; the room zone is not loaded`);
    a.checks['ins-facility-water'] = !chillers ? warn(`Not checked: no chillers or dry coolers recorded at ${site.dc.code}; confirm ${kwFmt(kw)} of chilled water for the ${coolingType} units with the facility team`) : fw >= kw ? pass(`${kwFmt(kw)} of chilled water within ${kwFmt(fw)} of chiller headroom (one unit lost)`) : fail(`${kwFmt(kw)} of chilled water needed, ${kwFmt(fw)} of chiller headroom: short by ${kwFmt(kw - fw)}`);
  } else {
    a.checks['ins-zone-cooling'] = !zone ? na('Not checked: no cooling zone for the hall') : zone.headroomKw >= kw ? pass(`${zone.zone.name}: ${kwFmt(zone.headroomKw)} free with one unit lost${zone.hallIds.length > 1 ? ` (shared by ${zone.hallIds.length} halls)` : ''}`) : fail(`${zone.zone.name}: ${kwFmt(zone.headroomKw)} free with one unit lost${zone.hallIds.length > 1 ? `, shared by ${zone.hallIds.length} halls` : ''}; ${kwFmt(kw)} needed. Use in-row cooling or add CRAH capacity (linked plant plan)`);
    a.checks['ins-facility-water'] = na('No new water-cooled units in this pod');
    if (zone && zone.headroomKw < kw) a.shortfall = a.shortfall ?? { kw: r1(kw - zone.headroomKw), what: `cooling in ${zone.zone.name}`, plantIntent: `Add ${kwFmt(kw - zone.headroomKw)} of CRAH capacity to ${zone.zone.name} at ${site.dc.name} for plan ${plan.plnId}`, plantTitle: `${site.dc.code} · cooling for ${plan.plnId}` };
  }
  // Network: leaves to the existing spines.
  const sp = spinePorts(data, site.dc.id, uplinkGbps * 1000);
  r.spine = { spines: sp.spines.length, free: sp.free, need: uplinks };
  a.checks['ins-spine-ports'] = !sp.spines.length ? na(`Not checked: no spine switches recorded at ${site.dc.code}`) : sp.free >= uplinks ? pass(`${uplinks} × ${uplinkGbps}G uplinks; ${sp.free} free ${uplinkGbps}G ports on ${sp.spines.length} spines`) : fail(`${uplinks} × ${uplinkGbps}G uplinks needed, ${sp.free} free ${uplinkGbps}G ports on ${sp.spines.length} spines`);
  // Containment and cage.
  if (ch) {
    const rowsHere = ch.gridYs.map(y => hallGrid(data, site, ch.hall.id, plan.id)?.rowByY.get(y));
    const types = [...new Set(rowsHere.map(rw => rw?.containment ?? 'New'))];
    r.containment = { aisles: 1, type: types.join(' / '), mismatch: types.length > 1 ? `The pod's rows use different containment (${types.join(', ')})` : types[0] === 'None' ? 'The row has no containment; the pod adds cold-aisle containment' : types[0] === 'Hot-Aisle' ? undefined : undefined };
    a.checks['ins-containment'] = r.containment.mismatch ? warn(r.containment.mismatch) : pass(`One contained aisle, ${types[0] === 'New' ? 'cold-aisle (new row)' : types[0].toLowerCase()} like the row`);
  } else a.checks['ins-containment'] = na('Not checked: no position accepted yet');
  if (bool(P, 'cageRequired', false)) r.cage = { perimeterM: perimeterM(ch?.positions ?? r.options[0]?.positions ?? []), doors: Math.max(1, num(P, 'cageDoors', 1)), readers: Math.max(1, num(P, 'cageReaders', 2)), cameras: Math.max(0, num(P, 'cageCameras', 2)) };
  // IP from the site container.
  podHallIp(b, n, cls.reduce((s, x) => s + x.racks * x.it.units, 0), leaves, 0, 'Pod', ch?.hall.id);
  // Bill.
  const reuse = (ch?.positions ?? []).filter(p => p.rackId).length;
  const rackModel = num(P, 'rackUnitsNeeded', 42) > 42 ? 'NetShelter SX 48U' : 'VR3300 42U';
  add({ category: 'Racks and containment', item: 'Rack', spec: `${rackModel}${reuse ? `; ${reuse} empty cabinets already in place are reused` : ''}`, qty: n - reuse, unit: 'each', price: pricing.model(rackModel), kind: 'rack', leadItem: 'Racks and containment', manufacturer: vendorOf('rack', rackModel), model: rackModel });
  add({ category: 'Racks and containment', item: 'Installation and integration', spec: 'Position, level, bond and blank each cabinet', qty: n, unit: 'cabinet', price: pricing.price('install-cabinet'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Racks and containment', item: 'Aisle containment', spec: `${r.containment.type === 'Hot-Aisle' ? 'Hot' : 'Cold'}-aisle doors and roof, one contained aisle`, qty: 1, unit: 'aisle', price: pricing.model('SmartAisle containment'), kind: 'containment', leadItem: 'Racks and containment', manufacturer: 'Vertiv', model: 'SmartAisle containment' });
  const rp = feed.amps > 32 ? pricing.price('rpdu-63a') : pricing.model('Geist rPDU 3-phase');
  add({ category: 'Power', item: 'Rack power strips', spec: `${feed.amps} A ${feed.phase.toLowerCase()}, ${feedsPerSide} per side, ${feed.dual ? 'A and B' : 'single'} feed`, qty: n * feedsPerSide * (feed.dual ? 2 : 1), unit: 'each', price: rp, kind: 'rack-pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Geist rPDU 3-phase' });
  if (power === 'Busway') {
    add({ category: 'Power', item: 'Power distribution unit', spec: `Overhead busway, ${feed.dual ? 'A and B runs' : 'one run'} over the pod`, qty: r.buswayM, unit: 'm', price: pricing.price('busway-m'), kind: 'pdu', leadItem: 'PDU', manufacturer: 'Vertiv' });
    add({ category: 'Power', item: 'Electrical installation', spec: `Busway tap-off boxes, ${feed.amps} A`, qty: r.tapOffs, unit: 'tap-off', price: pricing.price('busway-tapoff'), kind: 'install', manufacturer: 'NetBuild Corp' });
  } else add({ category: 'Power', item: 'Electrical installation', spec: `New ${feed.amps} A circuits from the hall PDUs (cut in live under change)`, qty: n * feedsPerSide * (feed.dual ? 2 : 1), unit: 'circuit', price: pricing.price('feed-circuit'), kind: 'install', manufacturer: 'NetBuild Corp' });
  if (r.newPdus) add({ category: 'Power', item: 'Power distribution unit', spec: `Floor PDU ${pricing.sizing('floor-pdu-kw')} kW fed from the existing UPS`, qty: r.newPdus, unit: 'each', price: pricing.model('Liebert FPC'), kind: 'pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Liebert FPC' });
  if (inRow) add({ category: 'Cooling', item: 'In-row cooler', spec: `${inRowKw} kW chilled water, N+1 (${inRow.units} units take ${inRow.positions} positions)`, qty: inRow.units, unit: 'each', price: pricing.model('CyberRow'), kind: 'inrow', leadItem: 'CRAH / CDU', manufacturer: 'Stulz', model: 'CyberRow' });
  if (coolingType === 'rear-door') add({ category: 'Cooling', item: 'Rear-door heat exchanger', spec: 'One per rack', qty: n, unit: 'each', price: pricing.model('Liebert DCD'), kind: 'reardoor', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', model: 'Liebert DCD' });
  networkLines(b, leaves, uplinks, uplinkGbps, 0, n);
  if (r.cage) {
    add({ category: 'Fire and security', item: 'Cage', spec: `Mesh partition around the pod, ${r.cage.perimeterM} m of fence (perimeter of the positions plus 1 m clearance)`, qty: r.cage.perimeterM, unit: 'm', price: pricing.price('cage-m'), kind: 'cage', manufacturer: 'Schneider' });
    add({ category: 'Fire and security', item: 'Access control and CCTV', spec: `${r.cage.doors} door(s), ${r.cage.readers} badge readers, ${r.cage.cameras} cameras on the site security system`, qty: 1, unit: 'lot', price: { value: r.cage.doors * pricing.price('cage-door').value + r.cage.readers * pricing.price('badge-reader').value + r.cage.cameras * pricing.price('cctv-camera').value, source: pricing.price('cage-door').source }, kind: 'access', manufacturer: 'CBRE' });
  }
  itLines(b, cls);
  add({ category: 'Monitoring', item: 'Installation and integration', spec: 'Acceptance test per rack: power on, A/B failover, thermal check, port test (level 4)', qty: n, unit: 'rack', price: pricing.price('atp-rack'), kind: 'install', manufacturer: 'NetBuild Corp' });
  a.plant = [...(r.newPdus ? [{ name: 'Floor PDUs (new)', kind: 'pdu' as const, capacityKw: pricing.sizing('floor-pdu-kw'), count: r.newPdus, redundancy: feed.dual ? 'A and B' : 'single' }] : []), ...(inRow ? [{ name: 'In-row units', kind: 'cooling' as const, capacityKw: inRow.unitKw, count: inRow.units, redundancy: 'N+1' }] : [])];
}

/* ================================================================== hall */
const HALL_MODE: Record<string, HallResult['mode']> = { shell: 'shell', 'partly-used': 'partly-used', 'new-hall': 'new-hall' };
export function hallModeOf(v: unknown, hb?: HallBaseline): HallResult['mode'] {
  const s = String(v ?? '');
  if (/new hall/i.test(s)) return 'new-hall'; if (/shell/i.test(s)) return 'shell'; if (/partly/i.test(s)) return 'partly-used';
  return HALL_MODE[s] ?? (hb && hb.racksInstalled > 0 ? 'partly-used' : 'shell');
}
function hallAnalysis(b: Bits, ready: boolean) {
  const { a, P, plan, pricing, add, data, site } = b;
  const kwReq = plan.designPowerKw;
  const density = Math.max(1, num(P, 'densityKwPerRack', plan.demand.densityKwPerRack || 12));
  const liquidThreshold = c_bench(b, 'liquidThresholdKw', 30);
  const userClasses = plan.inSite?.classes?.filter(x => x.racks > 0);
  const classes = userClasses?.length ? userClasses : classesFromMix(kwReq, Math.ceil(kwReq / density), plan.demand, liquidThreshold);
  const racks = classes.reduce((s, x) => s + x.racks, 0);
  const classKw = r1(classes.reduce((s, x) => s + x.racks * x.kw, 0));
  const kw = classKw || kwReq;
  a.addedKw = kw; a.drawKw = kw; a.racks = racks;
  a.classes = classes.map(x => ({ name: x.name, kw: x.kw, racks: x.racks, sharePct: racks ? r0((x.racks / racks) * 100) : 0 }));
  const liquidKwRaw = classes.filter(x => x.cooling === 'liquid').reduce((s, x) => s + x.racks * x.kw, 0);
  const capture = num(P, 'liquidCapturePct', 75) / 100;
  const liquidKw = r1(liquidKwRaw * capture); const residualAirKw = r1(liquidKwRaw - liquidKw);
  const airKw = r1(kw - liquidKwRaw + residualAirKw);
  const hall = data ? byId(data, 'halls', str(P, 'targetHallId')) : undefined;
  const hb = site?.halls.find(h => h.hall.id === hall?.id);
  const mode = hallModeOf(P['hallMode']?.value, hb);
  const newHall = plan.inSite?.newHall;
  const floor = mode === 'new-hall' ? (data ? byId(data, 'floors', newHall?.floorId) : undefined) : hb?.floor;
  const r: HallResult = { mode, hall, hb, floor, positionsAvail: 0, racks, kw, designKw: 0, designLeftKw: 0, classes, classesFrom: userClasses?.length ? 'plan' : 'mix', classKw, zoneSharedWith: [], airKw, liquidKw, residualAirKw, crah: { units: 0, unitKw: pricing.sizing('crah-kw'), coversKw: 0 }, cdus: 0, positions: [], newRows: [], whiteSpaceM2: 0, pduPerSide: 0, existingPduHeadroom: { A: 0, B: 0 }, leaves: 0, uplinks: 0, newSpines: 0, spine: { spines: 0, free: 0, need: 0 }, phases: [] };
  a.hall = r;
  const sortedPhases = [...plan.phases].sort((x, y) => x.goLive.localeCompare(y.goLive));
  const phaseKw = sortedPhases.reduce((s, p) => s + p.itKw, 0) || kw;
  r.phases = sortedPhases.map(p => ({ phase: p, share: p.itKw / phaseKw, kw: p.itKw, racks: 0 }));
  { let left = racks; r.phases.forEach((p, i) => { p.racks = i === r.phases.length - 1 ? left : Math.round(racks * p.share); left -= p.racks; }); }
  a.cooling = { type: liquidKwRaw ? 'air and liquid-to-chip' : 'air (CRAH)', units: 0, unitKw: r.crah.unitKw, capacityKw: 0, liquidRequired: classes.some(x => x.kw > liquidThreshold), redundancy: 'N+1' };
  const racksPerLeafPair = Math.max(1, num(P, 'racksPerLeafPair', 16)); const uplinksPerLeaf = num(P, 'uplinksPerLeaf', 4); const uplinkGbps = Number(str(P, 'uplinkGbps', '400'));
  r.leaves = Math.ceil(racks / racksPerLeafPair) * 2; r.uplinks = r.leaves * uplinksPerLeaf;
  if (!ready) return;
  // Space: positions from the hall's grid, or the new hall on its floor.
  if (mode === 'new-hall') {
    const halls = data.halls.filter(h => h.floorId === floor?.id);
    const used = halls.reduce((s, h) => s + (h.areaSqm ?? h.rackCapacity * 2.6), 0);
    r.floorFreeM2 = floor ? r0(floor.usableAreaSqm - used) : 0;
    r.positionsAvail = newHall?.positions ?? 0; r.designKw = newHall?.designKw ?? kw; r.designLeftKw = r.designKw;
    r.whiteSpaceM2 = newHall?.areaSqm ?? r0(racks * num(P, 'whiteSpaceM2PerRack', 2.6));
    const okArea = !!floor && r.whiteSpaceM2 <= (r.floorFreeM2 ?? 0);
    a.checks['ins-positions'] = !floor ? fail('Pick the floor for the new hall') : !okArea ? fail(`The new hall needs ${r.whiteSpaceM2} m²; ${floor.name} has ${Math.max(0, r.floorFreeM2 ?? 0)} m² of usable area left after its ${halls.length} hall(s). Use a site expansion plan instead`) : r.positionsAvail < racks ? fail(`The new hall layout has ${r.positionsAvail} positions for ${racks} racks`) : pass(`New hall of ${r.whiteSpaceM2} m² on ${floor.name} (${r.floorFreeM2} m² free), ${r.positionsAvail} positions for ${racks} racks`);
    if (floor && !okArea) a.shortfall = { kw, what: 'floor area for a new hall', plantIntent: `Site expansion at ${site.dc.name}: a new hall of ${r.whiteSpaceM2} m² for ${kwFmt(kw)} (plan ${plan.plnId} does not fit the existing floors)`, plantTitle: `${site.dc.code} expansion for ${plan.plnId}`, expansion: true };
    const cols = Math.max(1, Math.ceil(Math.sqrt(r.positionsAvail * 2))); r.positions = Array.from({ length: racks }, (_, i) => ({ hallId: 'new', gridX: i % cols, gridY: Math.floor(i / cols) }));
    r.newRows = [...new Set(r.positions.map(p => p.gridY))];
  } else if (hall) {
    r.grid = hallGrid(data, site, hall.id, plan.id);
    const cells = (r.grid?.cells.flat() ?? []).filter(cc => cc.state === 'free' || cc.state === 'empty-rack');
    const capacity = mode === 'shell' ? Math.max(hall.rackCapacity, (r.grid?.cols ?? 0) * (r.grid?.rows ?? 0)) : cells.length;
    r.positionsAvail = Math.min(capacity, cells.length + (mode === 'shell' ? 0 : 0));
    r.designKw = hall.designPowerKw; r.designLeftKw = r1(mode === 'shell' ? hall.designPowerKw - (hb?.reservedKw ?? 0) : hall.designPowerKw - (hb?.loadKw ?? 0) - (hb?.reservedKw ?? 0));
    r.positions = cells.slice(0, racks).map(cc => ({ hallId: hall.id, gridX: cc.x, gridY: cc.y, rackId: cc.rack?.id, rowId: cc.rowId }));
    r.newRows = [...new Set(r.positions.filter(p => !p.rowId).map(p => p.gridY))];
    r.whiteSpaceM2 = mode === 'shell' ? (hall.areaSqm ?? r0(capacity * num(P, 'whiteSpaceM2PerRack', 2.6))) : r0(racks * num(P, 'whiteSpaceM2PerRack', 2.6));
    const liveNote = mode === 'partly-used' && hb ? `; ${hb.racksInstalled} live racks stay out of scope` : '';
    a.checks['ins-positions'] = racks <= r.positionsAvail ? pass(`${racks} racks in ${r.positionsAvail} free positions of ${hall.name}${liveNote}`, `${r.positionsAvail - racks} spare`) : fail(`${racks} racks, ${r.positionsAvail} free positions in ${hall.name}${liveNote}: ${racks - r.positionsAvail} short. Reduce the racks, raise the density, or plan a new hall`, `${racks - r.positionsAvail} short`);
    if (mode === 'shell' && hb && hb.racksInstalled > 0) a.checks['ins-positions'] = fail(`${hall.name} has ${hb.racksInstalled} live racks; it is not a shell hall. Choose "Partly used hall" so only the free positions are planned`);
  } else a.checks['ins-positions'] = fail('Pick the hall (or a floor for a new hall)');
  a.checks['ins-hall-design'] = mode === 'new-hall' ? (newHall ? pass(`New hall designed for ${kwFmt(r.designKw)}`) : fail('Describe the new hall (floor, area, positions)'))
    : !hall ? fail('Pick the hall') : kw <= r.designLeftKw ? pass(`${kwFmt(kw)} within ${kwFmt(r.designLeftKw)} left of ${hall.name}'s ${kwFmt(hall.designPowerKw)} design${mode === 'partly-used' && hb ? ` (${kwFmt(hb.loadKw)} live)` : ''}`) : fail(`${kwFmt(kw)} requested, ${kwFmt(Math.max(0, r.designLeftKw))} left of ${hall.name}'s ${kwFmt(hall.designPowerKw)} design${mode === 'partly-used' && hb ? ` (${kwFmt(hb.loadKw)} already live)` : ''}: short by ${kwFmt(kw - r.designLeftKw)}`);
  // Site power chain.
  a.checks['ins-site-power'] = sitePowerCheck(b, kw);
  // Cooling: the hall's zone (shared halls counted), then CRAH and liquid.
  const zone = hall ? site.cooling.zones.find(z => z.zone.id === hall.coolingZoneId) : undefined;
  r.zone = zone; r.zoneSharedWith = zone ? zone.hallIds.filter(id => id !== hall?.id).map(id => byId(data, 'halls', id)?.name ?? id) : [];
  const zoneFree = zone ? Math.max(0, zone.headroomKw) : 0;
  const crahNeedKw = Math.max(0, airKw - zoneFree);
  r.crah = { units: crahNeedKw > 0 ? Math.ceil((crahNeedKw * 1.1) / r.crah.unitKw) + 1 : 0, unitKw: r.crah.unitKw, coversKw: r1(crahNeedKw) };
  const facilityNeed = r1(liquidKw + r.crah.coversKw);
  a.checks['ins-zone-cooling'] = !zone ? (r.crah.units ? warn(`${mode === 'new-hall' ? 'New hall' : `${hall?.name ?? 'Hall'} has no cooling zone`}: ${r.crah.units} CRAH units of ${r.crah.unitKw} kW (N+1) in the bill take ${kwFmt(airKw)} of air heat`) : na('No air heat to remove'))
    : airKw <= zoneFree ? pass(`${kwFmt(airKw)} of air heat within ${kwFmt(zoneFree)} free in ${zone.zone.name}${r.zoneSharedWith.length ? ` (shared with ${r.zoneSharedWith.join(', ')}; their load is counted)` : ''}`)
    : warn(`${zone.zone.name} has ${kwFmt(zoneFree)} free${r.zoneSharedWith.length ? ` and also serves ${r.zoneSharedWith.join(', ')}` : ''}; ${kwFmt(airKw)} of air heat. ${r.crah.units} new CRAH units (${kwFmt(r.crah.coversKw)} plus one spare) are in the bill and need chilled water (see facility water)`);
  const chillers = (groupBy(data, 'chillers', 'dataCenterId').get(site.dc.id) ?? []).length; const fw = site.cooling.facilityWaterHeadroomKw;
  a.checks['ins-facility-water'] = facilityNeed <= 0 ? na('No new water-cooled units in this hall')
    : !chillers ? (liquidKw > 0 ? fail(`${kwFmt(facilityNeed)} of facility water needed (${kwFmt(liquidKw)} liquid${r.crah.coversKw ? `, ${kwFmt(r.crah.coversKw)} new CRAH` : ''}); no chiller or dry cooler is recorded at ${site.dc.code}. Plan the heat rejection (linked plant plan)`) : warn(`Not checked: no chillers or dry coolers recorded at ${site.dc.code}; confirm ${kwFmt(facilityNeed)} of chilled water for the new CRAH units`))
    : facilityNeed <= fw ? pass(`${kwFmt(facilityNeed)} within ${kwFmt(fw)} of chiller headroom (one unit lost)`) : fail(`${kwFmt(facilityNeed)} of facility water needed, ${kwFmt(fw)} of chiller headroom: short by ${kwFmt(facilityNeed - fw)}`);
  if (a.checks['ins-facility-water'].status === 'fail') a.shortfall = a.shortfall ?? { kw: r1(facilityNeed - Math.max(0, fw)), what: 'facility water (chillers or dry coolers)', plantIntent: `Add ${kwFmt(facilityNeed - Math.max(0, fw))} of chiller or dry-cooler capacity at ${site.dc.name} for plan ${plan.plnId}`, plantTitle: `${site.dc.code} · heat rejection for ${plan.plnId}` };
  const hotSetpoint = num(P, 'inletSetpointC', 24) > 27;
  a.checks['ins-setpoint'] = !hotSetpoint ? pass(`${num(P, 'inletSetpointC', 24)} °C inlet, inside the recommended envelope`) : zone && r.zoneSharedWith.length ? warn(`${num(P, 'inletSetpointC', 24)} °C raises the inlet for every hall on ${zone.zone.name} (${r.zoneSharedWith.join(', ')}), not only this one; keep the zone setpoint and set the liquid supply temperature separately`) : warn(`${num(P, 'inletSetpointC', 24)} °C is above the 27 °C recommended envelope for the air-cooled classes`);
  // Distribution: hall PDUs (existing), new floor PDUs for shell and new halls. UPS stays with the site plant.
  const sides = hall ? hallPduSides(data, hall.id, plan.id) : [];
  r.existingPduHeadroom = { A: r1(sides.filter(s => s.side === 'A').reduce((s, x) => s + Math.max(0, x.headroomKw), 0)), B: r1(sides.filter(s => s.side === 'B').reduce((s, x) => s + Math.max(0, x.headroomKw), 0)) };
  const pduShort = Math.max(0, kw - Math.min(r.existingPduHeadroom.A, r.existingPduHeadroom.B || r.existingPduHeadroom.A));
  r.pduPerSide = mode === 'partly-used' ? Math.ceil(pduShort / pricing.sizing('floor-pdu-kw')) : Math.ceil(kw / pricing.sizing('floor-pdu-kw'));
  a.checks['ins-pdu'] = mode !== 'partly-used' ? pass(`${r.pduPerSide} new floor PDUs per side (${pricing.sizing('floor-pdu-kw')} kW each) fed from the site UPS`) : !sides.length ? warn(`Not checked: no PDUs recorded in ${hall?.name}; ${r.pduPerSide} new floor PDUs per side priced`) : pduShort ? warn(`Existing PDUs have ${kwFmt(r.existingPduHeadroom.A)} (A) and ${kwFmt(r.existingPduHeadroom.B)} (B) free; ${r.pduPerSide} new floor PDUs per side cover the rest`) : pass(`Existing PDUs have ${kwFmt(r.existingPduHeadroom.A)} (A) and ${kwFmt(r.existingPduHeadroom.B)} (B) free for ${kwFmt(kw)}`);
  // Network: leaves to the existing spines, or an even number of new spines.
  const sp = spinePorts(data, site.dc.id, uplinkGbps * 1000);
  r.spine = { spines: sp.spines.length, free: sp.free, need: r.uplinks };
  r.newSpines = sp.free >= r.uplinks && sp.spines.length ? 0 : Math.max(2, Math.ceil(r.uplinks / 32) + (Math.ceil(r.uplinks / 32) % 2));
  a.checks['ins-spine-ports'] = sp.free >= r.uplinks && sp.spines.length ? pass(`${r.uplinks} × ${uplinkGbps}G uplinks on ${sp.spines.length} existing spines (${sp.free} free ports)`) : warn(`${sp.spines.length ? `${sp.free} free ${uplinkGbps}G ports on ${sp.spines.length} existing spines` : 'No spine switches recorded at the site'}; ${r.newSpines} new spines (an even number, one per plane) are in the bill`);
  a.network = { leaves: r.leaves, spines: r.newSpines, uplinks: r.uplinks, uplinkGbps, accessPorts: racks * 48 };
  const rowsUsed = new Set(r.positions.map(p => p.gridY)).size;
  const contained = mode === 'partly-used' ? r.newRows.length : Math.ceil(rowsUsed / 2);
  const rowTypes = [...new Set(r.positions.map(p => p.rowId && byId(data, 'rows', p.rowId)?.containment).filter(Boolean))];
  a.checks['ins-containment'] = rowTypes.includes('None') ? warn('Some rows have no containment; the fit-out adds it') : pass(`${contained} contained aisle${contained === 1 ? '' : 's'}${rowTypes.length ? ` matching the ${rowTypes.join('/').toLowerCase()} rows` : ''}`);
  // IP from the site container, per hall.
  const hosts = classes.reduce((s, x) => s + x.racks * itPerRack(data, x.name as RackClassName, x.kw).units, 0);
  podHallIp(b, racks, hosts, r.leaves, r.newSpines, hall?.name ?? newHall?.name ?? 'Hall', hall?.id);
  // Bill, gated on the hall mode.
  const firstPhase = r.phases[0]?.phase.id;
  const perPhase = (base: Omit<InSiteLine, 'priceSource' | 'unitCost' | 'qty'> & { price: Price }, qty: number) => {
    if (r.phases.length <= 1) { add({ ...base, qty, phaseId: firstPhase }); return; }
    let left = qty; r.phases.forEach((p, i) => { const q = i === r.phases.length - 1 ? left : Math.round(qty * p.share); left -= q; add({ ...base, qty: q, phaseId: p.phase.id }); });
  };
  const shellWorks = mode !== 'partly-used';
  if (mode === 'new-hall') add({ category: 'Racks and containment', item: 'White space fit-out', spec: 'Hall enclosure, fire-rated walls and doors on the existing floor', qty: r.whiteSpaceM2, unit: 'm²', price: pricing.price('hall-enclosure-m2'), kind: 'fitout', manufacturer: 'NetBuild Corp', phaseId: firstPhase });
  if (shellWorks) {
    add({ category: 'Racks and containment', item: 'White space fit-out', spec: 'Raised floor or slab finish, ceiling grid, lighting, containment supports', qty: r.whiteSpaceM2, unit: 'm²', price: pricing.model('White space fit-out'), kind: 'fitout', manufacturer: 'NetBuild Corp', phaseId: firstPhase });
    add({ category: 'Power', item: 'Power distribution unit', spec: `Floor PDU ${pricing.sizing('floor-pdu-kw')} kW, ${r.pduPerSide} per side, fed from the site UPS`, qty: r.pduPerSide * 2, unit: 'each', price: pricing.model('Liebert FPC'), kind: 'pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Liebert FPC', phaseId: firstPhase });
    add({ category: 'Power', item: 'Power distribution unit', spec: 'Overhead busway, A and B runs over every row', qty: r0(rowsUsed * (r.grid?.cols ?? Math.ceil(racks / Math.max(1, rowsUsed))) * POSITION_W_M * 2 + rowsUsed * 6), unit: 'm', price: pricing.price('busway-m'), kind: 'pdu', leadItem: 'PDU', manufacturer: 'Vertiv', phaseId: firstPhase });
    add({ category: 'Fire and security', item: 'Suppression system', spec: `${str(P, 'suppressionType', 'Clean agent gas')} for the hall`, qty: 1, unit: 'hall', price: pricing.model('Clean agent system'), kind: 'suppression', manufacturer: 'CBRE', phaseId: firstPhase });
    add({ category: 'Fire and security', item: 'Very early smoke detection', spec: 'Aspirating detection for the hall', qty: 1, unit: 'hall', price: pricing.model('Aspirating detection'), kind: 'vesda', manufacturer: 'CBRE', phaseId: firstPhase });
    add({ category: 'Fire and security', item: 'Access control and CCTV', spec: 'Hall doors on the site security system', qty: 1, unit: 'hall', price: pricing.model('Security system'), kind: 'access', manufacturer: 'CBRE', phaseId: firstPhase });
    add({ category: 'Monitoring', item: 'Building management and DCIM sensors', spec: 'Power, temperature, humidity and leak sensors for the hall', qty: 1, unit: 'hall', price: pricing.model('BMS and DCIM sensors'), kind: 'bms', manufacturer: 'Schneider', phaseId: firstPhase });
    add({ category: 'Power', item: 'Electrical installation', spec: 'Busway, PDU cabling, earthing and testing', qty: Math.ceil(kw), unit: 'kW', price: pricing.price('electrical-install-kw'), kind: 'install', manufacturer: 'NetBuild Corp', phaseId: firstPhase });
  } else if (r.pduPerSide) {
    add({ category: 'Power', item: 'Power distribution unit', spec: `Floor PDU ${pricing.sizing('floor-pdu-kw')} kW fed from the site UPS (existing PDUs are short)`, qty: r.pduPerSide * 2, unit: 'each', price: pricing.model('Liebert FPC'), kind: 'pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Liebert FPC', phaseId: firstPhase });
  }
  if (contained) add({ category: 'Racks and containment', item: 'Aisle containment', spec: 'Doors and roof per contained aisle, matching the rows', qty: contained, unit: 'aisle', price: pricing.model('SmartAisle containment'), kind: 'containment', leadItem: 'Racks and containment', manufacturer: 'Vertiv', model: 'SmartAisle containment', phaseId: firstPhase });
  const reuse = r.positions.filter(p => p.rackId).length;
  const rackModel = num(P, 'rackUnitsNeeded', 48) > 42 ? 'NetShelter SX 48U' : 'VR3300 42U';
  perPhase({ category: 'Racks and containment', item: 'Rack', spec: `${rackModel}${reuse ? `; ${reuse} empty cabinets in place are reused` : ''}`, unit: 'each', price: pricing.model(rackModel), kind: 'rack', leadItem: 'Racks and containment', manufacturer: vendorOf('rack', rackModel), model: rackModel }, Math.max(0, racks - reuse));
  perPhase({ category: 'Power', item: 'Rack power strips', spec: classes.some(x => x.cooling === 'liquid') ? '32 A three-phase metered, A and B (63 A for the liquid class)' : '32 A three-phase metered, A and B', unit: 'each', price: pricing.model('Geist rPDU 3-phase'), kind: 'rack-pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Geist rPDU 3-phase' }, racks * 2);
  if (!shellWorks) perPhase({ category: 'Power', item: 'Electrical installation', spec: 'New circuits from the hall PDUs, A and B', unit: 'circuit', price: pricing.price('feed-circuit'), kind: 'install', manufacturer: 'NetBuild Corp' }, racks * 2);
  if (r.crah.units) add({ category: 'Cooling', item: 'Computer room air handler', spec: `${r.crah.unitKw} kW chilled water, N+1 (${r.crah.units} units, positions on the hall perimeter)`, qty: r.crah.units, unit: 'each', price: pricing.model('Liebert PEX4'), kind: 'crah', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', model: 'Liebert PEX4', phaseId: firstPhase });
  if (liquidKw > 0) {
    r.cdus = Math.ceil(liquidKw / pricing.sizing('cdu-facility-kw')) + 1;
    add({ category: 'Cooling', item: 'Coolant distribution unit', spec: `${pricing.sizing('cdu-facility-kw')} kW, N+1 for ${kwFmt(liquidKw)} captured to liquid (${r0(capture * 100)}%)`, qty: r.cdus, unit: 'each', price: pricing.model('Liebert XDU1350'), kind: 'cdu', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', model: 'Liebert XDU1350', phaseId: firstPhase });
    const lr = classes.filter(x => x.cooling === 'liquid').reduce((s, x) => s + x.racks, 0);
    add({ category: 'Cooling', item: 'Secondary fluid network', spec: 'Manifolds, valves and leak detection per liquid rack', qty: lr, unit: 'rack', price: pricing.model('Manifolds and leak detection'), kind: 'sfn', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', phaseId: firstPhase });
  }
  if (r.crah.units || liquidKw > 0) add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Chilled-water pipework, valves and controls to the new units', qty: Math.ceil(r.crah.coversKw + liquidKw), unit: 'kW', price: pricing.price('mechanical-install-kw'), kind: 'install', manufacturer: 'NetBuild Corp', phaseId: firstPhase });
  networkLines(b, r.leaves, r.uplinks, uplinkGbps, r.newSpines, racks);
  itLines(b, classes.map(x => ({ cls: x.name as RackClassName, racks: x.racks, it: itPerRack(data, x.name as RackClassName, x.kw) })), r.phases);
  add({ category: 'Monitoring', item: 'Installation and integration', spec: 'Commissioning levels 1 to 5 (factory, site, pre-functional, functional, integrated)', qty: Math.ceil(kw), unit: 'kW', price: pricing.price('cx-kw'), kind: 'install', manufacturer: 'NetBuild Corp', phaseId: r.phases[r.phases.length - 1]?.phase.id });
  a.cooling = { ...a.cooling, units: r.crah.units + r.cdus, capacityKw: r.crah.units * r.crah.unitKw };
  a.plant = [{ name: 'Floor PDUs (new)', kind: 'pdu', capacityKw: pricing.sizing('floor-pdu-kw'), count: shellWorks || r.pduPerSide ? r.pduPerSide * 2 : 0, redundancy: 'A and B' }, { name: 'CRAH units (new)', kind: 'cooling', capacityKw: r.crah.unitKw, count: r.crah.units, redundancy: 'N+1' }, { name: 'CDUs', kind: 'cdu', capacityKw: pricing.sizing('cdu-facility-kw'), count: r.cdus, redundancy: 'N+1' }].filter(x => x.count > 0) as InSiteAnalysis['plant'];
}

/* ================================================================== retrofit */
function retrofitAnalysis(b: Bits, ready: boolean) {
  const { a, P, plan, pricing, add, data, site } = b;
  const coolingType = str(P, 'coolingType', 'liquid-to-chip');
  const capturePct = coolingType === 'rear-door' ? 90 : coolingType === 'immersion' ? 100 : num(P, 'liquidCapturePct', 75);
  const capture = capturePct / 100;
  const cduType = (str(P, 'cduType', 'In-row') as CduPlan['type']);
  // A scenario that lowers the density lowers the target of each selected rack; it never adds racks.
  const cap = Number(b.c.scenario?.overrides?.densityKwPerRack ?? 0) || undefined;
  const sel = (plan.inSite?.retrofit ?? []).map(x => (cap && x.targetKw > cap ? { ...x, targetKw: cap } : x));
  const gpuShare = plan.demand.gpuPct / 100;
  const hall = data ? byId(data, 'halls', str(P, 'targetHallId')) : undefined;
  const rows = ready ? retrofitRows(data, sel, gpuShare, coolingType === 'liquid-to-chip' || coolingType === 'immersion') : [];
  const todayKw = r1(rows.reduce((s, x) => s + x.todayKw, 0)); const targetKw = r1(rows.reduce((s, x) => s + x.targetKw, 0)) || (ready ? 0 : plan.designPowerKw);
  const deltaKw = r1(rows.reduce((s, x) => s + x.deltaKw, 0)) || (ready ? 0 : num(P, 'addedKw', Math.max(0, plan.designPowerKw - num(P, 'currentKw', 0))));
  const liquidKw = r1(targetKw * capture);
  const r: RetrofitResult = { hall, rows, todayKw, targetKw, deltaKw, capturePct, coolingType, liquidKw, zones: [], facilityWater: { needKw: liquidKw, headroomKw: 0, chillers: 0 }, cdu: { type: cduType, unitKw: 0, loops: [], units: 0, positions: 0 }, uprate: { circuitsPerSide: 0, deltaKw, pdu: { A: 0, B: 0 }, freeCircuits: { A: 0, B: 0 } }, gpuServers: rows.reduce((s, x) => s + x.gpuServers, 0), waves: plan.waves ?? [], wavesProposed: false, swing: [], drainRacks: 0, reinforce: 0, kits: 0, newCabinets: 0, ready: 0, services: 0, customers: 0, critical: 0, revenueMonthly: 0 };
  a.retrofit = r;
  a.addedKw = deltaKw; a.drawKw = deltaKw; a.racks = rows.length || sel.length;
  a.commissioningLevel = 5;
  a.classes = rows.length ? [{ name: gpuShare >= 0.5 ? 'GPU' : 'Compute', kw: r1(targetKw / rows.length), racks: rows.length, sharePct: 100 }] : [];
  a.cooling = { type: coolingType, units: 0, unitKw: 0, capacityKw: 0, liquidRequired: rows.some(x => x.targetKw > 30), redundancy: 'N+1 per loop' };
  if (!ready) return;
  if (!rows.length) {
    for (const k of ['ins-zone-cooling', 'ins-facility-water', 'ins-cdu', 'ins-uprate', 'ins-weight', 'ins-waves', 'ins-pdu']) a.checks[k] = na('Not checked: no racks selected for the retrofit yet');
    a.checks['ins-site-power'] = na('Not checked: no racks selected for the retrofit yet');
    a.checks['ins-setpoint'] = na('Not checked: no racks selected yet');
    return;
  }
  const imp = impactOf(data, { rackIds: rows.map(x => x.rack.id) });
  r.services = imp.services.length; r.customers = imp.customers.length; r.critical = imp.critical; r.revenueMonthly = imp.revenueMonthly;
  r.ready = rows.filter(x => x.readiness === 'ready').length; r.kits = rows.filter(x => x.readiness === 'kit').length; r.newCabinets = rows.filter(x => x.readiness === 'new-cabinet').length;
  // Site power on the delta.
  a.checks['ins-site-power'] = sitePowerCheck(b, deltaKw);
  // Residual air heat per zone: target × (1 − capture) replaces today's air load on the converted racks.
  const byZone = new Map<string, RetrofitRow[]>(); for (const x of rows) byZone.set(x.zoneId ?? '', [...(byZone.get(x.zoneId ?? '') ?? []), x]);
  r.zones = [...byZone.entries()].map(([zid, xs]) => { const zone = site.cooling.zones.find(z => z.zone.id === zid); if (!zone) return undefined; const residual = r1(xs.reduce((s, x) => s + x.targetKw * (1 - capture) - x.todayKw, 0)); const airLeft = (groupBy(data, 'racks', 'coolingZoneId').get(zid) ?? []).filter(rk => rk.status === 'Active' && !rows.some(x => x.rack.id === rk.id)).length; return { zone, residualKw: residual, airRacksLeft: airLeft }; }).filter((x): x is RetrofitResult['zones'][number] => !!x);
  const overZones = r.zones.filter(z => z.residualKw > z.zone.headroomKw);
  a.checks['ins-zone-cooling'] = !r.zones.length ? na('Not checked: the selected racks have no cooling zone') : overZones.length
    ? fail(overZones.map(z => `${z.zone.zone.name}: ${kwFmt(z.residualKw)} of residual air heat (${100 - capturePct}% not captured) against ${kwFmt(z.zone.headroomKw)} free with one unit lost`).join('; ') + '. Add rear doors or CRAH capacity, or raise the capture')
    : pass(r.zones.map(z => `${z.zone.zone.name}: ${z.residualKw >= 0 ? `${kwFmt(z.residualKw)} added` : `${kwFmt(-z.residualKw)} released`} of air heat, ${kwFmt(z.zone.headroomKw)} free`).join('; '));
  if (overZones.length) a.shortfall = a.shortfall ?? { kw: r1(overZones.reduce((s, z) => s + z.residualKw - z.zone.headroomKw, 0)), what: 'room cooling for the residual air heat', plantIntent: `Add ${kwFmt(overZones.reduce((s, z) => s + z.residualKw - z.zone.headroomKw, 0))} of CRAH or rear-door capacity in ${overZones.map(z => z.zone.zone.name).join(', ')} at ${site.dc.name} for plan ${plan.plnId}`, plantTitle: `${site.dc.code} · cooling for ${plan.plnId}` };
  // Facility water from the site's chillers.
  r.facilityWater = { needKw: liquidKw, headroomKw: site.cooling.facilityWaterHeadroomKw, chillers: (groupBy(data, 'chillers', 'dataCenterId').get(site.dc.id) ?? []).length };
  a.checks['ins-facility-water'] = !r.facilityWater.chillers ? fail(`${kwFmt(liquidKw)} of liquid heat needs facility water; no chiller or dry cooler is recorded at ${site.dc.code}, so none is available. Plan the heat rejection in a linked plant plan`)
    : liquidKw <= r.facilityWater.headroomKw ? pass(`${kwFmt(liquidKw)} within ${kwFmt(r.facilityWater.headroomKw)} of chiller headroom (one unit lost)`) : fail(`${kwFmt(liquidKw)} of liquid heat, ${kwFmt(r.facilityWater.headroomKw)} of chiller headroom: short by ${kwFmt(liquidKw - r.facilityWater.headroomKw)}`);
  if (a.checks['ins-facility-water'].status === 'fail') a.shortfall = a.shortfall ?? { kw: r1(liquidKw - Math.max(0, r.facilityWater.headroomKw)), what: 'facility water (chillers or dry coolers)', plantIntent: `Add ${kwFmt(liquidKw - Math.max(0, r.facilityWater.headroomKw))} of dry-cooler or chiller capacity with facility-water pipework at ${site.dc.name} for the liquid retrofit ${plan.plnId}`, plantTitle: `${site.dc.code} · facility water for ${plan.plnId}` };
  // CDUs: per loop with one spare; in-row units take floor positions next to the row.
  const unitKw = cduType === 'In-rack' ? pricing.sizing('cdu-inrack-kw') : cduType === 'In-row' ? pricing.sizing('cdu-inrow-kw') : pricing.sizing('cdu-facility-kw');
  const byRow = new Map<string, RetrofitRow[]>(); for (const x of rows) byRow.set(x.rack.rowId, [...(byRow.get(x.rack.rowId) ?? []), x]);
  const grid = hall ? hallGrid(data, site, hall.id, plan.id) : undefined;
  const loops: CduPlan['loops'] = cduType === 'In-rack' ? rows.map(x => ({ name: x.rack.name, rowId: x.rack.rowId, kw: r1(x.targetKw * capture), units: Math.max(1, Math.ceil((x.targetKw * capture) / unitKw)), positionsNeeded: 0 }))
    : cduType === 'In-row' ? [...byRow.entries()].map(([rowId, xs]) => { const lk = r1(xs.reduce((s, x) => s + x.targetKw * capture, 0)); const units = Math.ceil(lk / unitKw) + 1; const y = xs[0].rack.gridY; const free = grid ? grid.cells[y]?.filter(cc => cc.state === 'free' || cc.state === 'empty-rack').length ?? 0 : undefined; return { name: byId(data, 'rows', rowId)?.name ?? rowId, rowId, kw: lk, units, positionsNeeded: units, positionsFree: free }; })
    : [{ name: `${hall?.name ?? 'Hall'} loop`, kw: liquidKw, units: Math.ceil(liquidKw / unitKw) + 1, positionsNeeded: 0 }];
  r.cdu = { type: cduType, unitKw, loops, units: loops.reduce((s, l) => s + l.units, 0), positions: loops.reduce((s, l) => s + l.positionsNeeded, 0) };
  const shortPos = loops.filter(l => l.positionsFree !== undefined && l.positionsFree < l.positionsNeeded);
  const underSized = loops.filter(l => (cduType === 'In-rack' ? l.units * unitKw : (l.units - 1) * unitKw) < l.kw);
  a.checks['ins-cdu'] = underSized.length ? fail(`${underSized.map(l => l.name).join(', ')}: CDU capacity with one unit lost is below the loop load`) : shortPos.length ? fail(`${shortPos.map(l => `${l.name} needs ${l.positionsNeeded} positions for in-row CDUs, ${l.positionsFree} free in the row`).join('; ')}. Use facility CDUs in a gallery, or give up rack positions`) : pass(`${r.cdu.units} × ${kwFmt(unitKw)} ${cduType.toLowerCase()} CDUs on ${loops.length} loop${loops.length === 1 ? '' : 's'}, ${cduType === 'In-rack' ? 'redundant pumps in each unit' : 'N+1 per loop'}${r.cdu.positions ? `, ${r.cdu.positions} floor positions taken` : ''}`);
  // Power uprate: feeds per rack, hall PDU headroom and free circuits per side.
  const sides = hall ? hallPduSides(data, hall.id, plan.id) : [];
  r.uprate = { circuitsPerSide: rows.reduce((s, x) => s + x.feedsPerSide, 0), deltaKw, pdu: { A: r1(sides.filter(s => s.side === 'A').reduce((s, x) => s + Math.max(0, x.headroomKw), 0)), B: r1(sides.filter(s => s.side === 'B').reduce((s, x) => s + Math.max(0, x.headroomKw), 0)) }, freeCircuits: { A: sides.filter(s => s.side === 'A').reduce((s, x) => s + x.freeOutlets, 0), B: sides.filter(s => s.side === 'B').reduce((s, x) => s + x.freeOutlets, 0) } };
  const up = r.uprate;
  const upProblems = [deltaKw > up.pdu.A ? `side A PDUs have ${kwFmt(up.pdu.A)} free` : '', deltaKw > up.pdu.B ? `side B PDUs have ${kwFmt(up.pdu.B)} free` : '', up.circuitsPerSide > up.freeCircuits.A ? `${up.freeCircuits.A} free circuits on side A` : '', up.circuitsPerSide > up.freeCircuits.B ? `${up.freeCircuits.B} free circuits on side B` : ''].filter(Boolean);
  a.checks['ins-uprate'] = !sides.length ? na(`Not checked: no PDUs recorded in ${hall?.name ?? 'the hall'}`) : upProblems.length ? fail(`${kwFmt(deltaKw)} more on each side and ${up.circuitsPerSide} new circuits per side (${rows.filter(x => x.feedAmps === 63).length} racks at 63 A, ${rows.filter(x => x.feedAmps === 32).length} at 32 A); ${upProblems.join(', ')}`) : pass(`${up.circuitsPerSide} new circuits per side (${rows.map(x => `${x.feedsPerSide} × ${x.feedAmps} A`).filter((v, i, xs) => xs.indexOf(v) === i).join(', ')} at ${acFeedKw(63)} kW per 63 A feed); PDUs have ${kwFmt(up.pdu.A)} (A) and ${kwFmt(up.pdu.B)} (B) free`);
  // Weight: rack rating (or the new cabinet's) and floor.
  const cabKg = pricing.sizing('liquid-cabinet-kg');
  const overRack = rows.filter(x => !x.weightOk && x.readiness !== 'new-cabinet');
  const overCab = rows.filter(x => x.readiness === 'new-cabinet' && x.filledKg > cabKg);
  r.reinforce = rows.filter(x => !x.floorOk).length;
  a.checks['ins-weight'] = overRack.length || overCab.length ? fail(`${[...overRack.map(x => `${x.rack.name} ${x.filledKg} kg filled, rated ${x.maxKg} kg`), ...overCab.map(x => `${x.rack.name} ${x.filledKg} kg above the ${cabKg} kg liquid cabinet`)].join('; ')}`) : r.reinforce ? warn(`${r.reinforce} position${r.reinforce === 1 ? '' : 's'} above the floor rating (${rows.filter(x => !x.floorOk).map(x => `${x.rack.name} ${x.floorKgM2} of ${x.floorRating} kg/m²`).join(', ')}); spreader plates in the bill, structural sign-off needed`) : pass(`Filled weight ${Math.min(...rows.map(x => x.filledKg))} to ${Math.max(...rows.map(x => x.filledKg))} kg within each rack and floor rating`);
  // Setpoint.
  const sp = num(P, 'inletSetpointC', 24);
  const shared = r.zones.filter(z => z.airRacksLeft > 0);
  a.checks['ins-setpoint'] = sp <= 27 ? pass(`${sp} °C inlet kept; the liquid supply temperature is set separately on the CDUs`) : shared.length ? warn(`${sp} °C would raise the inlet for ${shared.reduce((s, z) => s + z.airRacksLeft, 0)} air-cooled racks that share ${shared.map(z => z.zone.zone.name).join(', ')}; keep the zone setpoint and set the CDU supply temperature instead`) : pass(`${sp} °C; every rack on the zone is in the retrofit`);
  a.checks['liquid-above-density'] = rows.some(x => x.targetKw > c_bench(b, 'liquidThresholdKw', 30)) && !['liquid-to-chip', 'immersion', 'rear-door'].includes(coolingType) ? fail(`${rows.filter(x => x.targetKw > 30).length} racks above 30 kW with ${coolingType}`) : pass(`${Math.max(...rows.map(x => x.targetKw))} kW per rack with ${coolingType}`);
  // Waves: drain to swing positions, works, repopulate.
  const rowIds = new Set(rows.map(x => x.rack.rowId));
  r.swing = swingPositions(data, site, rowIds, plan.id);
  r.drainRacks = rows.filter(x => x.devices > 0).length;
  if (!r.waves.length) { r.waves = proposeRetrofitWaves(data, site, plan, rows, r.swing); r.wavesProposed = true; }
  a.checks['ins-waves'] = r.wavesProposed ? fail(`No waves accepted yet: ${r.waves.length} proposed on the Migration step (${byRow.size} row${byRow.size === 1 ? '' : 's'}, drain → works → repopulate)`) : waveCheck(data, site, plan, r);
  // GPU back-end fabric when the mix is GPU-heavy.
  if (plan.demand.gpuPct >= 40 && r.gpuServers > 0) { const ports = r.gpuServers * 8; const leaves = Math.max(2, Math.ceil(ports / 32) + (Math.ceil(ports / 32) % 2)); const spines = Math.max(2, Math.ceil((leaves * 32) / 64) + (Math.ceil((leaves * 32) / 64) % 2)); r.backend = { servers: r.gpuServers, ports, leaves, spines, optics: ports * 2 + leaves * 32 * 2 }; }
  // Bill.
  const loopsCount = loops.length;
  if (cduType === 'Facility') add({ category: 'Cooling', item: 'Coolant distribution unit', spec: `${kwFmt(unitKw)} facility CDU in the gallery, N+1`, qty: r.cdu.units, unit: 'each', price: pricing.model('Liebert XDU1350'), kind: 'cdu', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv', model: 'Liebert XDU1350' });
  else add({ category: 'Cooling', item: 'Coolant distribution unit', spec: `${kwFmt(unitKw)} ${cduType.toLowerCase()} CDU, ${cduType === 'In-row' ? 'N+1 per row loop, one floor position each' : 'one per rack, redundant pumps'}`, qty: r.cdu.units, unit: 'each', price: pricing.price(cduType === 'In-rack' ? 'cdu-inrack' : 'cdu-inrow'), kind: 'cdu', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv' });
  add({ category: 'Cooling', item: 'Secondary fluid network', spec: 'Rack manifold, quick disconnects and door kit (racks not liquid-ready)', qty: r.kits + r.newCabinets, unit: 'rack', price: pricing.model('Manifolds and leak detection'), kind: 'sfn', leadItem: 'CRAH / CDU', manufacturer: 'Vertiv' });
  add({ category: 'Cooling', item: 'Secondary fluid network', spec: 'Hoses and quick disconnects (liquid-ready racks)', qty: r.ready, unit: 'rack', price: pricing.price('hose-kit'), kind: 'sfn', manufacturer: 'Vertiv' });
  add({ category: 'Racks and containment', item: 'Rack', spec: `Liquid-ready cabinet rated ${cabKg} kg, replacing racks not rated for the filled weight`, qty: r.newCabinets, unit: 'each', price: pricing.price('liquid-cabinet'), kind: 'rack', leadItem: 'Racks and containment', manufacturer: 'APC' });
  const rowLenM = (grid?.cols ?? 9) * POSITION_W_M;
  const pipeM = r0(byRow.size * rowLenM * 2 + loopsCount * pricing.sizing('pipe-run-m') * (cduType === 'Facility' ? 2 : 1) * 2);
  add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Facility-water pipework to the CDUs, supply and return (insulated)', qty: pipeM, unit: 'm', price: pricing.price('pipework-m'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Isolation valves: two per rack, four per CDU', qty: rows.length * 2 + r.cdu.units * 4, unit: 'each', price: pricing.price('valve'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Tap-offs from the facility-water main', qty: loopsCount, unit: 'each', price: pricing.price('water-tapoff'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Water treatment and filtration skid per loop', qty: cduType === 'In-rack' ? 1 : loopsCount, unit: 'each', price: pricing.price('water-treatment'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Cooling', item: 'Mechanical installation', spec: 'Flush, fill, pressure hold and water-quality test per loop', qty: cduType === 'In-rack' ? byRow.size : loopsCount, unit: 'loop', price: pricing.price('flush-fill-test'), kind: 'install', manufacturer: 'NetBuild Corp' });
  const p63 = rows.filter(x => x.feedAmps === 63).reduce((s, x) => s + x.feedsPerSide * 2, 0), p32 = rows.filter(x => x.feedAmps === 32).reduce((s, x) => s + x.feedsPerSide * 2, 0);
  add({ category: 'Power', item: 'Rack power strips', spec: '63 A three-phase metered, A and B', qty: p63, unit: 'each', price: pricing.price('rpdu-63a'), kind: 'rack-pdu', leadItem: 'PDU', manufacturer: 'Vertiv' });
  add({ category: 'Power', item: 'Rack power strips', spec: '32 A three-phase metered, A and B', qty: p32, unit: 'each', price: pricing.model('Geist rPDU 3-phase'), kind: 'rack-pdu', leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Geist rPDU 3-phase' });
  add({ category: 'Power', item: 'Electrical installation', spec: 'New circuits and breakers from the hall PDUs, A and B', qty: r.uprate.circuitsPerSide * 2, unit: 'circuit', price: pricing.price('feed-circuit'), kind: 'install', manufacturer: 'NetBuild Corp' });
  add({ category: 'Racks and containment', item: 'Floor reinforcement', spec: 'Spreader plates under positions above the floor rating', qty: r.reinforce, unit: 'position', price: pricing.price('spreader-plate'), kind: 'floor', manufacturer: 'NetBuild Corp' });
  add({ category: 'Monitoring', item: 'Building management and DCIM sensors', spec: 'Leak detection cable per row', qty: byRow.size, unit: 'row', price: pricing.price('leak-detection-row'), kind: 'bms', manufacturer: 'Schneider' });
  add({ category: 'Cooling', item: 'Secondary fluid network', spec: 'Drip trays under each rack manifold', qty: rows.length, unit: 'rack', price: pricing.price('drip-tray'), kind: 'sfn', manufacturer: 'Vertiv' });
  add({ category: 'Monitoring', item: 'Building management and DCIM sensors', spec: 'BMS points for CDU alarms, flow, pressure and leak', qty: r.cdu.units, unit: 'CDU', price: pricing.price('bms-point'), kind: 'bms', manufacturer: 'Schneider' });
  add({ category: 'Monitoring', item: 'Building management and DCIM sensors', spec: 'BMS integration and graphics', qty: 1, unit: 'lot', price: pricing.price('bms-integration'), kind: 'bms', manufacturer: 'Schneider' });
  const moved = rows.reduce((s, x) => s + x.devices, 0);
  add({ category: 'Racks and containment', item: 'Move services', spec: 'De-rack to swing positions and back, per device', qty: moved * 2, unit: 'move', price: pricing.price('move-device'), kind: 'move', manufacturer: 'NetBuild Corp' });
  if (r.backend) {
    add({ category: 'Network', item: 'Leaf switch', spec: `GPU back-end leaf, 64 × 400G (rail-optimised), ${r.backend.ports} server ports`, qty: r.backend.leaves, unit: 'each', price: pricing.price('backend-switch'), kind: 'leaf', leadItem: 'Spine / leaf switches', manufacturer: 'To tender' });
    add({ category: 'Network', item: 'Spine switch', spec: 'GPU back-end spine, 64 × 400G', qty: r.backend.spines, unit: 'each', price: pricing.price('backend-switch'), kind: 'spine', leadItem: 'Spine / leaf switches', manufacturer: 'To tender' });
    add({ category: 'Network', item: 'Optics', spec: '400G transceivers, both ends of every back-end link', qty: r.backend.optics, unit: 'each', price: pricing.model('400G QSFP-DD'), kind: 'optics', leadItem: 'Optics (400G)', manufacturer: 'Corning', model: '400G QSFP-DD' });
  }
  if (bool(P, 'operatorOwnedIt', true) && r.gpuServers) { const it = itPerRack(data, 'GPU', 10); add({ category: 'Compute and storage', item: 'GPU server', spec: `${it.model}, ${it.typicalW} W typical; ${r.gpuServers} across ${rows.length} racks`, qty: r.gpuServers, unit: 'each', price: { value: it.unitPrice, source: 'Approved catalogue price book 2026' }, kind: 'gpu-server', leadItem: 'GPU servers', manufacturer: it.manufacturer, model: it.model, it: true }); }
  add({ category: 'Monitoring', item: 'Installation and integration', spec: 'Level 5 integrated test per loop: flush, pressure hold, leak test, CDU failover, thermal under load', qty: cduType === 'In-rack' ? byRow.size : loopsCount, unit: 'loop', price: pricing.price('liquid-cx-loop'), kind: 'install', manufacturer: 'NetBuild Corp' });
  a.cooling = { ...a.cooling, units: r.cdu.units, unitKw, capacityKw: r.cdu.units * unitKw };
  a.plant = [{ name: `${cduType} CDUs`, kind: 'cdu', capacityKw: unitKw, count: r.cdu.units, redundancy: cduType === 'In-rack' ? 'redundant pumps' : 'N+1 per loop' }];
  a.network = { leaves: r.backend?.leaves ?? 0, spines: r.backend?.spines ?? 0, uplinks: r.backend ? r.backend.leaves * 32 : 0, uplinkGbps: 400, accessPorts: r.backend?.ports ?? 0 };
}

/** Drain → works → repopulate per row, in the next free change nights before go-live. */
export function proposeRetrofitWaves(data: PlannerData, site: SiteBaseline, plan: T.PlannerPlan, rows: RetrofitRow[], swing: T.Rack[]): T.PlannerWave[] {
  const byRow = new Map<string, RetrofitRow[]>(); for (const x of rows) byRow.set(x.rack.rowId, [...(byRow.get(x.rack.rowId) ?? []), x]);
  const out: T.PlannerWave[] = []; const taken: { start: string; end: string }[] = [];
  // Work back from go-live: about three weeks per row (drain, works, repopulate) and two weeks for the level 5 test, so the long-lead CDUs can arrive first.
  let after = new Date(Math.max(clockMs() + 14 * 864e5, new Date(plan.targetGoLive).getTime() - (14 + byRow.size * 21) * 864e5)).toISOString(); let swingAt = 0; let order = 1;
  for (const [rowId, xs] of byRow) {
    const rowName = byId(data, 'rows', rowId)?.name ?? rowId;
    const live = xs.filter(x => x.devices > 0);
    const rackIds = xs.map(x => x.rack.id);
    const devIds = live.flatMap(x => (groupBy(data, 'devices', 'rackId').get(x.rack.id) ?? []).map(d => d.id));
    const svc = impactOf(data, { rackIds }).services.map(s => s.service.id);
    const sw = swing.slice(swingAt, swingAt + live.length).map(s => s.id); swingAt += live.length;
    const drain = nextFreeWindow(data, { dataCenterId: site.dc.id, rackIds, deviceIds: devIds, hours: Math.min(10, 2 + live.length), after, excludePlanId: plan.id, taken }); taken.push(drain);
    out.push({ id: `W${order}`, name: `${rowName} · drain to swing positions`, order: order++, kind: 'drain', deviceIds: devIds, rackIds: live.map(x => x.rack.id), serviceIds: svc, swingRackIds: sw, windowStart: drain.start, windowEnd: drain.end, rollback: 'Move the equipment back into its own racks and re-patch from the port schedule taken before the move', acceptance: 'Every moved service up from the swing positions; no alarms', status: 'Planned', itKw: r1(live.reduce((s, x) => s + x.todayKw, 0)) });
    const worksStart = new Date(new Date(drain.end).getTime() + 12 * 3600e3); const worksEnd = new Date(worksStart.getTime() + (2 + Math.ceil(xs.length / 2)) * 864e5);
    out.push({ id: `W${order}`, name: `${rowName} · manifolds, pipework, flush, fill and pressure test`, order: order++, kind: 'works', deviceIds: [], rackIds, serviceIds: [], windowStart: worksStart.toISOString(), windowEnd: worksEnd.toISOString(), crewHours: 16 * (2 + Math.ceil(xs.length / 2)), rollback: 'Isolate the row loop at the tap-off valves; the row stays drained until the loop passes', acceptance: 'Pressure hold 24 h, leak test passed, water quality in range', status: 'Planned', method: 'Row drained; hot works permit; facility-water tap-off under isolation' });
    taken.push({ start: worksStart.toISOString(), end: worksEnd.toISOString() });
    const rep = nextFreeWindow(data, { dataCenterId: site.dc.id, rackIds, deviceIds: devIds, hours: Math.min(10, 2 + xs.length), after: worksEnd.toISOString(), excludePlanId: plan.id, taken }); taken.push(rep);
    out.push({ id: `W${order}`, name: `${rowName} · repopulate at target density`, order: order++, kind: 'repopulate', deviceIds: devIds, rackIds, serviceIds: svc, swingRackIds: sw, windowStart: rep.start, windowEnd: rep.end, rollback: 'Leave the equipment in the swing positions and open a defect on the loop', acceptance: 'Thermal under load at the target kW; CDU failover test passed; services restored', status: 'Planned', itKw: r1(xs.reduce((s, x) => s + x.targetKw, 0)) });
    after = rep.end;
  }
  return out;
}

function waveCheck(data: PlannerData, site: SiteBaseline, plan: T.PlannerPlan, r: RetrofitResult): CheckResult {
  const problems: string[] = [];
  for (const w of r.waves) {
    if (!w.windowStart || !w.windowEnd) { problems.push(`${w.name}: no window`); continue; }
    if (!w.rollback?.trim()) problems.push(`${w.name}: no rollback`);
    if (w.kind === 'works') continue;
    const cl = clashes(data, { dataCenterId: site.dc.id, rackIds: w.rackIds, deviceIds: w.deviceIds, start: w.windowStart, end: w.windowEnd, excludePlanId: plan.id, excludeChangeIds: w.changeRequestId ? [w.changeRequestId] : [] });
    const block = cl.filter(c => c.severity === 'block');
    if (block.length) problems.push(`${w.name}: clashes with ${block.map(c => c.id).join(', ')}`);
    if (w.kind === 'drain' && (w.swingRackIds?.length ?? 0) < w.rackIds.length) problems.push(`${w.name}: ${w.rackIds.length} racks to drain, ${w.swingRackIds?.length ?? 0} swing positions`);
  }
  const late = r.waves.filter(w => w.windowEnd && new Date(w.windowEnd).getTime() > new Date(plan.targetGoLive).getTime());
  if (late.length) problems.push(`${late.length} wave(s) end after the go-live date`);
  const svc = new Set(r.waves.flatMap(w => w.serviceIds)).size;
  return problems.length ? fail(problems.join('; ')) : pass(`${r.waves.length} waves with windows and rollback, no clashing change; ${svc} services and ${r.customers} customers touched`);
}

/* ================================================================== shared pieces */
function c_bench(b: Bits, metric: string, d: number) { return b.c.benchmarks.find(x => x.metric === metric)?.value ?? d; }
/** A rule's threshold from the plan's template chain (the published ruleset), if set. */
function ruleThreshold(c: ScopeCtx, check: string): number | undefined {
  let t = c.templates.find(x => x.id === c.plan.templateId); const seen = new Set<string>();
  while (t && !seen.has(t.id)) { seen.add(t.id); const r = t.rules.find(x => x.check === check); if (r?.threshold !== undefined) return r.threshold; t = t.inheritsFrom ? c.templates.find(x => x.id === t!.inheritsFrom) : undefined; }
  return undefined;
}

function networkLines(b: Bits, leaves: number, uplinks: number, uplinkGbps: number, newSpines: number, racks: number) {
  const { add, pricing } = b;
  const leafModel = uplinkGbps <= 100 ? '7050X3-48YC8' : undefined;
  add({ category: 'Network', item: 'Leaf switch', spec: uplinkGbps <= 100 ? '7050X3-48YC8: 48 × 25G down, 8 × 100G up' : `48 × 100G down, ${uplinkGbps}G uplinks`, qty: leaves, unit: 'each', price: leafModel ? pricing.model(leafModel) : pricing.price('leaf-400g'), kind: 'leaf', leadItem: 'Spine / leaf switches', manufacturer: leafModel ? 'Arista' : 'To tender', model: leafModel });
  if (newSpines) add({ category: 'Network', item: 'Spine switch', spec: uplinkGbps <= 100 ? 'Nexus 9336C-FX2: 36 × 100G' : `64 × ${uplinkGbps}G`, qty: newSpines, unit: 'each', price: uplinkGbps <= 100 ? pricing.model('Nexus 9336C-FX2') : pricing.price('spine-400g'), kind: 'spine', leadItem: 'Spine / leaf switches', manufacturer: uplinkGbps <= 100 ? 'Cisco' : 'To tender', model: uplinkGbps <= 100 ? 'Nexus 9336C-FX2' : undefined });
  const optic = uplinkGbps <= 100 ? pricing.price('optic-100g') : uplinkGbps >= 800 ? pricing.price('optic-800g') : pricing.model('400G QSFP-DD');
  add({ category: 'Network', item: 'Optics', spec: `${uplinkGbps}G transceivers, both ends of each uplink`, qty: uplinks * 2, unit: 'each', price: optic, kind: 'optics', leadItem: 'Optics (400G)', manufacturer: 'Corning', model: uplinkGbps === 400 ? '400G QSFP-DD' : undefined });
  add({ category: 'Cabling', item: 'Fibre trunk', spec: 'MPO-24, leaf to spine', qty: leaves * 2, unit: 'each', price: pricing.model('MPO-24 trunk'), kind: 'fibre', leadItem: 'Fibre trunks', manufacturer: 'Corning', model: 'MPO-24 trunk' });
  add({ category: 'Cabling', item: 'Copper and DAC', spec: 'In-rack server cabling', qty: racks, unit: 'rack', price: pricing.model('DAC and copper kit'), kind: 'dac', manufacturer: 'Corning', model: 'DAC and copper kit' });
  add({ category: 'Network', item: 'Out-of-band switch', spec: 'OM2248 console server, one per 16 racks', qty: Math.max(1, Math.ceil(racks / 16)), unit: 'each', price: pricing.model('OM2248 Console Server'), kind: 'oob', manufacturer: 'Opengear', model: 'OM2248 Console Server' });
}

function itLines(b: Bits, cls: { cls: RackClassName; racks: number; it: ItRack }[], phases?: HallResult['phases']) {
  const { add, P } = b;
  if (!bool(P, 'operatorOwnedIt', true)) return;
  for (const x of cls) {
    if (!x.it.units || !x.racks) continue;
    const kind: ItemKind = x.cls === 'GPU' ? 'gpu-server' : x.cls === 'Storage' ? 'storage' : 'server';
    const base = { category: 'Compute and storage' as BomCategory, item: CATALOGUE[kind].label, spec: `${x.cls} racks: ${x.it.basis}`, unit: 'each', price: { value: x.it.unitPrice, source: 'Approved catalogue price book 2026' }, kind, leadItem: x.cls === 'GPU' ? 'GPU servers' : 'General servers', manufacturer: x.it.manufacturer, model: x.it.model, it: true };
    const qty = x.it.units * x.racks;
    if (phases && phases.length > 1) { let left = qty; phases.forEach((p, i) => { const q = i === phases.length - 1 ? left : Math.round(qty * p.share); left -= q; add({ ...base, qty: q, phaseId: p.phase.id }); }); }
    else add({ ...base, qty, phaseId: phases?.[0]?.phase.id });
  }
}

/** Pod and hall prefixes carved from the site container; loopbacks only for the new switches. */
function podHallIp(b: Bits, racks: number, hosts: number, leaves: number, newSpines: number, scope: string, hallId?: string) {
  const { a, data, site, plan, P } = b;
  const alloc = new Allocator(data, { excludePlanId: plan.id });
  const items: IpItem[] = []; const vlans: IpPlan['vlans'] = [];
  const carve = (purpose: IpItem['purpose'], name: string, n: number, vlanFrom: number | undefined, notes: string) => {
    const prefix = purpose === 'Loopback' || purpose === 'Transit' ? Math.max(24, Math.min(31, 32 - Math.ceil(Math.log2(Math.max(2, n))))) : prefixForHosts(n);
    const got = alloc.atSite(site.dc.id, prefix, name); if (!got.cidr) return;
    const vlan = vlanFrom !== undefined ? alloc.vlan(site.dc.id, vlanFrom) : undefined;
    const [ip] = got.cidr.split('/');
    const gw = purpose === 'Loopback' || purpose === 'Transit' ? undefined : ip.replace(/\d+$/, d => String(Number(d) + 1));
    items.push({ id: `IP${items.length + 1}`, scope, purpose, name, cidr: got.cidr, prefix, hosts: 2 ** (32 - prefix) - (prefix >= 31 ? 0 : 3), vlan, gateway: gw, notes: `${notes}; carved from ${got.parent?.cidr ?? 'the site container'}${hallId ? `, hall ${hallId}` : ''}` });
    if (vlan) vlans.push({ number: vlan, name, purpose, scope });
  };
  carve('Production', `${scope} servers`, Math.max(16, Math.ceil(hosts * 1.25)), 200, `${hosts} hosts plus 25% growth`);
  if (plan.demand.storagePct > 0) carve('Storage', `${scope} storage`, Math.max(16, Math.ceil(hosts * plan.demand.storagePct / 100 * 2)), 300, 'storage network');
  carve('Management', `${scope} management`, Math.max(16, hosts + racks * 2 + leaves), 100, 'BMC, power strips and switch management');
  const devices = leaves + newSpines;
  if (devices) carve('Loopback', `${scope} loopbacks`, devices, undefined, `${devices} new switches, one /32 each`);
  const links = leaves * num(P, 'uplinksPerLeaf', 4);
  if (links) carve('Transit', `${scope} leaf uplinks`, links * 2, undefined, `${links} uplinks as /31 pairs`);
  const container = alloc.containers(site.dc.id)[0];
  const used = items.reduce((s, i) => s + 2 ** (32 - i.prefix), 0);
  a.ip = { aggregate: container?.cidr ?? '—', items, vlans, asns: [], usedAddresses: used, totalAddresses: container?.totalHosts ?? 0, warnings: alloc.warnings, addresses: [] };
  a.checks['ins-ip'] = alloc.warnings.length ? fail(alloc.warnings.join('; ')) : !container ? fail(`${site.dc.code} has no container subnet in IPAM`) : pass(`${items.length} prefixes carved from ${container.cidr} with no overlap; VLANs ${vlans.map(v => v.number).join(', ')} are free at the site`);
}

/* ================================================================== wizard helpers */
/** What the site picker shows per hall: free positions, hall and zone headroom. */
export function hallRows(site: SiteBaseline | undefined) {
  return (site?.halls ?? []).map(h => { const z = site!.cooling.zones.find(zz => zz.zone.id === h.hall.coolingZoneId); return { hb: h, zone: z, zoneHeadroomKw: z?.headroomKw, shared: (z?.hallIds.length ?? 0) > 1 }; });
}
export const isInSite = (scope: T.PlannerScope): scope is InSiteType => (IN_SITE_TYPES as string[]).includes(scope);
export { RACK_BLOCK_PCT, RACK_WARN_PCT };
