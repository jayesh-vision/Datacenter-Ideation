/**
 * Planner engine — pure functions that turn a plan (template + parameters + demand + phases)
 * into sizing, a capacity ladder, a cost estimate with a cash flow, rule findings, a schedule and
 * sustainability figures. Nothing here reads the DOM or React; the hooks in usePlanner.ts feed it.
 *
 * The physics, in short (each figure carries its basis):
 *   - Facility load = IT × (design PUE + peak allowance); MVA = facility kW ÷ power factor.
 *   - Each power path is checked at its redundancy: 2N → each side carries the whole load,
 *     N+1 → everything but the largest unit carries it. Transformers in kVA, generators in kVA at
 *     0.8 pf, UPS as modules per hall per side; an HV substation when the intake is 66 kV or more.
 *   - Rack classes come from the workload mix and are normalised so the racks and the kW add up.
 *     Liquid classes reject part of their heat to water (capture share); the rest needs air units.
 *     Heat rejection (dry, adiabatic, chillers) follows the loop temperature and the climate.
 *   - Building area = white space × support ratio + plant rooms per facility MW (+ yard outside).
 *   - Cost: MEP and fit-out from the CapEx/kW benchmark, shell and land as their own lines,
 *     IT from the catalogue quantity model, contingency as its own line, then a yearly cash flow.
 *   - Schedule: per phase, lead times from the benchmarks (the same figure the bill of materials
 *     shows), contingency as a separate buffer; stock needs only a transfer; after approval
 *     "late" comes from the plan's purchase orders.
 *
 * Every derived number carries a `source` so the UI can show where it came from.
 */
import type * as T from '../p2b/types';
import { dcTypeProfile, plantPlan } from '../p2b/dcTypes';
import { CATALOGUE, chooseOption, freeStock, itQuantities, priceOf, upsOptionFor, type ItemKind, type ItQuantities } from './catalogue';
import { cashflowFor, contingency as contingencyLine, usdPerGbpsMonth, type CapexItem, type CashflowInput, type OpexItem, type RevenueStream } from './finance';
import type { PlannerData } from './plannerData';
import { campusBaseline, planAddedKw, siteBaseline } from './site';
import { modelFor, type CheckResult, type ScopeCtx } from './scopes';
import { buildBom, type Bom, type BomCategory } from './outputs';
import { MATERIAL_CHANGES_ITEM, compareBoms, materialsEstimateLine, scheduleWithMaterials, type MaterialsEffect } from './materials';
import { clockMs } from '../compat/clock';
import { plannerMoney } from '../compat/registry';

export type ParamValue = number | string | boolean;
export interface Sourced<V = number> { value: V; source: T.PlannerParamSource; note?: string }

export interface EstateActuals {
  /** Real average kW per rack for racks of this site type (from DCIM). */
  kwPerRack?: number;
  /** Real PUE achieved by sites of this type. */
  pue?: number;
  /** CapEx per kW from delivered programmes of this type (budget ÷ design kW). */
  capexPerKw?: number;
  /** Utilisation of installed power at live sites of this type. */
  powerUtilPct?: number;
  /** Average fit-out duration from delivery actuals, weeks. */
  fitoutWeeks?: number;
  sampleSites: number;
  sampleRacks?: number;
}

export interface ResolvedTemplate { template: T.PlannerTemplate; chain: T.PlannerTemplate[]; params: T.PlannerParamDef[]; rules: T.PlannerRuleDef[] }

/** Walk `inheritsFrom` up to the root; nearer templates override parameters and add rules. */
export function resolveTemplate(templateId: string, all: T.PlannerTemplate[]): ResolvedTemplate | null {
  const byId = new Map(all.map(t => [t.id, t]));
  const chain: T.PlannerTemplate[] = [];
  let cur = byId.get(templateId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) { chain.push(cur); seen.add(cur.id); cur = cur.inheritsFrom ? byId.get(cur.inheritsFrom) : undefined; }
  if (!chain.length) return null;
  const params = new Map<string, T.PlannerParamDef>();
  const rules = new Map<string, T.PlannerRuleDef>();
  for (const t of [...chain].reverse()) { t.params.forEach(p => params.set(p.key, p)); t.rules.forEach(r => rules.set(r.id, r)); }
  return { template: chain[0], chain, params: [...params.values()], rules: [...rules.values()] };
}

/** Effective parameters: template defaults, then the plan, then the scenario overrides. */
export function effectiveParams(resolved: ResolvedTemplate | null, plan: T.PlannerPlan, scenario?: T.PlannerScenario | null, profileTemplate?: T.PlannerTemplate | null): Record<string, Sourced<ParamValue>> {
  const out: Record<string, Sourced<ParamValue>> = {};
  for (const p of profileTemplate?.params ?? []) if (p.default !== undefined) out[p.key] = { value: p.default, source: 'template', note: `${profileTemplate!.name} profile` };
  for (const p of resolved?.params ?? []) if (p.default !== undefined && !out[p.key]) out[p.key] = { value: p.default, source: 'template', note: resolved!.template.name };
  for (const [k, v] of Object.entries(plan.params)) out[k] = { value: v, source: plan.paramSources[k] ?? 'user' };
  for (const [k, v] of Object.entries(scenario?.overrides ?? {})) out[k] = { value: v, source: 'user', note: `scenario ${scenario!.name}` };
  return out;
}

type P = Record<string, Sourced<ParamValue>>;
const num = (p: P, k: string, d = 0) => { const v = p[k]?.value; return typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
const str = (p: P, k: string, d = '') => { const v = p[k]?.value; return v === undefined ? d : String(v); };
const bool = (p: P, k: string, d = false) => { const v = p[k]?.value; return typeof v === 'boolean' ? v : d; };
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const WEEK = 7 * 864e5;

export const WHOLE_SITE_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio'];
/** Scopes that build a site or building (and its plant). */
export const BUILD_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio', 'edge'];
const REPLACE_SCOPES: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];
/** Scopes whose phases are separate design units that must each carry a date. */
const PHASED_SCOPES: T.PlannerScope[] = ['new-dc', 'expansion', 'portfolio', 'edge', 'hall'];
const LIQUID_TYPES: T.PlannerCoolingType[] = ['liquid-to-chip', 'immersion'];

const bmFind = (benchmarks: T.PlannerBenchmark[], metric: string, match?: Partial<T.PlannerBenchmark['appliesTo']>) =>
  (match ? benchmarks.find(b => b.metric === metric && Object.entries(match).every(([k, v]) => (b.appliesTo as Record<string, unknown>)[k] === v)) : undefined) ?? benchmarks.find(b => b.metric === metric && !Object.keys(b.appliesTo ?? {}).length) ?? benchmarks.find(b => b.metric === metric);

/* ================================================================== climate */
/** Design-day temperatures per climate (ASHRAE 0.4% values for representative cities); overridden by benchmarks. */
export const CLIMATE_DESIGN: Record<T.PlannerPlan['climate'], { dryBulbC: number; wetBulbC: number; city: string }> = {
  cold: { dryBulbC: 27, wetBulbC: 18, city: 'Stockholm / Dublin' },
  temperate: { dryBulbC: 32, wetBulbC: 21, city: 'Frankfurt / Ashburn' },
  'hot-dry': { dryBulbC: 43, wetBulbC: 23, city: 'Phoenix / Riyadh' },
  'hot-humid': { dryBulbC: 36, wetBulbC: 28, city: 'Singapore / Houston' },
};
function designTemps(climate: T.PlannerPlan['climate'], benchmarks: T.PlannerBenchmark[]) {
  const db = benchmarks.find(b => b.metric === 'designDryBulbC' && b.appliesTo.climate === climate);
  const wb = benchmarks.find(b => b.metric === 'designWetBulbC' && b.appliesTo.climate === climate);
  const c = CLIMATE_DESIGN[climate] ?? CLIMATE_DESIGN.temperate;
  return { dryBulbC: db?.value ?? c.dryBulbC, wetBulbC: wb?.value ?? c.wetBulbC, source: db || wb ? (db ?? wb)!.source : `ASHRAE 0.4% design day, ${c.city}` };
}

/* ================================================================== sizing types */
export type PlantKind = 'feed' | 'substation' | 'transformer' | 'ups' | 'generator' | 'pdu' | 'cooling' | 'cdu' | 'chiller' | 'heat-rejection';
export interface PlantItem {
  name: string; kind: PlantKind; capacityKw: number; count: number; redundancy: string;
  /** Rating in kVA for items rated that way (transformers, generators, feeds). */ unitKva?: number;
  /** Units on one path (2N: one side) or, for UPS, per hall per side. */ perPath?: number;
  note?: string; catalogueKind?: ItemKind; model?: string;
}
/** One stage of the power chain checked at its redundancy. */
export interface PowerStage {
  key: 'grid' | 'substation' | 'transformer' | 'ups' | 'generator';
  label: string; redundancy: string; unit: string; count: number;
  /** Capacity left to carry the load with the redundancy taken out (one side for 2N, all but the largest for N+1), kW. */
  usableKw: number;
  /** Load this stage must carry, kW (facility for grid, transformers and generators; IT for UPS). */
  needKw: number; ok: boolean; basis: string; source: T.PlannerParamSource;
}
export interface FacilityLoad { itKw: number; pue: number; peakFactor: number; peakPue: number; facilityKw: number; powerFactor: number; kva: number; mva: number }
export interface RackClass { name: string; kw: number; racks: number; sharePct: number; liquid: boolean; capturePct: number; rearDoor: boolean }
export interface PhaseDesign { phaseId: string; name: string; goLive: string; itKw: number; density: number; coolingType: T.PlannerCoolingType; hallKw: number; racks: number; halls: number; storedRacks: number; storedHalls: number; mismatch: boolean; classes: RackClass[] }
export interface HeatStream { label: string; heatKw: number; loopC: number; method: 'dry cooler' | 'adiabatic cooler' | 'chiller' | 'air economiser'; trimPct: number }
export interface CoolingSizing {
  type: string; capacityKw: number; units: number; unitKw: number; redundancy: string; liquidRequired: boolean;
  /** Heat taken by liquid (CDUs) and by air (air handlers, in-row, rear doors). */
  liquidKw: number; airKw: number;
  cdu?: { units: number; unitKw: number; perHall: number };
  air: { units: number; unitKw: number; label: string; kind: 'crah' | 'fanwall' | 'inrow' | 'reardoor' };
  rearDoors: number;
  heatRejection: { designDryBulbC: number; designWetBulbC: number; source: string; streams: HeatStream[]; coolers: { units: number; unitKw: number; kind: 'dry cooler' | 'adiabatic cooler' } | null; chillers: { units: number; unitKw: number; trimKw: number } | null };
}
export interface StaffPhase { phaseId: string; name: string; goLive: string; cumulativeKw: number; seats: number; dayRoles: number; fte: number; keyHireBy: string; techHireBy: string }
/** How the halls stack into floors and buildings. Only meaningful for scopes that build (new site, expansion, portfolio). */
export interface BuildingPlan { racksPerHall: number; hallWhiteSpaceM2: number; hallsPerFloor: number; floorsPerBuilding: number; hallsPerBuilding: number; floorsUsed: number; floorPlateM2: number; buildingGrossM2: number; supportRatio: number; lastBuildingHalls: number; plantM2?: number; yardM2?: number; minHallM2?: number }
export interface Sizing {
  itKw: number; racks: number; halls: number; buildings: number; whiteSpaceM2: number; grossAreaM2: number; building: BuildingPlan; sites: number; rackClasses: RackClass[];
  plant: PlantItem[]; network: { leaves: number; spines: number; cores: number; uplinks: number; accessPorts: number; uplinkGbps: number; carriers: number; dciGbps: number; dciSource?: string };
  staffing: { fte: number; shifts: number; perMw: number; source: T.PlannerParamSource; seats?: number; dayRoles?: number; plan?: StaffPhase[]; basis?: string }; spares: { lines: number; valueUsd: number };
  cooling: CoolingSizing;
  pue: Sourced<number>;
  /** Facility load and the power chain at redundancy (empty when the scope carries no load). */
  facility?: FacilityLoad; power?: PowerStage[];
  /** Phases as design units (racks and halls from the same model as the totals). */
  phaseDesign?: PhaseDesign[];
  warnings?: string[];
}

/* ================================================================== helpers for the families */
/** Nominal kW per rack for each class from the site type's density band (overridden by inputs). */
export function nominalClassKw(dcTypeKey: string, p: P, coolingType?: string): { GPU: number; Compute: number; Storage: number } {
  const prof = dcTypeProfile(dcTypeKey); const [lo, hi] = prof?.kwPerRack ?? [6, 20];
  const ct = coolingType ?? str(p, 'coolingType', 'chilled-water');
  // GPU racks: full racks on liquid; part-filled racks under rear doors (about 40 kW) or plain air (about 25 kW).
  const gpuDefault = prof?.highDensity ? Math.min(80, r0((lo + hi) / 2)) : ct === 'liquid-to-chip' || ct === 'immersion' ? 60 : ct === 'rear-door' ? 40 : 25;
  return {
    GPU: num(p, 'gpuRackKw', 0) || gpuDefault,
    Compute: num(p, 'computeRackKw', 0) || Math.min(15, Math.max(6, r0((lo + hi) / 2))),
    Storage: num(p, 'storageRackKw', 0) || Math.min(8, Math.max(4, lo)),
  };
}
/**
 * Rack classes from the workload mix: racks split by share (largest remainder, so they add up),
 * class kW scaled from the nominal values so Σ racks × kW = IT kW. Liquid classes and their
 * capture share follow the cooling type.
 */
export function rackClassTable(itKw: number, racks: number, mix: { gpuPct: number; computePct: number; storagePct: number }, nominal: { GPU: number; Compute: number; Storage: number }, coolingType: T.PlannerCoolingType, liquidThresholdKw = 30, capturePct = 75): RackClass[] {
  if (racks <= 0 || itKw <= 0) return [];
  let shares = ([['GPU', mix.gpuPct], ['Compute', mix.computePct], ['Storage', mix.storagePct]] as [keyof typeof nominal, number][]).filter(([, s]) => s > 0);
  if (!shares.length) shares = [['Compute', 100]];
  const tot = shares.reduce((a, [, s]) => a + s, 0);
  const raw = shares.map(([n, s]) => ({ n, s: s / tot, exact: (racks * s) / tot }));
  const base = raw.map(x => ({ ...x, r: Math.floor(x.exact) }));
  let left = racks - base.reduce((a, x) => a + x.r, 0);
  for (const x of [...base].sort((a, b) => (b.exact - b.r) - (a.exact - a.r))) { if (left <= 0) break; x.r++; left--; }
  const live = base.filter(x => x.r > 0);
  // Scale the nominal kW so the classes add up to the load. A class whose nominal is within the
  // cooling limit (air 30 kW, rear door 50 kW) is held at that limit and the others take the rest;
  // a class the planner set above the limit is scaled like the others (and the liquid rule fails).
  const limit = coolingType === 'liquid-to-chip' || coolingType === 'immersion' ? Infinity : coolingType === 'rear-door' ? 50 : liquidThresholdKw;
  const kwOf = new Map<string, number>(); let free = live; let loadLeft = itKw;
  for (let guard = 0; guard < 4 && free.length; guard++) {
    const f = loadLeft / (free.reduce((a, x) => a + x.r * nominal[x.n], 0) || 1);
    const over = free.filter(x => nominal[x.n] <= limit && nominal[x.n] * f > limit);
    if (!over.length || over.length === free.length) { free.forEach(x => kwOf.set(x.n, nominal[x.n] * f)); break; }
    over.forEach(x => { kwOf.set(x.n, limit); loadLeft -= x.r * limit; });
    free = free.filter(x => !over.includes(x));
  }
  return live.map(x => {
    const kw = r1(kwOf.get(x.n) ?? nominal[x.n]);
    const liquid = coolingType === 'immersion' || (coolingType === 'liquid-to-chip' && (x.n === 'GPU' || kw > liquidThresholdKw));
    return { name: x.n, kw, racks: x.r, sharePct: r0(x.s * 100), liquid, capturePct: liquid ? (coolingType === 'immersion' ? Math.max(95, capturePct) : capturePct) : 0, rearDoor: coolingType === 'rear-door' };
  });
}
/** Merge per-phase class tables into one (racks add; kW is the rack-weighted mean, so kW × racks still adds up). */
function mergeClasses(lists: RackClass[][]): RackClass[] {
  const by = new Map<string, RackClass & { kwr: number; cap: number }>();
  for (const list of lists) for (const c of list) {
    const m = by.get(c.name) ?? { ...c, racks: 0, kwr: 0, cap: 0, liquid: false, rearDoor: false };
    m.racks += c.racks; m.kwr += c.kw * c.racks; m.cap += c.capturePct * c.racks; m.liquid = m.liquid || c.liquid; m.rearDoor = m.rearDoor || c.rearDoor;
    by.set(c.name, m);
  }
  const total = [...by.values()].reduce((a, c) => a + c.racks, 0) || 1;
  return [...by.values()].map(c => ({ name: c.name, kw: r1(c.kwr / Math.max(1, c.racks)), racks: c.racks, sharePct: r0((c.racks / total) * 100), liquid: c.liquid, capturePct: r0(c.cap / Math.max(1, c.racks)), rearDoor: c.rearDoor }));
}
/** Default UPS module for a hall load (large halls 1.25 MW blocks, enterprise 500 kW, small rooms 250 or 40 kW). */
export function defaultUpsModuleKw(hallKw: number): number { return hallKw >= 2000 ? 1250 : hallKw >= 800 ? 500 : hallKw >= 150 ? 250 : 40; }
/** Facility load from IT, PUE and the peak allowance. */
export function facilityLoad(itKw: number, pue: number, p: P): FacilityLoad {
  const peakFactor = num(p, 'peakPueFactor', 0.05); const pf = Math.min(1, Math.max(0.8, num(p, 'powerFactor', 0.95)));
  const peakPue = r2(pue + peakFactor); const facilityKw = r0(itKw * peakPue); const kva = r0(facilityKw / pf);
  return { itKw, pue, peakFactor, peakPue, facilityKw, powerFactor: pf, kva, mva: r1(kva / 1000) };
}
/** Units for a load at a redundancy: N → n, N+1 → n+1, 2N → 2n, 2N+1 → 2(n+1). */
export function unitsAt(redundancy: string, n: number): { count: number; perPath: number; spare: number } {
  if (n <= 0) return { count: 0, perPath: 0, spare: 0 };
  if (redundancy === '2N') return { count: 2 * n, perPath: n, spare: 0 };
  if (redundancy === '2N+1') return { count: 2 * (n + 1), perPath: n + 1, spare: 1 };
  if (redundancy === 'N+1') return { count: n + 1, perPath: n + 1, spare: 1 };
  return { count: n, perPath: n, spare: 0 };
}

/* ================================================================== size */
export function size(plan: T.PlannerPlan, p: P, benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals): Sizing {
  const itKw = plan.designPowerKw;
  const warnings: string[] = [];
  const build = BUILD_SCOPES.includes(plan.scope); const wholeSite = WHOLE_SITE_SCOPES.includes(plan.scope);
  const density = Math.max(1, num(p, 'densityKwPerRack', 12));
  const coolingType = str(p, 'coolingType', 'chilled-water') as T.PlannerCoolingType;
  const hallKw = Math.max(1, num(p, 'hallDesignKw', 1500));
  const liquidThreshold = bmFind(benchmarks, 'liquidThresholdKw')?.value ?? 30;
  const capture = Math.min(98, Math.max(0, num(p, 'liquidCapturePct', 75)));
  const nominalFor = (ct: T.PlannerCoolingType) => nominalClassKw(plan.dcTypeKey, p, ct);
  const prof = dcTypeProfile(plan.dcTypeKey);

  // Phases as design units, when they add up to the design load.
  const sorted = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const phaseSum = sorted.reduce((a, x) => a + x.itKw, 0);
  const phased = sorted.length > 0 && itKw > 0 && Math.abs(phaseSum - itKw) <= Math.max(1, itKw * 0.01);
  const pnum = (ph: T.PlannerPhase, k: string, d: number) => { const v = ph.params?.[k]; return typeof v === 'number' && v > 0 ? v : typeof v === 'string' && Number(v) > 0 ? Number(v) : d; };
  const phaseDesign: PhaseDesign[] = phased ? sorted.map(ph => {
    const d = Math.max(1, pnum(ph, 'densityKwPerRack', density)); const hk = Math.max(1, pnum(ph, 'hallDesignKw', hallKw));
    const ct = (typeof ph.params?.coolingType === 'string' ? ph.params.coolingType : coolingType) as T.PlannerCoolingType;
    const racks = ph.itKw > 0 ? Math.ceil(ph.itKw / d) : 0; const halls = ph.itKw > 0 ? Math.max(1, Math.ceil(ph.itKw / hk)) : 0;
    return { phaseId: ph.id, name: ph.name, goLive: ph.goLive, itKw: ph.itKw, density: d, coolingType: ct, hallKw: hk, racks, halls, storedRacks: ph.racks, storedHalls: ph.halls, mismatch: ph.racks !== racks || (wholeSite && ph.halls !== halls), classes: rackClassTable(ph.itKw, racks, plan.demand, nominalFor(ct), ct, liquidThreshold, capture) };
  }) : [];

  const rackCount = num(p, 'rackCount', 0);
  const affectedRacks = num(p, 'affectedRacks', 0);
  // Phases are design units for whole-site plans, and for any plan whose phases carry their own density or cooling.
  const fixedRacks = REPLACE_SCOPES.includes(plan.scope) || ((plan.scope === 'rack' || plan.scope === 'pod') && rackCount > 0);
  const usePhases = phased && !fixedRacks && (wholeSite || phaseDesign.some(x => x.density !== density || x.coolingType !== coolingType));
  const racks = REPLACE_SCOPES.includes(plan.scope) ? affectedRacks : fixedRacks ? rackCount : usePhases ? phaseDesign.reduce((a, x) => a + x.racks, 0) : itKw > 0 ? Math.ceil(itKw / density) : 0;
  const siteCount = plan.scope === 'edge' ? Math.max(0, num(p, 'siteCount', 0)) : 0;
  const halls = siteCount > 0 ? siteCount : phased && wholeSite ? phaseDesign.reduce((a, x) => a + x.halls, 0) : itKw > 0 ? Math.max(1, Math.ceil(itKw / hallKw)) : 0;
  for (const ph of phaseDesign.filter(x => x.mismatch)) warnings.push(`${ph.name}: the phase says ${ph.storedRacks} racks and ${ph.storedHalls} halls; the design model gives ${ph.racks} racks in ${ph.halls} halls`);

  // Rack classes (per phase when phased, so a phase with its own density or cooling counts right).
  const rackClasses = usePhases && phaseDesign.some(x => x.classes.length)
    ? mergeClasses(phaseDesign.map(x => x.classes)) : rackClassTable(itKw, racks, plan.demand, nominalFor(coolingType), coolingType, liquidThreshold, capture);

  // PUE and facility load.
  const climateBand = benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === coolingType && b.appliesTo.climate === plan.climate) ?? benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === coolingType);
  const pueParam = p['pueTarget'];
  const pue: Sourced<number> = pueParam && typeof pueParam.value === 'number' ? { value: pueParam.value, source: pueParam.source, note: pueParam.note } : actuals?.pue ? { value: actuals.pue, source: 'actual', note: `achieved at ${actuals.sampleSites} sites of this type` } : { value: climateBand?.value ?? prof?.pueTarget ?? 1.4, source: 'benchmark', note: climateBand?.source };
  const facility = itKw > 0 ? facilityLoad(itKw, pue.value, p) : undefined;

  // Building model.
  const hallsPerFloor = Math.max(1, num(p, 'hallsPerFloor', 0) || 0);
  const floorsPerBuilding = Math.max(1, num(p, 'floorsPerBuilding', 0) || 0);
  const hpb = p['hallsPerFloor'] || p['floorsPerBuilding'] ? hallsPerFloor * floorsPerBuilding : Math.max(1, num(p, 'hallsPerBuilding', 6));
  const buildings = siteCount > 0 ? siteCount : halls ? Math.ceil(halls / hpb) : 0;
  const m2PerRack = num(p, 'whiteSpaceM2PerRack', 2.6);
  const whiteSpaceM2 = r0(racks * m2PerRack);
  const supportRatio = num(p, 'supportSpaceRatio', 2.4);
  const plantM2 = build && facility ? r0((num(p, 'plantM2PerMw', 600) * facility.facilityKw) / 1000) : 0;
  const yardM2 = build && facility ? r0((num(p, 'yardM2PerMw', 250) * facility.facilityKw) / 1000) : 0;
  const grossAreaM2 = r0(whiteSpaceM2 * supportRatio + plantM2);
  const racksPerHall = halls ? Math.ceil(racks / halls) : 0;
  const hallWhiteSpaceM2 = r0(racksPerHall * m2PerRack);
  const minHallM2 = num(p, 'minHallM2', 250);
  if (wholeSite && halls && hallWhiteSpaceM2 < minHallM2) warnings.push(`Each hall has ${fmtN(hallWhiteSpaceM2)} m² of white space (${racksPerHall} racks), below the ${fmtN(minHallM2)} m² minimum for rows, containment and CDUs; raise the hall design load`);
  const effHpf = p['hallsPerFloor'] ? hallsPerFloor : Math.max(1, Math.ceil(hpb / Math.max(1, floorsPerBuilding)));
  const effFloors = p['floorsPerBuilding'] ? floorsPerBuilding : Math.max(1, Math.ceil(hpb / effHpf));
  const floorsTotal = Math.max(1, buildings * effFloors);
  const building: BuildingPlan = { racksPerHall, hallWhiteSpaceM2, hallsPerFloor: effHpf, floorsPerBuilding: effFloors, hallsPerBuilding: hpb, floorsUsed: halls ? Math.ceil(halls / effHpf) : 0, floorPlateM2: r0(effHpf * hallWhiteSpaceM2 * supportRatio + plantM2 / floorsTotal), buildingGrossM2: buildings ? r0(grossAreaM2 / buildings) : 0, supportRatio, lastBuildingHalls: halls ? halls - (buildings - 1) * hpb : 0, plantM2, yardM2, minHallM2 };

  // Power chain at redundancy.
  const redundancy = str(p, 'redundancy', '2N'); const tier = str(p, 'tier', 'Tier III');
  const plant: PlantItem[] = []; const power: PowerStage[] = [];
  const rnd = (a: number, b: number) => Math.round((a + b) / 2);
  const pp = prof && itKw > 0 ? plantPlan(prof, itKw, Math.max(1, racks), rnd) : null;
  if (facility && (build || plan.scope === 'plant')) {
    const pf = facility.powerFactor; const dual = redundancy !== 'N';
    const feedV = num(p, 'feedVoltage', 33000);
    // Grid: the offer (input or chosen candidate) or, failing that, the site type's standard intake.
    const offerP = num(p, 'gridOfferMva', 0); const cand = plan.candidates?.find(c => c.chosen)?.gridOfferMva ?? 0;
    const offerMva = offerP || cand;
    const profileKw = pp?.feeds[0]?.capacityKw ?? r0(itKw * (dual ? 0.7 : 1.1));
    const perPathKva = offerMva ? offerMva * 1000 : r0(profileKw / pf);
    const gridSource: T.PlannerParamSource = offerP ? (p['gridOfferMva']?.source ?? 'user') : cand ? 'document' : 'template';
    const gridBasis = offerP ? 'grid offer entered on the plan' : cand ? 'grid offer of the chosen candidate site' : `no grid offer entered; ${prof?.name ?? 'site type'} profile intake assumed`;
    for (const side of dual ? ['A', 'B'] : ['A']) plant.push({ name: `Utility ${side}-side · ${fmtN(feedV / 1000)} kV · ${r1(perPathKva / 1000)} MVA`, kind: 'feed', capacityKw: r0(perPathKva * pf), unitKva: perPathKva, count: 1, perPath: 1, redundancy: dual ? `${side}-side` : 'single', note: gridBasis });
    power.push({ key: 'grid', label: 'Grid supply', redundancy: dual ? 'each path carries the whole facility' : 'single supply', unit: `${r1(perPathKva / 1000)} MVA per path`, count: dual ? 2 : 1, usableKw: r0(perPathKva * pf), needKw: facility.facilityKw, ok: perPathKva >= facility.kva, basis: `${gridBasis}; facility ${fmtN(facility.facilityKw)} kW = ${fmtN(itKw)} kW IT × peak PUE ${facility.peakPue}, ${facility.mva} MVA at ${pf} power factor`, source: gridSource });
    // HV substation for an intake of 66 kV and above.
    if (build && feedV >= 66000) {
      const ratings = [40, 63, 80, 100, 120]; const unit = ratings.find(r => r >= facility.mva) ?? 120; const n = Math.ceil(facility.mva / unit);
      const count = redundancy.startsWith('2N') ? 2 * n : n + 1; const usable = n * unit * 1000 * pf;
      plant.push({ name: `Grid transformers ${fmtN(feedV / 1000)}/33 kV · ${unit} MVA`, kind: 'substation', capacityKw: r0(unit * 1000 * pf), unitKva: unit * 1000, count, perPath: n, redundancy: redundancy.startsWith('2N') ? '2N' : 'N+1', catalogueKind: 'hv-transformer', note: 'HV substation: long lead (grid operator works 18 to 36 months)' });
      power.push({ key: 'substation', label: 'HV substation', redundancy: redundancy.startsWith('2N') ? '2N' : 'N+1', unit: `${unit} MVA`, count, usableKw: r0(usable), needKw: facility.facilityKw, ok: usable >= facility.facilityKw, basis: `${count} × ${unit} MVA; with one lost ${fmtN(n * unit)} MVA carries ${facility.mva} MVA`, source: 'benchmark' });
    }
    // MV/LV transformers in kVA.
    const tKva = Math.max(500, num(p, 'transformerKva', 2500)); const nT = Math.ceil(facility.kva / tKva); const uT = unitsAt(redundancy, nT);
    const mvKv = feedV >= 66000 ? 33 : feedV / 1000;
    const tUsable = (redundancy.startsWith('2N') ? nT * tKva : redundancy === 'N+1' ? (uT.count - 1) * tKva : uT.count * tKva) * pf;
    plant.push({ name: `Transformers ${fmtN(mvKv)}/0.4 kV · ${fmtN(tKva)} kVA`, kind: 'transformer', capacityKw: r0(tKva * pf), unitKva: tKva, count: uT.count, perPath: uT.perPath, redundancy, catalogueKind: 'transformer' });
    power.push({ key: 'transformer', label: 'MV/LV transformers', redundancy, unit: `${fmtN(tKva)} kVA`, count: uT.count, usableKw: r0(tUsable), needKw: facility.facilityKw, ok: tUsable >= facility.facilityKw, basis: `${fmtN(facility.kva)} kVA facility load ÷ ${fmtN(tKva)} kVA = ${nT}; ${redundancy === 'N+1' ? `${nT} + 1 spare` : redundancy.startsWith('2N') ? `${uT.perPath} on each side` : 'no spare'}`, source: p['transformerKva']?.source ?? 'template' });
    // UPS: modules per hall per side, sized on the critical (IT) load.
    const hallLoad = halls ? itKw / halls : itKw;
    const moduleKw = Math.max(10, num(p, 'upsModuleKw', 0) || defaultUpsModuleKw(Math.max(hallLoad, num(p, 'hallDesignKw', hallLoad))));
    const nU = Math.ceil(hallLoad / moduleKw); const uU = unitsAt(redundancy, nU); const hallsN = Math.max(1, halls);
    const upsUsable = hallsN * nU * moduleKw;
    const upsName = prof?.dcPowerPlant ? `DC power plant (−48 V) · ${fmtN(moduleKw)} kW modules` : `UPS · ${fmtN(moduleKw)} kW modules`;
    plant.push({ name: upsName, kind: 'ups', capacityKw: moduleKw, count: hallsN * uU.count, perPath: uU.perPath, redundancy, catalogueKind: 'ups', model: upsOptionFor(moduleKw).model, note: `${uU.perPath} per hall${redundancy.startsWith('2N') ? ' on each side' : ''} for ${fmtN(hallLoad)} kW per hall` });
    power.push({ key: 'ups', label: prof?.dcPowerPlant ? 'DC power plant' : 'UPS', redundancy, unit: `${fmtN(moduleKw)} kW module`, count: hallsN * uU.count, usableKw: upsUsable, needKw: itKw, ok: upsUsable >= itKw, basis: `${fmtN(hallLoad)} kW per hall ÷ ${fmtN(moduleKw)} kW = ${nU} module${nU === 1 ? '' : 's'}; ${redundancy.startsWith('2N') ? `each side carries the whole critical load (${uU.perPath} per hall per side)` : redundancy === 'N+1' ? 'one spare module per hall' : 'no spare'}`, source: p['upsModuleKw']?.source ?? 'template' });
    // Generators in kVA at 0.8 pf, on the facility load with margin.
    const noGen = p['generatorFuelHours'] !== undefined && num(p, 'generatorFuelHours', 48) === 0;
    if (!noGen) {
      const gKva = Math.max(100, num(p, 'generatorKva', 3000)); const gKw = gKva * 0.8;
      const margin = bmFind(benchmarks, 'generatorMargin')?.value ?? 1.25;
      const nG = Math.ceil((facility.facilityKw * margin) / gKw);
      const genRed = redundancy === 'N' ? 'N' : tier === 'Tier IV' || redundancy === '2N+1' ? '2N' : 'N+1';
      const uG = unitsAt(genRed, nG); const gUsable = nG * gKw;
      plant.push({ name: `Generators · ${fmtN(gKva)} kVA standby`, kind: 'generator', capacityKw: gKw, unitKva: gKva, count: uG.count, perPath: uG.perPath, redundancy: genRed, catalogueKind: 'generator' });
      power.push({ key: 'generator', label: 'Generators', redundancy: genRed, unit: `${fmtN(gKva)} kVA (${fmtN(gKw)} kW at 0.8 pf)`, count: uG.count, usableKw: gUsable, needKw: facility.facilityKw, ok: gUsable >= facility.facilityKw * margin, basis: `facility ${fmtN(facility.facilityKw)} kW × ${margin} margin ÷ ${fmtN(gKw)} kW = ${nG}; ${genRed === 'N+1' ? 'one spare set' : genRed === '2N' ? 'a full second set' : 'no spare'}`, source: p['generatorKva']?.source ?? 'template' });
    }
    plant.push({ name: prof?.dcPowerPlant ? 'BDFB distribution' : 'PDUs', kind: 'pdu', capacityKw: pp?.distribution[0]?.capacityKw ?? 200, count: pp?.distribution.length ?? Math.ceil(racks / 10), redundancy: redundancy === 'N' ? 'N' : '2N' });
  }

  // Cooling: liquid capture per class, residual air, heat rejection by loop temperature and climate.
  const coolingMargin = bmFind(benchmarks, 'coolingMargin')?.value ?? 1.1;
  const coolRed = str(p, 'coolingRedundancy', 'N+1');
  const classSource: { classes: RackClass[]; ct: T.PlannerCoolingType }[] = usePhases && rackClasses.length ? phaseDesign.map(x => ({ classes: x.classes, ct: x.coolingType })) : [{ classes: rackClasses, ct: coolingType }];
  let liquidKw = 0, airKw = 0, rearDoors = 0;
  for (const s of classSource) for (const c of s.classes) { const heat = c.kw * c.racks; const liq = c.liquid ? heat * (c.capturePct / 100) : 0; liquidKw += liq; airKw += heat - liq; if (c.rearDoor) rearDoors += c.racks; }
  if (!rackClasses.length && itKw > 0) airKw = itKw;
  liquidKw = r0(liquidKw); airKw = r0(airKw);
  const hallsC = Math.max(1, halls);
  const redUnits = (n: number) => (n <= 0 ? 0 : coolRed === '2N' ? 2 * n : coolRed === 'N' ? n : n + 1);
  const anyLiquid = liquidKw > 0;
  const airKind: CoolingSizing['air']['kind'] = coolingType === 'rear-door' ? 'reardoor' : coolingType === 'in-row' ? 'inrow' : anyLiquid ? 'fanwall' : 'crah';
  const airUnitKw = airKind === 'reardoor' ? 50 : airKind === 'inrow' ? 60 : airKind === 'fanwall' ? 400 : 250;
  const airUnits = itKw <= 0 ? 0 : airKind === 'reardoor' ? Math.max(rearDoors, racks) : hallsC * redUnits(Math.ceil(((airKw / hallsC) * coolingMargin) / airUnitKw));
  const cduKw = 1350;
  const cduPerHall = anyLiquid ? redUnits(Math.ceil(((liquidKw / hallsC) * coolingMargin) / cduKw)) : 0;
  const cdu = anyLiquid ? { units: hallsC * cduPerHall, unitKw: cduKw, perHall: cduPerHall } : undefined;
  const airLabel = airKind === 'reardoor' ? 'Rear-door coolers (one per rack)' : airKind === 'inrow' ? 'In-row units' : airKind === 'fanwall' ? 'Fan walls (residual air)' : 'CRAH units';
  // Heat rejection.
  const dt = designTemps(plan.climate, benchmarks);
  const inlet = num(p, 'inletSetpointC', 24);
  const streams: HeatStream[] = [];
  const pick = (heat: number, loopC: number, label: string): HeatStream => {
    if (dt.dryBulbC + 8 <= loopC) return { label, heatKw: r0(heat), loopC, method: 'dry cooler', trimPct: 0 };
    if (dt.wetBulbC + 7 <= loopC) return { label, heatKw: r0(heat), loopC, method: 'adiabatic cooler', trimPct: 0 };
    return { label, heatKw: r0(heat), loopC, method: 'chiller', trimPct: Math.min(100, Math.max(20, r0(((dt.wetBulbC + 7 - loopC) / 10) * 100))) };
  };
  if (liquidKw > 0) streams.push(pick(liquidKw, Math.max(30, num(p, 'liquidLoopC', 32)), 'Liquid loop (CDUs)'));
  if (airKw > 0) {
    if (coolingType === 'air-economiser' && !anyLiquid) streams.push({ label: 'Air side (economiser)', heatKw: airKw, loopC: inlet, method: 'air economiser', trimPct: Math.min(100, Math.max(25, r0(((dt.wetBulbC + 4 - inlet) / 8) * 100))) });
    else streams.push(pick(airKw, 14, anyLiquid ? 'Residual air (chilled water)' : 'Air side (chilled water)'));
  }
  const freeHeat = streams.filter(s => s.method === 'dry cooler' || s.method === 'adiabatic cooler' || (s.method === 'chiller' && s.trimPct < 100)).reduce((a, s) => a + s.heatKw, 0);
  const trimKw = r0(streams.reduce((a, s) => a + (s.heatKw * s.trimPct) / 100, 0));
  const coolerKind: 'dry cooler' | 'adiabatic cooler' = streams.some(s => s.method === 'adiabatic cooler' || (s.method === 'chiller' && s.loopC > 20)) ? 'adiabatic cooler' : 'dry cooler';
  const build_or_plant = build || plan.scope === 'plant';
  const coolers = build_or_plant && freeHeat > 0 ? { units: Math.ceil((freeHeat * coolingMargin) / 1200) + 1, unitKw: 1200, kind: coolerKind } : null;
  const chillers = build_or_plant && trimKw > 0 ? { units: Math.ceil((trimKw * coolingMargin) / 1500) + 1, unitKw: 1500, trimKw } : null;
  const primaryLiquid = LIQUID_TYPES.includes(coolingType) && !!cdu;
  const cooling: CoolingSizing = {
    type: coolingType, redundancy: coolRed, liquidRequired: rackClasses.some(c => c.kw > liquidThreshold) || density > liquidThreshold,
    units: primaryLiquid ? cdu!.units : airUnits, unitKw: primaryLiquid ? cduKw : airUnitKw, capacityKw: primaryLiquid ? cdu!.units * cduKw : airUnits * airUnitKw,
    liquidKw, airKw, cdu, air: { units: airUnits, unitKw: airUnitKw, label: airLabel, kind: airKind }, rearDoors: airKind === 'reardoor' ? airUnits : 0,
    heatRejection: { designDryBulbC: dt.dryBulbC, designWetBulbC: dt.wetBulbC, source: dt.source, streams, coolers, chillers },
  };
  if (itKw > 0) {
    if (cdu) plant.push({ name: 'CDUs', kind: 'cdu', capacityKw: cduKw, count: cdu.units, perPath: cdu.perHall, redundancy: coolRed, catalogueKind: 'cdu', note: `${cdu.perHall} per hall for ${fmtN(liquidKw / hallsC)} kW of liquid heat per hall` });
    if (airUnits) plant.push({ name: airLabel, kind: 'cooling', capacityKw: airUnitKw, count: airUnits, redundancy: airKind === 'reardoor' ? 'one per rack' : coolRed, catalogueKind: airKind === 'reardoor' ? 'reardoor' : airKind === 'inrow' ? 'inrow' : airKind === 'fanwall' ? 'fanwall' : 'crah' });
    if (coolers) plant.push({ name: `${coolerKind === 'adiabatic cooler' ? 'Adiabatic' : 'Dry'} coolers`, kind: 'heat-rejection', capacityKw: 1200, count: coolers.units, redundancy: 'N+1', catalogueKind: 'dry-cooler', note: `rejects ${fmtN(freeHeat)} kW without compressors at a ${dt.dryBulbC} °C / ${dt.wetBulbC} °C wet-bulb design day` });
    if (chillers) plant.push({ name: `Chillers${trimKw < itKw * 0.6 ? ' (trim)' : ''}`, kind: 'chiller', capacityKw: 1500, count: chillers.units, redundancy: 'N+1', catalogueKind: 'chiller', note: `${fmtN(trimKw)} kW needs mechanical cooling on the design day` });
  }

  // Network.
  const racksPerLeafPair = Math.max(1, num(p, 'racksPerLeafPair', 16));
  const leaves = racks ? Math.ceil(racks / racksPerLeafPair) * 2 : 0;
  const uplinksPerLeaf = num(p, 'uplinksPerLeaf', 4);
  const spines = leaves ? Math.max(2, Math.ceil((leaves * uplinksPerLeaf) / 32)) : 0;
  const cores = itKw > 0 && build ? (itKw >= 5000 ? 4 : 2) : 0;
  const uplinkGbps = num(p, 'uplinkGbps', 400);
  const carriers = build || plan.scope === 'network' ? num(p, 'carrierCount', 3) : 0;
  const dciIn = num(p, 'dciGbpsRequired', 0);
  // GPU training needs little WAN; general compute and storage need more per MW.
  const gpuShare = plan.demand.gpuPct / 100;
  const dciDefault = build && itKw > 0 ? Math.max(100, Math.ceil((itKw / 1000) * (gpuShare * 2 + (1 - gpuShare) * 10) / 100) * 100) : 0;
  const dciGbps = dciIn || dciDefault;

  // Staffing: 24/7 seats × 5.2 FTE plus day roles, ramped per phase with hiring lead times.
  const staffCostSrc: T.PlannerParamSource = 'benchmark';
  const mwPerSeat = Math.max(1, num(p, 'mwPerShiftSeat', 8)); const dayPerMw = num(p, 'dayRolesPerMw', 0.15);
  const keyLead = bmFind(benchmarks, 'hireLeadMonths:key')?.value ?? 9; const techLead = bmFind(benchmarks, 'hireLeadMonths:tech')?.value ?? 3;
  const staffPerMwIn = p['staffPerMw'] ? num(p, 'staffPerMw') : bmFind(benchmarks, 'staffPerMw', { tier })?.value ?? 0.8;
  const staffPhases = (sorted.length ? sorted : [{ id: 'PH-1', name: 'Go-live', goLive: plan.targetGoLive, itKw } as T.PlannerPhase]);
  let cum = 0;
  const staffPlan: StaffPhase[] = build && itKw > 0 && plan.scope !== 'edge' ? staffPhases.map(ph => {
    cum += ph.itKw; const mw = cum / 1000;
    const seats = mw >= 10 ? Math.max(2, Math.ceil(mw / mwPerSeat)) : mw >= 1 ? 1 : 0;
    const dayRoles = Math.max(mw > 0 ? 1 : 0, Math.ceil(mw * dayPerMw)) + (mw >= 5 ? 2 : 0);
    const gl = new Date(ph.goLive).getTime();
    return { phaseId: ph.id, name: ph.name, goLive: ph.goLive, cumulativeKw: cum, seats, dayRoles, fte: r1(seats * 5.2 + dayRoles), keyHireBy: new Date(gl - keyLead * 30.4 * 864e5).toISOString(), techHireBy: new Date(gl - techLead * 30.4 * 864e5).toISOString() };
  }) : [];
  const last = staffPlan[staffPlan.length - 1];
  const fte = last ? last.fte : r1((itKw / 1000) * staffPerMwIn);
  const staffing = { fte, shifts: last?.seats ? 4 : itKw > 0 ? 1 : 0, perMw: itKw ? r2(fte / (itKw / 1000)) : 0, source: (last ? staffCostSrc : p['staffPerMw']?.source ?? 'benchmark') as T.PlannerParamSource, seats: last?.seats ?? 0, dayRoles: last?.dayRoles ?? 0, plan: staffPlan, basis: last ? `${last.seats} round-the-clock seats × 5.2 FTE + ${last.dayRoles} day roles (one seat per ${mwPerSeat} MW, ${dayPerMw} day roles per MW)` : `${staffPerMwIn} FTE per MW added to the existing site team` };

  // Spares: share of the IT bought (catalogue quantities).
  const itq = rackClasses.length ? itQuantities({ classes: rackClasses, neededBy: sorted[0]?.goLive ?? plan.targetGoLive, rackHeightU: prof?.physical.rackHeightU }) : undefined;
  const spares = { lines: r0(racks * 0.3), valueUsd: r0((itq?.total ?? 0) * (num(p, 'sparesPct', 3) / 100) * (bool(p, 'operatorOwnedIt', true) ? 1 : 0.2)) };

  return {
    itKw, racks, halls, buildings, whiteSpaceM2, grossAreaM2, building, sites: siteCount, rackClasses, plant,
    network: { leaves, spines, cores, uplinks: leaves * uplinksPerLeaf, accessPorts: racks * 48, uplinkGbps, carriers, dciGbps, dciSource: dciIn ? 'entered' : dciDefault ? `default from the workload: ${r1(gpuShare * 2 + (1 - gpuShare) * 10)} Gbps per MW (GPU training needs little WAN)` : undefined },
    staffing, spares, cooling, pue, facility, power, phaseDesign, warnings,
  };
}

/* ================================================================== capacity ladder */
export type BindingConstraint = 'power' | 'cooling' | 'space' | 'grid' | 'ports' | 'none';
export interface LadderRow {
  phase: T.PlannerPhase; installedKw: number; committedKw: number; reserveKw: number; headroomKw: number; usablePct: number; racks: number; halls: number; monthsFromNow: number; crossesWarningMonth?: number;
  bindingConstraint: BindingConstraint;
  /** Headroom per dimension after committed load and reserve, IT kW. */
  headrooms?: { power: number; cooling: number; space: number; grid: number };
  /** Where the committed load comes from. */
  committedBasis?: string;
}
const DEMAND_WEIGHT: Record<string, number> = { Approved: 0.9, 'Under Review': 0.5, Open: 0.3 };
const DEMAND_KW: Record<string, number> = { kW: 1, GPUs: 1.25, units: 0.8, servers: 0.8, TB: 0.012, ports: 0 };
/** Demand requests for a site weighted by status, in IT kW. */
export function weightedDemandKw(data: PlannerData | undefined, dc: T.DataCenter | undefined, densityKw = 10): { kw: number; items: { title: string; kw: number; weight: number }[] } {
  if (!data || !dc) return { kw: 0, items: [] };
  const items = data.demandRequests.filter(d => new RegExp(`\\b${dc.code.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(d.title) && DEMAND_WEIGHT[d.status] !== undefined).map(d => {
    const per = d.unit === 'racks' ? densityKw : DEMAND_KW[d.unit] ?? 0;
    return { title: d.title, kw: r0(d.requestedQuantity * per * DEMAND_WEIGHT[d.status]), weight: DEMAND_WEIGHT[d.status] };
  }).filter(x => x.kw > 0);
  return { kw: items.reduce((a, x) => a + x.kw, 0), items };
}
export function capacityLadder(plan: T.PlannerPlan, p: P, sizing: Sizing, c?: Pick<ScopeCtx, 'site' | 'data'>): LadderRow[] {
  const now = clockMs();
  const reserve = num(p, 'reservePct', 15) / 100;
  const growth = plan.demand.growthPctPerYear / 100;
  const site = c?.site && !WHOLE_SITE_SCOPES.includes(plan.scope) ? c.site : undefined;
  const density = num(p, 'densityKwPerRack', 10);
  const demand = site ? weightedDemandKw(c?.data, site.dc, density) : { kw: 0, items: [] };
  const anchor = num(p, 'anchorKw', 0); const preLet = num(p, 'preLetPct', 0) / 100;
  const siteCommitted = site ? site.itLoadKw + site.reservedKw + site.pipelineKw + demand.kw : 0;
  const siteBase = site ? site.dc.designPowerKw : 0;
  const peak = sizing.facility?.peakPue ?? sizing.pue.value;
  const gridStage = sizing.power?.find(s => s.key === 'grid');
  const siteUtility = site?.stages.find(s => s.key === 'utility');
  const gridIt = site ? (siteUtility ? siteUtility.usableKw / site.pue : Infinity) : gridStage ? gridStage.usableKw / Math.max(1, peak) : Infinity;
  const coolingIt = (sizing.cooling.liquidKw + sizing.cooling.airKw) > 0 ? sizing.itKw : 0;
  const basis = site ? `live draw ${fmtN(site.itLoadKw)} kW + holds ${fmtN(site.reservedKw)} kW + approved plans ${fmtN(site.pipelineKw)} kW + weighted demand ${fmtN(demand.kw)} kW at ${site.dc.code}` : anchor || preLet ? `anchor contract ${fmtN(anchor)} kW + pre-let ${r0(preLet * 100)}% of each phase` : 'no anchor or pre-let entered: committed load is zero, the ladder shows build capacity only';
  let cumKw = 0, cumHalls = 0;
  const sorted = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  return sorted.map(ph => {
    cumKw += ph.itKw; const pd = sizing.phaseDesign?.find(x => x.phaseId === ph.id); cumHalls += pd?.halls ?? ph.halls;
    const installed = siteBase + cumKw;
    const months = Math.max(0, (new Date(ph.goLive).getTime() - now) / (30.4 * 864e5));
    const committed = r0(Math.min(installed, siteCommitted + Math.min(cumKw, anchor + preLet * cumKw)));
    const reserveKw = r0(installed * reserve);
    // Headroom per dimension: what is left after the committed load and the reserve.
    const headPower = installed - committed - reserveKw;
    const coolCap = (site ? site.cooling.usableKw : 0) + (coolingIt ? cumKw : 0);
    const headCooling = coolCap - committed - reserveKw;
    const hallKw = pd?.hallKw ?? num(p, 'hallDesignKw', 1500);
    const spaceKw = WHOLE_SITE_SCOPES.includes(plan.scope) ? cumHalls * hallKw : installed;
    const headSpace = spaceKw - committed - reserveKw;
    // Grid: the intake (offer or site utility) can be smaller than what the phases install.
    const gridCap = Number.isFinite(gridIt) ? Math.min(gridIt, installed) : installed;
    const headGrid = gridCap - committed - reserveKw;
    const gridShort = Number.isFinite(gridIt) && installed > gridIt;
    const heads = { power: r0(headPower), cooling: r0(headCooling), space: r0(headSpace), grid: r0(headGrid) };
    const minKey = (Object.entries(heads) as [keyof typeof heads, number][]).sort((a, b) => a[1] - b[1])[0];
    const binding: BindingConstraint = gridShort ? 'grid' : minKey[1] < installed * 0.1 ? minKey[0] : 'none';
    const headroom = Math.max(0, Math.min(headPower, headCooling, headSpace, headGrid));
    const usable = installed ? r0(((installed - reserveKw) / installed) * 100) : 0;
    const crossing = growth > 0 && installed > 0 && committed > 0 ? r1(Math.log((installed * 0.85) / Math.max(1, committed)) / Math.log(1 + growth / 12)) : undefined;
    return { phase: ph, installedKw: installed, committedKw: committed, reserveKw, headroomKw: r0(headroom), usablePct: usable, racks: pd?.racks ?? ph.racks, halls: pd?.halls ?? ph.halls, monthsFromNow: r1(months), crossesWarningMonth: crossing !== undefined && Number.isFinite(crossing) ? r1(months + Math.max(0, crossing)) : undefined, bindingConstraint: binding, headrooms: heads, committedBasis: basis };
  });
}

/* ================================================================== estimate */
export interface EstimateLine { category: string; item: string; amount: number; basis: string; source: T.PlannerParamSource }
export interface Estimate {
  capex: EstimateLine[]; capexTotal: number; capexPerKw: number; capexPerRack: number;
  opex: EstimateLine[]; opexMonthly: number; opexAnnual: number; energyMwhYear: number;
  revenueAnnual: number; energyRecoveredAnnual: number; marginAnnual: number; paybackMonths: number | null; paybackBasis: string; plantCapexTotal: number; costPerKwMonth: number;
  benchmarkBand?: { low: number; high: number; source: string }; actualsCapexPerKw?: number;
  /** What the plan saves or enables each year (replacements, migrations, plant, network): energy, support, lease, circuits… */
  benefitLines?: EstimateLine[]; benefitAnnual?: number;
  /** Year-by-year cash flow and the investment measures built on it (see finance.ts). */
  cashflow?: CashflowYear[]; npvUsd?: number; irrPct?: number | null; discountPct?: number; depreciationAnnual?: number;
  /** How the estimate compares with the bill of materials (in-site scopes: the estimate is the bill plus contingency). */
  basis?: 'bottom-up' | 'benchmark' | 'mixed'; contingencyUsd?: number;
  /** Capacity the works make usable (plant upgrades), in IT kW. */
  capacityEnabledKw?: number;
  /** IT quantities and prices (the same model the bill of materials and sourcing use). */
  it?: ItQuantities;
  /** Notes on inputs not entered (land, grid offer…). */
  notes?: string[];
  /** Payback of the same case without the operator-owned IT (facility only), when the plan owns IT. */
  paybackFacilityMonths?: number | null;
}
export interface CashflowYear { year: number; label: string; capex: number; opex: number; revenue: number; benefit: number; net: number; cumulative: number; discounted: number; energy?: number; depreciation?: number; tax?: number; itCapex?: number }

/** The plan's dated phases, or one implicit phase at the target date. */
export function datedPhases(plan: T.PlannerPlan): T.PlannerPhase[] {
  const s = [...plan.phases].filter(x => !Number.isNaN(new Date(x.goLive).getTime())).sort((a, b) => a.goLive.localeCompare(b.goLive));
  if (s.length) return s;
  return plan.targetGoLive ? [{ id: 'PH-1', name: 'Go-live', goLive: plan.targetGoLive, itKw: plan.designPowerKw, racks: 0, halls: 0, status: 'Planned' }] : [];
}
/** IT quantities for a plan's rack classes (catalogue model, units per rack, prices). */
export function planItQuantities(plan: T.PlannerPlan, p: P, sizing: Sizing, data?: PlannerData): ItQuantities | undefined {
  if (!sizing.rackClasses.length) return undefined;
  const prof = dcTypeProfile(plan.dcTypeKey);
  const ru = num(p, 'rackUnitsNeeded', 0);
  return itQuantities({ classes: sizing.rackClasses, neededBy: datedPhases(plan)[0]?.goLive ?? plan.targetGoLive, rackHeightU: ru > 42 ? 48 : prof?.physical.rackHeightU ?? 42 }, data);
}

export function estimate(plan: T.PlannerPlan, p: P, sizing: Sizing, benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals, data?: PlannerData, extra: EstimateLine[] = []): Estimate {
  const itKw = sizing.itKw;
  const notes: string[] = [];
  const build = WHOLE_SITE_SCOPES.includes(plan.scope);
  const bmCapex = benchmarks.find(b => b.metric === 'capexPerKw' && b.appliesTo.dcTypeKey === plan.dcTypeKey);
  const capexPerKwP = p['capexPerKw'];
  const saneActual = actuals?.capexPerKw && (!bmCapex || (actuals.capexPerKw >= (bmCapex.low ?? 0) * 0.5 && actuals.capexPerKw <= (bmCapex.high ?? 1e9) * 2)) ? actuals.capexPerKw : undefined;
  const capexPerKw = capexPerKwP ? num(p, 'capexPerKw') : saneActual ?? bmCapex?.value ?? 3400;
  const capexSource: T.PlannerParamSource = capexPerKwP?.source ?? (saneActual ? 'actual' : 'benchmark');
  const replace = REPLACE_SCOPES.includes(plan.scope);
  // MEP and fit-out from the CapEx/kW benchmark (which excludes land, shell and IT).
  const scopeFactor = replace ? 0 : plan.scope === 'plant' ? 0.3 : plan.scope === 'retrofit' ? 0.55 : plan.scope === 'hall' ? 0.55 : plan.scope === 'pod' || plan.scope === 'rack' ? 0.35 : plan.scope === 'network' ? 0 : plan.scope === 'migration' ? 0.05 : 1;
  const mep = itKw * capexPerKw * scopeFactor;
  const rawShares: [string, number][] = plan.scope === 'plant' ? [['Power plant', 0.6], ['Cooling plant', 0.35], ['Design, project management and services', 0.05]]
    : plan.scope === 'retrofit' ? [['Cooling plant', 0.55], ['Power distribution', 0.25], ['Fit-out', 0.12], ['Design, project management and services', 0.08]]
    : plan.scope === 'hall' ? [['Power distribution', 0.3], ['Cooling (hall units and pipework)', 0.3], ['Fit-out', 0.2], ['Network and structured cabling', 0.08], ['Fire, security and BMS', 0.06], ['Design, project management and services', 0.06]]
    : [['Power plant', 0.32], ['Cooling plant', 0.18], ['Fit-out', 0.14], ['Network and structured cabling', 0.06], ['Fire, security and BMS', 0.05], ['Design, project management and services', 0.08]];
  const shareSum = rawShares.reduce((a, [, s]) => a + s, 0);
  const shareBasis = plan.scope === 'hall' ? 'hall share of the site benchmark (site plant, shell and land excluded)' : 'MEP and fit-out benchmark';
  const capex: EstimateLine[] = (replace ? [] : rawShares).map(([item, s]) => ({ category: 'CapEx', item, amount: r0((mep * s) / shareSum), basis: `${r0((s / shareSum) * 100)}% of ${fmtN(capexPerKw)} USD/kW${scopeFactor !== 1 ? ` × ${scopeFactor}` : ''} × ${fmtN(itKw)} kW (${shareBasis})`, source: capexSource }));
  // Land and shell as their own lines for scopes that build.
  const land = build ? num(p, 'landCostUsd', 0) : 0;
  if (build && land > 0) capex.push({ category: 'CapEx', item: 'Land', amount: r0(land), basis: 'land cost entered on the plan', source: p['landCostUsd']?.source ?? 'user' });
  else if (plan.scope === 'new-dc' || plan.scope === 'portfolio') notes.push('Land cost not entered: the estimate has no land line');
  const shellPerM2 = build ? num(p, 'shellCostPerM2', 1800) : 0;
  const shell = build ? r0(shellPerM2 * sizing.grossAreaM2) : 0;
  if (shell > 0) capex.push({ category: 'CapEx', item: 'Building shell and core', amount: shell, basis: `${fmtN(sizing.grossAreaM2)} m² gross × ${fmtN(shellPerM2)} USD/m²`, source: p['shellCostPerM2']?.source ?? 'benchmark' });
  // IT from the catalogue quantity model.
  const ownIt = bool(p, 'operatorOwnedIt', true);
  const itScoped = ownIt && !replace && sizing.racks > 0 && !['plant', 'network', 'migration'].includes(plan.scope);
  const it = itScoped ? planItQuantities(plan, p, sizing, data) : undefined;
  for (const l of it?.lines ?? []) capex.push({ category: 'CapEx', item: `${l.className === 'Storage' ? 'Storage arrays' : l.className === 'GPU' ? 'GPU servers' : 'Servers'} (${l.model})`, amount: r0(l.total), basis: `${fmtN(l.racks)} racks × ${l.perRack} per rack (${l.rackKw} kW ÷ ${fmtN(l.typicalW)} W${l.limitedBy === 'space' ? `, capped by ${it!.usableU} U` : ''}) = ${fmtN(l.units)} × ${fmtN(l.unitPrice)} USD`, source: l.source === 'asset model' ? 'actual' : 'benchmark' });
  const itCapex = it?.total ?? 0;
  if (replace) {
    // Replacement plans are priced from the chosen model and the affected count (set when the devices or racks are selected).
    const affected = num(p, 'affectedCount', 0);
    const units = plan.scope === 'server-refresh' ? Math.ceil(affected / Math.max(1, num(p, 'consolidationRatio', 2))) : plan.scope === 'network-refresh' ? affected : num(p, 'affectedRacks', affected);
    const unitCost = plan.scope === 'rack-replace' ? (priceOf(str(p, 'rackModel', 'NetShelter SX 48U')) ?? 3800) + (bool(p, 'replacePdus', true) ? 2 * (priceOf('Geist rPDU 3-phase') ?? 1400) : 0) : priceOf(str(p, 'replacementModel')) ?? num(p, 'replacementUnitCost', 0);
    if (units && unitCost) capex.push({ category: 'CapEx', item: plan.scope === 'rack-replace' ? 'New racks and power strips' : 'New equipment', amount: r0(units * unitCost), basis: `${units} × ${unitCost.toLocaleString('en-US')} USD (${String(p['replacementModel']?.value ?? p['rackModel']?.value ?? 'catalogue model')})`, source: 'benchmark' });
    if (affected) capex.push({ category: 'CapEx', item: 'Installation, migration and disposal', amount: r0(affected * (plan.scope === 'rack-replace' ? 1900 : plan.scope === 'network-refresh' ? 420 : 370)), basis: `${affected} ${plan.scope === 'rack-replace' ? 'racks' : 'devices'} moved, cut over and disposed of`, source: 'benchmark' });
  }
  if (plan.scope === 'network') { capex.push({ category: 'CapEx', item: 'Optics, line cards and DCI circuits', amount: 1_250_000, basis: '2 × 400G DCI, third diverse path, optics both ends', source: 'benchmark' }); }
  // Lines the caller adds (the planner's bill of materials changes, materials.ts); counted as other CapEx in the cash flow.
  capex.push(...extra);
  // Contingency on works (not on bought-in IT or land).
  const worksBase = r0(mep + shell);
  const contPct = num(p, 'costContingencyPct', build ? 10 : 5);
  const cont = worksBase > 0 && contPct > 0 ? contingencyLine(worksBase, contPct, 'MEP, fit-out and shell') : undefined;
  if (cont) { cont.source = p['costContingencyPct']?.source ?? 'template'; capex.push(cont); }
  const capexTotal = capex.reduce((a, l) => a + l.amount, 0);

  // Running costs at steady state (all phases live, ramp complete).
  const tariff = num(p, 'tariffUsdPerKwh', plan.tariffUsdPerKwh ?? 0.11);
  const pue = sizing.pue.value;
  const fill = num(p, 'targetFillPct', 85) / 100; const draw = num(p, 'itDrawPct', 70) / 100;
  const drawnKw = itKw * fill * draw;
  const energyMwhYear = r0((drawnKw * pue * 8760) / 1000);
  const energyAnnual = drawnKw * pue * 8760 * tariff;
  const maintPct = num(p, 'maintenancePctCapex', 2.5);
  const maintenance = mep * (maintPct / 100);
  const staffCost = bmFind(benchmarks, 'staffCostFte')?.value ?? 96000;
  const staff = sizing.staffing.fte * staffCost;
  const gbpsPrice = usdPerGbpsMonth(data, bmFind(benchmarks, 'usdPerGbpsMonth')?.value ?? 250);
  const xc = bmFind(benchmarks, 'crossConnectUsdMonth')?.value ?? 450;
  const connectivityMonthly = sizing.network.dciGbps * gbpsPrice.value + sizing.network.carriers * 2 * xc;
  const property = sizing.grossAreaM2 * num(p, 'leaseUsdPerM2Year', 0);
  const insurance = (mep + shell) * 0.004;
  const software = itKw * 14;
  const opex: EstimateLine[] = ([
    { category: 'OpEx', item: 'Energy', amount: r0(energyAnnual / 12), basis: `${fmtN(itKw)} kW × ${r0(fill * 100)}% sold × ${r0(draw * 100)}% drawn × PUE ${pue} × 730 h × ${tariff} USD/kWh`, source: sizing.pue.source },
    { category: 'OpEx', item: 'Maintenance and service contracts', amount: r0(maintenance / 12), basis: `${maintPct}% of MEP CapEx per year`, source: p['maintenancePctCapex']?.source ?? 'benchmark' },
    { category: 'OpEx', item: 'Staff', amount: r0(staff / 12), basis: `${sizing.staffing.fte} FTE × ${fmtN(staffCost)} USD${sizing.staffing.basis ? ` (${sizing.staffing.basis})` : ''}`, source: sizing.staffing.source },
    { category: 'OpEx', item: 'Connectivity', amount: r0(connectivityMonthly), basis: `${fmtN(sizing.network.dciGbps)} Gbps × ${gbpsPrice.value} USD/Gbps/month (${gbpsPrice.note})${sizing.network.carriers ? ` + ${sizing.network.carriers} carriers × 2 cross-connects × ${xc} USD` : ''}`, source: gbpsPrice.source },
    { category: 'OpEx', item: 'Property and insurance', amount: r0((property + insurance) / 12), basis: property ? `${fmtN(sizing.grossAreaM2)} m² lease plus insurance at 0.4% of works` : 'insurance at 0.4% of works', source: 'benchmark' },
    { category: 'OpEx', item: 'Software and licences', amount: r0(software / 12), basis: 'monitoring, DCIM, ITSM at 14 USD per kW a year', source: 'benchmark' },
  ] as EstimateLine[]).filter(l => l.amount > 0);
  const opexMonthly = opex.reduce((a, l) => a + l.amount, 0);
  // Revenue only where the plan type carries a revenue input (no fallback to the plan record).
  const price = p['revenuePerKwMonth'] ? num(p, 'revenuePerKwMonth', 0) : 0;
  const revenueAnnual = itKw * fill * price * 12;
  const multi = plan.demand.tenancy === 'multi';
  const energyRecoveredAnnual = revenueAnnual > 0 && multi ? energyAnnual : 0;
  const marginAnnual = revenueAnnual + energyRecoveredAnnual - opexMonthly * 12;
  const plantCapexTotal = capexTotal - itCapex;

  // Cash flow.
  const flowIn = { mep, shell, land, it, contingency: cont?.amount ?? 0, other: capexTotal - mep - shell - land - itCapex - (cont?.amount ?? 0), price, fill: fill * 100, draw: draw * 100, tariff, pue, staffCost, maintPct, connectivityMonthly, property, insurance, software, multi };
  const flow = buildCashflow(plan, p, sizing, benchmarks, flowIn);
  const ownedNote = itCapex ? `includes ${fmtUsd(itCapex)} of operator-owned IT and its refresh every ${num(p, 'refreshYears', 5)} years` : 'no operator-owned IT';
  const hasIncome = revenueAnnual > 0;
  // The same case without the IT, so the planner sees how much of the payback the IT drives.
  const facilityOnly = hasIncome && itCapex ? buildCashflow(plan, p, sizing, benchmarks, { ...flowIn, it: undefined }) : undefined;
  if (facilityOnly) notes.push(`Without the operator-owned IT the facility pays back in ${facilityOnly.paybackMonths === null ? 'more than the horizon' : `${facilityOnly.paybackMonths} months`} (NPV ${fmtUsd(facilityOnly.npvUsd)}); the revenue input should reflect what the IT earns when the operator owns it`);
  return {
    capex, capexTotal: r0(capexTotal), capexPerKw: itKw ? r0(mep / itKw) : 0, capexPerRack: sizing.racks ? r0(capexTotal / sizing.racks) : 0,
    opex, opexMonthly: r0(opexMonthly), opexAnnual: r0(opexMonthly * 12), energyMwhYear, revenueAnnual: r0(revenueAnnual), energyRecoveredAnnual: r0(energyRecoveredAnnual), marginAnnual: r0(marginAnnual),
    paybackMonths: hasIncome ? flow.paybackMonths : null,
    paybackBasis: hasIncome ? `cash-flow payback from the first spend: CapEx by phase date, revenue ramping to ${r0(fill * 100)}% over ${num(p, 'fillRampMonths', 18)} months, tax at ${num(p, 'taxRatePct', 25)}%; ${ownedNote}${energyRecoveredAnnual ? '; energy recovered from tenants' : ''}` : 'no revenue input for this plan type',
    plantCapexTotal: r0(plantCapexTotal),
    costPerKwMonth: itKw ? r0(opexMonthly / itKw) : 0, benchmarkBand: bmCapex && WHOLE_SITE_SCOPES.includes(plan.scope) ? { low: bmCapex.low ?? bmCapex.value ?? 0, high: bmCapex.high ?? bmCapex.value ?? 0, source: bmCapex.source } : undefined, actualsCapexPerKw: actuals?.capexPerKw,
    cashflow: flow.years, npvUsd: flow.npvUsd, irrPct: flow.irrPct, discountPct: flow.discountPct, depreciationAnnual: flow.depreciationAnnual,
    basis: replace || plan.scope === 'network' ? 'bottom-up' : it ? 'mixed' : 'benchmark', contingencyUsd: cont?.amount ?? 0, it, notes,
    paybackFacilityMonths: facilityOnly ? facilityOnly.paybackMonths : undefined,
  };
}

/** A plan type's own estimate replaces the generic lines (bill-priced works, benefits, incremental OpEx) but used to keep the generic cash
 *  flow, so the payback tile (a simple CapEx ÷ margin) and the chart disagreed (PLN-0002: "34 months" beside a flow that never turns
 *  positive). When the lines differ from the generic ones, the cash flow is rebuilt from them: works and IT CapEx spent before each
 *  phase's go-live (IT refreshed), the revenue or charge-back ramping in, benefits and OpEx from go-live, tax with losses carried
 *  forward; payback, NPV and IRR are read from that flow, and a facility-only payback is kept when the plan owns IT. */
function scopeCashflow(plan: T.PlannerPlan, p: P, sizing: Sizing, est: Estimate, generic: Estimate): Estimate {
  if (est === generic) return est;
  const same = generic.capexTotal > 0 && Math.abs(est.capexTotal - generic.capexTotal) / generic.capexTotal < 0.02 && Math.abs(est.revenueAnnual - generic.revenueAnnual) <= Math.max(1, generic.revenueAnnual * 0.02) && !est.benefitAnnual;
  if (same) return { ...est, cashflow: generic.cashflow, npvUsd: generic.npvUsd, irrPct: generic.irrPct, discountPct: generic.discountPct, depreciationAnnual: generic.depreciationAnnual, paybackMonths: generic.paybackMonths, paybackBasis: generic.paybackBasis, paybackFacilityMonths: generic.paybackFacilityMonths };
  const now = clockMs(); const phases = datedPhases(plan);
  if (!phases.length || est.capexTotal <= 0) return { ...est, cashflow: undefined, npvUsd: undefined, irrPct: undefined };
  const totalKw = phases.reduce((a, ph) => a + ph.itKw, 0) || phases.length;
  // only operator-owned IT (servers, storage, GPUs priced from the catalogue) is refreshed; network and plant kit is a works line
  const it = est.it?.total ? Math.max(0, est.capexTotal - est.plantCapexTotal) : 0, works = est.capexTotal - it;
  const refresh = num(p, 'refreshYears', 5), ramp = num(p, 'fillRampMonths', 12), fill = 85;
  const capKw = est.capacityEnabledKw || sizing.itKw;
  const income = est.revenueAnnual + (est.energyRecoveredAnnual ?? 0);
  const build = (withIt: boolean) => {
    const capex: CapexItem[] = []; const revenue: RevenueStream[] = []; const opexItems: OpexItem[] = []; const benefits: { label: string; annual: number; fromMs: number }[] = [];
    phases.forEach(ph => {
      const s = (ph.itKw || totalKw / phases.length) / totalKw; const gl = new Date(ph.goLive).getTime();
      const spread = Math.max(1, Math.min(9, Math.round((gl - now) / (30.4 * 864e5))));
      if (works) capex.push({ label: `Works · ${ph.name}`, amount: works * s, assetClass: 'mep', inServiceMs: gl, spreadMonths: spread, lifeYears: num(p, 'mepLifeYears', 15) });
      if (withIt && it) capex.push({ label: `IT · ${ph.name}`, amount: it * s, assetClass: 'it', inServiceMs: gl, spreadMonths: 2, lifeYears: refresh, refresh: true });
      if (income > 0 && capKw > 0) revenue.push({ label: ph.name, kw: capKw * s, fromMs: gl, priceKwMonth: income / (capKw * 12 * (fill / 100)), targetFillPct: fill, rampMonths: ramp });
      if (est.benefitAnnual) benefits.push({ label: `Benefit · ${ph.name}`, annual: est.benefitAnnual * s, fromMs: gl });
      if (est.opexMonthly) opexItems.push({ label: `OpEx · ${ph.name}`, monthly: est.opexMonthly * s, fromMs: gl });
    });
    const lastGl = new Date(phases[phases.length - 1].goLive).getTime();
    return cashflowFor({ startMs: now, horizonYears: Math.max(num(p, 'horizonYears', 15), Math.ceil((lastGl - now) / (365 * 864e5)) + 10), discountPct: num(p, 'hurdlePct', 8), taxRatePct: num(p, 'taxRatePct', 25), capex, revenue, opex: opexItems, benefits });
  };
  const flow = build(true);
  const earns = income > 0 || (est.benefitAnnual ?? 0) > 0;
  const facilityOnly = earns && it && works ? build(false) : undefined;
  return {
    ...est, cashflow: flow.years, npvUsd: flow.npvUsd, irrPct: flow.irrPct, discountPct: flow.discountPct, depreciationAnnual: flow.depreciationAnnual,
    paybackMonths: earns ? flow.paybackMonths : null,
    paybackBasis: earns ? `cash-flow payback from the first spend on the lines above: works${it ? ' and IT (refreshed every ' + refresh + ' years)' : ''} spent before each phase goes live, ${income > 0 ? `revenue ramping to ${fill}% over ${ramp} months` : 'the yearly benefit'} and OpEx from go-live, tax at ${num(p, 'taxRatePct', 25)}%` : est.paybackBasis,
    paybackFacilityMonths: facilityOnly ? facilityOnly.paybackMonths : undefined,
  };
}

/** The generic cash flow: CapEx by phase date, revenue ramp, energy at actual draw, OpEx following the staff ramp. */
function buildCashflow(plan: T.PlannerPlan, p: P, sizing: Sizing, benchmarks: T.PlannerBenchmark[], x: { mep: number; shell: number; land: number; it?: ItQuantities; contingency: number; other: number; price: number; fill: number; draw: number; tariff: number; pue: number; staffCost: number; maintPct: number; connectivityMonthly: number; property: number; insurance: number; software: number; multi: boolean }) {
  const now = clockMs();
  const phases = datedPhases(plan);
  const totalKw = phases.reduce((a, ph) => a + ph.itKw, 0) || 1;
  const buildWeeks = bmFind(benchmarks, `durationWeeks:${plan.scope}`)?.value ?? (WHOLE_SITE_SCOPES.includes(plan.scope) ? 90 : 26);
  const firstSpread = Math.round((buildWeeks * 7) / 30.4);
  const mepLife = num(p, 'mepLifeYears', 18), shellLife = num(p, 'shellLifeYears', 30), refresh = num(p, 'refreshYears', 5);
  const capex: CapexItem[] = []; const revenue: RevenueStream[] = []; const opexItems: OpexItem[] = [];
  const internal: { kw: number; fromMs: number; targetFillPct: number; rampMonths: number }[] = [];
  const ramp = num(p, 'fillRampMonths', 18); const preLet = num(p, 'preLetPct', 0); let anchorLeft = num(p, 'anchorKw', 0);
  if (x.land > 0) capex.push({ label: 'Land', amount: x.land, assetClass: 'land', inServiceMs: now });
  const first = phases[0] ? new Date(phases[0].goLive).getTime() : now;
  phases.forEach((ph, i) => {
    const s = ph.itKw / totalKw; const gl = new Date(ph.goLive).getTime();
    const spread = Math.max(1, Math.min(i === 0 ? firstSpread : Math.min(18, firstSpread), Math.round((gl - now) / (30.4 * 864e5))));
    if (x.mep) capex.push({ label: `MEP and fit-out · ${ph.name}`, amount: x.mep * s, assetClass: 'mep', inServiceMs: gl, spreadMonths: spread, lifeYears: mepLife });
    if (x.shell) capex.push({ label: `Shell · ${ph.name}`, amount: x.shell * s, assetClass: 'shell', inServiceMs: gl, spreadMonths: spread, lifeYears: shellLife });
    if (x.contingency) capex.push({ label: `Contingency · ${ph.name}`, amount: x.contingency * s, assetClass: 'mep', inServiceMs: gl, spreadMonths: spread, lifeYears: mepLife });
    if (x.other > 0) capex.push({ label: `Other · ${ph.name}`, amount: x.other * s, assetClass: 'other', inServiceMs: gl, spreadMonths: Math.min(spread, 6), lifeYears: 7 });
    if (x.it?.total) capex.push({ label: `IT · ${ph.name}`, amount: x.it.total * s, assetClass: 'it', inServiceMs: gl, spreadMonths: 2, lifeYears: refresh, refresh: true });
    const anchorHere = Math.min(anchorLeft, ph.itKw); anchorLeft -= anchorHere;
    const pre = Math.max(preLet, ph.itKw ? (anchorHere / ph.itKw) * 100 : 0);
    if (x.price > 0) revenue.push({ label: ph.name, kw: ph.itKw, fromMs: gl, priceKwMonth: x.price, targetFillPct: x.fill, rampMonths: ramp, preLetPct: pre });
    else internal.push({ kw: ph.itKw, fromMs: gl, targetFillPct: x.fill, rampMonths: ramp });
    if (x.mep) opexItems.push({ label: `Maintenance · ${ph.name}`, monthly: (x.mep * s * x.maintPct) / 100 / 12, fromMs: gl });
    opexItems.push({ label: `Insurance · ${ph.name}`, monthly: (x.insurance * s) / 12, fromMs: gl }, { label: `Software · ${ph.name}`, monthly: (x.software * s) / 12, fromMs: gl });
  });
  if (x.connectivityMonthly) opexItems.push({ label: 'Connectivity', monthly: x.connectivityMonthly, fromMs: first });
  if (x.property) opexItems.push({ label: 'Lease', monthly: x.property / 12, fromMs: first });
  // Staff from the hiring dates: key roles 6 to 9 months before go-live, technicians 3 months before.
  let prevKey = 0, prevTech = 0;
  for (const st of sizing.staffing.plan ?? []) {
    const key = st.dayRoles + Math.min(st.seats, 1) * 5.2; const tech = st.fte - key;
    if (key > prevKey) opexItems.push({ label: `Staff (key roles) · ${st.name}`, monthly: ((key - prevKey) * x.staffCost) / 12, fromMs: new Date(st.keyHireBy).getTime() });
    if (tech > prevTech) opexItems.push({ label: `Staff (technicians) · ${st.name}`, monthly: ((tech - prevTech) * x.staffCost) / 12, fromMs: new Date(st.techHireBy).getTime() });
    prevKey = Math.max(prevKey, key); prevTech = Math.max(prevTech, tech);
  }
  if (!sizing.staffing.plan?.length && sizing.staffing.fte) opexItems.push({ label: 'Staff', monthly: (sizing.staffing.fte * x.staffCost) / 12, fromMs: first });
  const lastGl = phases.length ? new Date(phases[phases.length - 1].goLive).getTime() : now;
  const horizon = Math.max(num(p, 'horizonYears', 15), Math.ceil((lastGl - now) / (365 * 864e5)) + 10);
  const input: CashflowInput = {
    startMs: now, horizonYears: horizon, discountPct: num(p, 'hurdlePct', 8), taxRatePct: num(p, 'taxRatePct', 25),
    capex, revenue, opex: opexItems,
    energy: { pue: x.pue, tariffUsdPerKwh: x.tariff, drawPct: x.draw, recovered: x.multi && x.price > 0, internal },
  };
  return cashflowFor(input);
}

/* ================================================================== reconciliation */
export interface Reconciliation {
  estimateTotal: number; bomTotal: number;
  /** Estimate lines with no bill-of-materials counterpart (land, shell, design and PM, contingency). */
  uncosted: { item: string; amount: number }[];
  /** Per estimate line: what the bill holds for the same categories. */
  rows: { item: string; estimate: number; bom: number; categories: BomCategory[] }[];
  reconciledTotal: number; gapUsd: number; gapPct: number;
}
const CATEGORY_OF: [RegExp, BomCategory[]][] = [
  [/^Power|distribution/i, ['Power']], [/^Cooling/i, ['Cooling']], [/^Fit-out/i, ['Racks and containment']], [/^Network/i, ['Network', 'Cabling']],
  [/^Fire/i, ['Fire and security', 'Monitoring']], [/servers|storage arrays|^IT /i, ['Compute and storage']],
];
/** Bill of materials + uncosted categories + contingency against the estimate. */
export function reconcile(est: Estimate, bom: Bom): Reconciliation {
  const used = new Set<BomCategory>(); const rows: Reconciliation['rows'] = []; const uncosted: Reconciliation['uncosted'] = [];
  for (const l of est.capex) {
    const cats = CATEGORY_OF.find(([re]) => re.test(l.item))?.[1] ?? [];
    const fresh = cats.filter(c => !used.has(c));
    const bomAmt = fresh.reduce((a, c) => a + (bom.byCategory.find(x => x.category === c)?.total ?? 0), 0);
    fresh.forEach(c => used.add(c));
    // the planner's bill changes are already in the bill's categories: neither a row of their own nor uncosted
    if (l.item === MATERIAL_CHANGES_ITEM) continue;
    if (!cats.length) uncosted.push({ item: l.item, amount: l.amount });
    rows.push({ item: l.item, estimate: l.amount, bom: bomAmt, categories: cats });
  }
  const unmatchedBom = bom.byCategory.filter(c => !used.has(c.category)).reduce((a, c) => a + c.total, 0);
  if (unmatchedBom) rows.push({ item: 'Bill lines with no estimate line', estimate: 0, bom: unmatchedBom, categories: bom.byCategory.filter(c => !used.has(c.category)).map(c => c.category) });
  const reconciledTotal = bom.total + uncosted.reduce((a, u) => a + u.amount, 0);
  const gapUsd = reconciledTotal - est.capexTotal;
  return { estimateTotal: est.capexTotal, bomTotal: bom.total, uncosted, rows, reconciledTotal, gapUsd, gapPct: est.capexTotal ? r1((gapUsd / est.capexTotal) * 100) : 0 };
}

/* ================================================================== rules */
export const COMMISSIONING_REQUIRED: Record<T.PlannerScope, number> = { 'new-dc': 5, expansion: 5, plant: 5, hall: 5, retrofit: 4, pod: 4, edge: 3, network: 3, migration: 3, portfolio: 3, rack: 3, 'server-refresh': 3, 'network-refresh': 3, 'rack-replace': 3 };
export interface Finding { rule: T.PlannerRuleDef; status: 'pass' | 'fail' | 'warn' | 'n/a'; detail: string; value?: string }
const ATP_LEVEL: Record<string, number> = { 'L1 FAT': 1, 'L2 SAT': 2, 'L3 Pre-functional': 3, 'L4 Functional': 4, 'L5 IST': 5 };

export function evaluateRules(rules: T.PlannerRuleDef[], plan: T.PlannerPlan, p: P, sizing: Sizing, est: Estimate, benchmarks: T.PlannerBenchmark[], schedule: ScheduleItem[], scopeCheck?: (rule: T.PlannerRuleDef) => CheckResult | undefined, ctx?: ScopeCtx, recon?: Reconciliation): Finding[] {
  const itKw = sizing.itKw;
  const tier = str(p, 'tier', 'Tier III'), red = str(p, 'redundancy', '2N');
  const prof = dcTypeProfile(plan.dcTypeKey);
  const bmPue = benchmarks.find(b => b.metric === 'pue' && b.appliesTo.coolingType === sizing.cooling.type && b.appliesTo.climate === plan.climate);
  const build = BUILD_SCOPES.includes(plan.scope);
  // An existing site the plan adds load to (in-site scopes without their own check, plant).
  const site = ctx?.site && !build ? ctx.site : undefined;
  const added = plan.scope === 'plant' ? 0 : planAddedKw(plan);
  const stage = (k: string) => sizing.power?.find(s => s.key === k);
  const siteStage = (k: string) => site?.stages.find(s => s.key === k);
  const dataLoading = !!ctx && (!ctx.data || !ctx.data.ready);
  const out: Finding[] = [];
  for (const r of rules) {
    const F = (status: Finding['status'], detail: string, value?: string) => out.push({ rule: r, status, detail, value });
    const owned = scopeCheck?.(r);
    if (owned) { F(owned.status, owned.detail, owned.value); continue; }
    const skipPlant = itKw === 0;
    switch (r.check) {
      case 'feeds-cover-load': {
        if (skipPlant) { F('n/a', 'No facility load in scope'); break; }
        if (site && added <= 0) { F('n/a', `This plan adds no load to ${site.dc.name}`); break; }
        const s = siteStage('utility');
        if (site && s) { const need = added * site.pue; F(s.headroomItKw >= added ? 'pass' : 'fail', `Site utility: each side carries ${fmtN(s.usableKw)} kW; today's facility load ${fmtN(s.loadKw)} kW plus holds and approved plans leaves ${fmtN(s.headroomItKw)} kW IT; this plan adds ${fmtN(added)} kW IT (${fmtN(need)} kW facility)`, `${fmtN(s.headroomItKw)} kW IT free`); break; }
        if (site && !s) { F('n/a', `Not checked: no utility feeds recorded for ${site.dc.name}`); break; }
        if (plan.scope === 'expansion' && ctx?.campus && !num(p, 'gridOfferMva', 0)) {
          const cb = ctx.campus; const fac = sizing.facility?.facilityKw ?? itKw;
          F(cb.facilityHeadroomKw >= fac ? 'pass' : 'fail', `Campus intake ${fmtN(cb.perSideKw)} kW per side; existing buildings are entitled to ${fmtN(cb.committedFacilityKw)} kW, leaving ${fmtN(cb.facilityHeadroomKw)} kW; this building needs ${fmtN(fac)} kW facility load`, `${fmtN(cb.facilityHeadroomKw)} kW free`); break;
        }
        const g = stage('grid');
        if (!g) { F('n/a', 'No grid supply sized'); break; }
        const perPath = sizing.plant.find(x => x.kind === 'feed')?.unitKva ?? 0;
        F(g.ok ? 'pass' : 'fail', `${red.startsWith('2N') || red === 'N+1' ? 'Each supply path must carry the whole facility load' : 'The supply must carry the facility load'}: ${r1(perPath / 1000)} MVA per path against ${sizing.facility?.mva ?? 0} MVA (${fmtN(sizing.facility?.facilityKw ?? 0)} kW = IT × peak PUE ${sizing.facility?.peakPue}, at ${sizing.facility?.powerFactor} pf). ${g.source === 'template' ? 'No grid offer entered; the site type profile intake is assumed — enter the grid offer.' : 'Declared: grid offer as entered.'}`, `${r1(perPath / 1000)} / ${sizing.facility?.mva ?? 0} MVA`);
        break;
      }
      case 'ups-redundancy': {
        if (skipPlant) { F('n/a', 'No facility load in scope'); break; }
        if (site && added <= 0) { F('n/a', `This plan adds no load to ${site.dc.name}`); break; }
        const s = siteStage('ups');
        if (site && s) { F(s.headroomItKw >= added ? 'pass' : 'fail', `Site ${s.label} at ${s.redundancy}: usable ${fmtN(s.usableKw)} kW, load ${fmtN(s.loadKw)} kW, ${fmtN(s.headroomItKw)} kW free after holds and approved plans; this plan adds ${fmtN(added)} kW`, `${fmtN(s.headroomItKw)} kW free`); break; }
        const u = stage('ups');
        if (!u) { F('n/a', site ? `Not checked: no UPS recorded for ${site.dc.name}` : 'No UPS sized'); break; }
        F(u.ok ? 'pass' : 'fail', `${red}: ${u.basis}. Usable ${fmtN(u.usableKw)} kW for ${fmtN(u.needKw)} kW critical load`, `${r0((u.usableKw / Math.max(1, u.needKw)) * 100)}%`);
        break;
      }
      case 'generator-margin': {
        if (skipPlant) { F('n/a', 'No facility load in scope'); break; }
        if (site && added <= 0) { F('n/a', `This plan adds no load to ${site.dc.name}`); break; }
        const s = siteStage('generator');
        if (site && s) { const need = added * site.pue * (r.threshold ?? 1.25); F(s.headroomItKw * site.pue >= need ? 'pass' : 'warn', `Site generators with the largest set lost: ${fmtN(s.usableKw)} kW; ${fmtN(s.headroomItKw * site.pue)} kW facility free against ${fmtN(need)} kW needed (× ${r.threshold ?? 1.25})`); break; }
        const g = stage('generator');
        if (!g) { F(site ? 'n/a' : 'warn', site ? `Not checked: no generators recorded for ${site.dc.name}` : 'No generators in the design (battery only)'); break; }
        const margin = r.threshold ?? 1.25;
        F(g.usableKw >= g.needKw * margin ? 'pass' : 'warn', `${g.redundancy}: ${g.basis}. With ${g.redundancy === '2N' ? 'one set of generators' : g.redundancy === 'N+1' ? 'the largest set' : 'nothing'} lost, ${fmtN(g.usableKw)} kW carries ${fmtN(g.needKw)} kW facility load × ${margin}`, `${r0((g.usableKw / Math.max(1, g.needKw)) * 100)}%`);
        break;
      }
      case 'fuel-hours': {
        const need = tier === 'Tier IV' ? 48 : (r.threshold ?? 24);
        if (skipPlant) { F('n/a', 'No facility load in scope'); break; }
        if (site) {
          const gens = ctx?.data?.generators.filter(g => g.dataCenterId === site.dc.id && g.status !== 'Failed') ?? [];
          if (!gens.length) { F('n/a', `Not checked: no generators recorded for ${site.dc.name}`); break; }
          const h = Math.min(...gens.map(g => g.fuelHours)); F(h >= need ? 'pass' : 'warn', `${gens.length} generator(s) at ${site.dc.name}: the shortest holds ${h} h of fuel; ${need} h expected for ${tier}`, `${h} h`); break;
        }
        if (p['generatorFuelHours'] === undefined) { F('n/a', 'Fuel autonomy is not an input for this plan type'); break; }
        const h = num(p, 'generatorFuelHours', 0); F(h >= need ? 'pass' : 'warn', `Declared: ${h} h of fuel on site, ${need} h expected for ${tier}`, `${h} h`); break;
      }
      case 'cooling-n1': {
        if (skipPlant) { F('n/a', 'No facility load in scope'); break; }
        if (site && added <= 0) { F('n/a', `This plan adds no load to ${site.dc.name}`); break; }
        const margin = r.threshold ?? 1.1;
        if (site) {
          if (!site.cooling.zones.length) { F('n/a', `Not checked: no cooling zones recorded for ${site.dc.name}`); break; }
          F(site.cooling.headroomKw >= added * margin ? 'pass' : 'fail', `Site cooling with the largest unit lost in each zone: ${fmtN(site.cooling.headroomKw)} kW free after load and holds; this plan needs ${fmtN(added * margin)} kW (× ${margin})`, `${fmtN(site.cooling.headroomKw)} kW free`); break;
        }
        const c = sizing.cooling; const hallsN = Math.max(1, sizing.halls);
        const checks: string[] = []; let ok = true;
        if (c.cdu) { const per = c.liquidKw / hallsN; const cap = (c.cdu.perHall - 1) * c.cdu.unitKw; ok = ok && cap >= per * margin; checks.push(`liquid: ${c.cdu.perHall} CDUs per hall, with one lost ${fmtN(cap)} kW for ${fmtN(per)} kW`); }
        if (c.air.units && c.air.kind !== 'reardoor') { const perHallUnits = c.air.units / hallsN; const cap = (perHallUnits - 1) * c.air.unitKw; const per = c.airKw / hallsN; ok = ok && cap >= per * margin; checks.push(`air: ${r1(perHallUnits)} ${c.air.label.toLowerCase()} per hall, with one lost ${fmtN(cap)} kW for ${fmtN(per)} kW`); }
        if (c.air.kind === 'reardoor') checks.push(`air: one rear door per rack (${c.air.units})`);
        F(ok ? 'pass' : 'fail', `Design as sized, per hall × ${margin}: ${checks.join('; ')}`);
        break;
      }
      case 'liquid-above-density': {
        const thr = r.threshold ?? 30;
        const phases = sizing.phaseDesign?.length ? sizing.phaseDesign.map(x => ({ name: x.name, classes: x.classes, ct: x.coolingType })) : [{ name: 'Plan', classes: sizing.rackClasses, ct: sizing.cooling.type as T.PlannerCoolingType }];
        const bad: string[] = []; const hot: string[] = [];
        for (const ph of phases) for (const c of ph.classes) if (c.kw > thr) { hot.push(`${ph.name === 'Plan' ? '' : `${ph.name}: `}${c.name} ${c.kw} kW`); if (!(c.liquid || (c.rearDoor && c.kw <= 50) || ph.ct === 'immersion')) bad.push(`${ph.name === 'Plan' ? '' : `${ph.name}: `}${c.name} racks at ${c.kw} kW with ${ph.ct}`); }
        if (!phases.some(ph => ph.classes.length)) { const d = num(p, 'densityKwPerRack'); F(d > thr && !['liquid-to-chip', 'immersion', 'rear-door'].includes(sizing.cooling.type) ? 'fail' : d ? 'pass' : 'n/a', d ? `Average ${d} kW per rack with ${sizing.cooling.type} (no rack classes)` : 'No racks in scope'); break; }
        F(bad.length ? 'fail' : 'pass', bad.length ? `Above ${thr} kW per rack without liquid or rear-door cooling: ${bad.join('; ')}` : hot.length ? `Classes above ${thr} kW are liquid or rear-door cooled: ${hot.join('; ')}` : `Every rack class is at or below ${thr} kW (highest ${Math.max(0, ...sizing.rackClasses.map(c => c.kw))} kW)`, `max ${Math.max(0, ...sizing.rackClasses.map(c => c.kw))} kW`);
        break;
      }
      case 'inlet-envelope': { const t = num(p, 'inletSetpointC', 24); F(t <= (r.threshold ?? 27) ? 'pass' : ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? 'pass' : 'warn', `Declared: ${t} °C setpoint${t > 27 ? ' (allowed for liquid-cooled halls)' : ''}`); break; }
      case 'hall-load-band': { const h = num(p, 'hallDesignKw'); const pMin = prof?.powerKw?.[0] ?? 200; const band = pMin < 200 ? [10, prof?.highDensity ? 6000 : 2000] : prof?.highDensity ? [1000, 6000] : prof?.segment === 'Telco' ? [100, 2000] : [200, 4000]; if (skipPlant) F('n/a', 'No halls in scope'); else F(h >= band[0] && h <= band[1] ? 'pass' : 'fail', `${h} kW per hall; band ${band[0]} to ${band[1]} for ${prof?.name ?? plan.dcTypeKey}`); break; }
      case 'hall-min-size': { if (!WHOLE_SITE_SCOPES.includes(plan.scope) || !sizing.halls) { F('n/a', 'Halls are not designed by this plan type'); break; } const m = sizing.building.hallWhiteSpaceM2, min = sizing.building.minHallM2 ?? 250; F(m >= min ? 'pass' : 'warn', `${fmtN(m)} m² of white space per hall (${sizing.building.racksPerHall} racks × ${num(p, 'whiteSpaceM2PerRack', 2.6)} m²) against a ${fmtN(min)} m² minimum`, `${fmtN(m)} m²`); break; }
      case 'floor-loading': { const need = sizing.cooling.liquidRequired || ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? (r.threshold ?? 1400) : 900; const f = num(p, 'floorLoadingKgPerRack', 1000); if (skipPlant) F('n/a', 'No racks in scope'); else F(f >= need ? 'pass' : 'warn', `Declared: ${f} kg per rack; ${need} needed`); break; }
      case 'carrier-diversity': if (plan.scope === 'migration') F('n/a', 'Site is being emptied'); else if (!build && plan.scope !== 'network') F('n/a', 'Carrier entries are a property of the existing site'); else F(num(p, 'carrierCount', 1) >= (r.threshold ?? 2) ? 'pass' : 'fail', `Declared: ${num(p, 'carrierCount', 1)} carriers`); break;
      case 'oversub-gpu': if (!sizing.racks) F('n/a', 'No fabric in scope'); else F(plan.demand.gpuPct >= 40 && num(p, 'oversubscription', 3) > (r.threshold ?? 3) ? 'warn' : 'pass', `${num(p, 'oversubscription', 3)}:1 with ${plan.demand.gpuPct}% GPU`); break;
      case 'tier-redundancy': { const ok = tier === 'Tier IV' ? ['2N', '2N+1'].includes(red) : tier === 'Tier III' ? red !== 'N' : true; F(ok ? 'pass' : 'fail', `${tier} with ${red} power (inputs agree with each other)`); break; }
      case 'pue-benchmark': F(!bmPue ? 'n/a' : sizing.pue.value <= (bmPue.high ?? 9) + 0.1 ? 'pass' : 'warn', bmPue ? `Target ${sizing.pue.value} against ${bmPue.low} to ${bmPue.high} (${bmPue.source})` : 'No benchmark for this cooling type and climate'); break;
      case 'capex-benchmark': F(!est.benchmarkBand || itKw === 0 || !WHOLE_SITE_SCOPES.includes(plan.scope) ? 'n/a' : est.capexPerKw <= est.benchmarkBand.high * 1.05 && est.capexPerKw >= est.benchmarkBand.low * 0.8 ? 'pass' : 'warn', !WHOLE_SITE_SCOPES.includes(plan.scope) ? 'Whole-site benchmark; this scope is estimated bottom-up' : est.benchmarkBand ? `MEP and fit-out ${fmtN(est.capexPerKw)} USD/kW against ${fmtN(est.benchmarkBand.low)} to ${fmtN(est.benchmarkBand.high)} (land, shell, IT and contingency are separate lines)` : 'No benchmark'); break;
      case 'payback': F(est.paybackMonths === null ? (est.revenueAnnual || est.benefitAnnual ? 'warn' : 'n/a') : est.paybackMonths <= (r.threshold ?? 96) ? 'pass' : 'warn', est.paybackMonths === null ? (est.revenueAnnual || est.benefitAnnual ? 'The cash flow does not pay back within the horizon' : 'No revenue or benefit for this plan type') : `${est.paybackMonths} months from the first spend${est.npvUsd !== undefined ? `; NPV ${fmtUsd(est.npvUsd)} at ${est.discountPct}%` : ''}${est.irrPct != null ? `, IRR ${est.irrPct}%` : ''}`); break;
      case 'lead-times': {
        if (PHASED_SCOPES.includes(plan.scope) && !plan.phases.some(ph => !Number.isNaN(new Date(ph.goLive).getTime()))) { F('fail', 'No dated phase: add at least one phase with a go-live date so long-lead items can be checked'); break; }
        if (!datedPhases(plan).length) { F('fail', 'No go-live date: long-lead items cannot be checked'); break; }
        const items = schedule.filter(s => s.kind !== 'gate');
        if (!items.length) { F('n/a', 'No long-lead items or permits in scope'); break; }
        if (dataLoading && ['Approved', 'Executing'].includes(plan.status)) { F('n/a', 'Not checked: platform data still loading (purchase orders)'); break; }
        const late = items.filter(s => s.late); const phases = new Set(items.map(s => s.phase)).size;
        F(late.length ? 'fail' : 'pass', late.length ? `${late.length} item(s) cannot arrive before the need date: ${late.map(l => `${l.item} (${l.phase})`).join(', ')}` : `${items.length} item(s) across ${phases} phase(s) can be ordered in time${items.some(s => s.source === 'stock') ? `; ${items.filter(s => s.source === 'stock').length} from stock` : ''}`);
        break;
      }
      case 'civil-before-fitout': {
        const data = ctx?.data;
        if (plan.scope === 'new-dc' || plan.scope === 'expansion') {
          const projects = data ? data.projects.filter(pr => pr.plannerPlanId === plan.id || plan.artefacts?.projectIds?.includes(pr.id)) : [];
          const shellP = projects.filter(pr => /shell|civil|construction|building/i.test(pr.name)); const fitP = projects.filter(pr => /fit-?out|white space|hall/i.test(pr.name));
          if (!shellP.length || !fitP.length) { F('n/a', projects.length ? 'Not checked: the programme has no separate shell and fit-out projects' : 'Not checked until the programme exists (after approval)'); break; }
          const bad = fitP.filter(f => shellP.some(s => (!s.planPhaseId || !f.planPhaseId || s.planPhaseId === f.planPhaseId) && new Date(f.plannedStart).getTime() < new Date(s.plannedEnd).getTime()));
          F(bad.length ? 'fail' : 'pass', bad.length ? `${bad.map(b => b.name).join(', ')} start before the shell is complete` : `${fitP.length} fit-out project(s) start after their shell projects end`);
          break;
        }
        if (['hall', 'pod', 'retrofit', 'rack'].includes(plan.scope)) {
          const hallId = String(plan.params.targetHallId ?? plan.placement?.hallId ?? '');
          const hall = hallId && data ? data.halls.find(h => h.id === hallId) : undefined;
          if (!hall) { F('n/a', hallId ? 'Not checked: platform data still loading' : 'Not checked: no hall chosen yet'); break; }
          F(hall.status === 'Planned' ? 'fail' : 'pass', `${hall.name} is ${hall.status ?? 'recorded without a status'}${hall.status === 'Planned' ? ': the shell is not built' : ': the shell exists'}`);
          break;
        }
        F('n/a', 'No civil works in this plan type'); break;
      }
      case 'staffing': { const b = bmFind(benchmarks, 'staffPerMw', { tier }); F(!b || itKw === 0 || !build ? 'n/a' : sizing.staffing.perMw >= (b.low ?? 0) && sizing.staffing.perMw <= (b.high ?? 9) ? 'pass' : 'warn', !build ? 'Staff are added to the existing site team' : b ? `${sizing.staffing.perMw} FTE per MW (${sizing.staffing.basis}) against ${b.low} to ${b.high}` : 'No benchmark'); break; }
      case 'permits-before-gates': { const bad = plan.permits.filter(pm => pm.status === 'Expired' || (pm.status === 'Not started' && new Date(pm.neededBefore).getTime() - pm.leadWeeks * WEEK < clockMs())); F(!plan.permits.length ? 'n/a' : bad.length ? 'fail' : 'pass', !plan.permits.length ? 'No permits listed on the plan' : bad.length ? `${bad.map(b => b.name).join(', ')} cannot be obtained in time` : `${plan.permits.length} permit(s) on track (statuses as declared on the plan)`); break; }
      case 'commissioning-level': {
        const need = COMMISSIONING_REQUIRED[plan.scope]; const have = num(p, 'commissioningLevel', 5);
        const atps = ctx?.data && plan.artefacts?.atpIds?.length ? ctx.data.atps.filter(a => plan.artefacts!.atpIds!.includes(a.id)) : [];
        if (atps.length) { const top = Math.max(...atps.map(a => ATP_LEVEL[a.level] ?? 0)); const accepted = atps.filter(a => a.status === 'Witnessed' || !!a.acceptedAt).length; F(top >= need ? 'pass' : 'fail', `${atps.length} test plan(s) up to level ${top} (${accepted} accepted); level ${need} required`); break; }
        F(have >= need ? 'pass' : 'fail', `Declared: level ${have} planned, level ${need} required for ${SCOPE_LABEL[plan.scope].toLowerCase()} (no test plans created yet)`); break;
      }
      case 'risk-owners': { const bad = plan.risks.filter(rk => rk.impact === 'High' && (!rk.owner || !rk.mitigation)); F(!plan.risks.length ? 'warn' : bad.length ? 'warn' : 'pass', !plan.risks.length ? 'No risks recorded on the plan' : bad.length ? `${bad.length} high-impact risk(s) without owner or mitigation` : `${plan.risks.length} risk(s), all owned`); break; }
      case 'reporting-enabled': F('n/a', itKw > 0 && itKw < 500 ? 'Below the 500 kW IT threshold for EU data centre reporting' : `Not checked: the platform holds no reporting registration. Declared targets: PUE ${sizing.pue.value}, renewable ${num(p, 'renewableSharePct', 0)}%; register the site for annual energy, PUE, water and renewable-share reporting`); break;
      case 'bom-reconciliation': {
        if (!WHOLE_SITE_SCOPES.includes(plan.scope)) { F('n/a', 'In-site and replacement scopes are estimated from the bill itself'); break; }
        if (!recon) { F('n/a', 'Not checked: no bill of materials'); break; }
        const thr = r.threshold ?? 15;
        F(Math.abs(recon.gapPct) <= thr ? 'pass' : 'warn', `Bill ${fmtUsd(recon.bomTotal)} + uncosted lines ${fmtUsd(recon.reconciledTotal - recon.bomTotal)} (${recon.uncosted.map(u => u.item.toLowerCase()).join(', ') || 'none'}) = ${fmtUsd(recon.reconciledTotal)} against the estimate ${fmtUsd(recon.estimateTotal)}: ${recon.gapPct > 0 ? '+' : ''}${recon.gapPct}%`, `${recon.gapPct}%`);
        break;
      }
      default: F('n/a', 'No check implemented for this rule');
    }
  }
  return out;
}

/* ================================================================== schedule */
export interface ScheduleItem {
  item: string; leadWeeks: number; needBy: string; orderBy: string; late: boolean; phase: string; kind: 'equipment' | 'gate' | 'permit'; phaseId?: string;
  /** Lead-time benchmark of an equipment line: the bill's lines with the same lead item are the ones it orders (the planner's material
   *  changes are laid over it by that link); family schedules name the item after it instead. */ leadItem?: string;
  /** Where the items come from: stock needs only a transfer, procurement the full lead time. */ source?: 'stock' | 'site' | 'procure' | 'mixed'; note?: string;
  /** Schedule contingency held as a separate buffer before the order date (weeks). */ bufferWeeks?: number;
  /** Purchase order covering the item after approval, and its status. */ poId?: string; status?: 'to order' | 'ordered' | 'late' | 'stock' | 'gate' | 'permit';
  /** Delivery's purchase orders that cover the item (set by `withDeliveryOrders` once the plan is in Delivery). */ orders?: ScheduleOrder[];
}
/** A purchase order as Delivery reports it (the shape of compat/delivery DeliveryPo, kept structural so the engine does not import Delivery). */
export interface ScheduleOrder { id: string; supplier: string; item: string; state: string; due: string }
/* What an item or an order line is, read from its words: the same vocabulary on both sides (plan lines, catalogue models, CapEx lines). */
const ORDER_KIND: [string, RegExp][] = [
  ['battery', /batter/], ['ups', /\bups\b|power module/], ['rental', /rental|\bhire\b/], ['chiller', /chiller/], ['cooler', /dry cooler|adiabatic/],
  ['generator', /generator|genset/], ['transformer', /transformer/], ['switchgear', /switchgear/], ['substation', /substation/],
  ['pdu', /\bpdus?\b|power strip|rpdu|power distribution/], ['air', /crah|\bcdus?\b|air handler|liebert|fan ?wall|in-row|rear door|rdhx/], ['rack', /\bracks?\b|containment|netshelter|smartaisle/],
  ['optics', /optic|qdd|400g|dr4|transceiver|\bdac\b/], ['fibre', /fibre|fiber|trunk|mpo|patch|cross-connect/], ['switch', /switch|\bleaf\b|spine|line card|router/],
  ['server', /server|poweredge|dgx|xe9680|r760|hgx/], ['storage', /storage|flasharray|vast|weka|ddn|netapp/], ['wan', /carrier|wavelogic|line system|dwdm|\bwave\b/],
];
function orderKinds(text: string): Set<string> {
  const t = text.toLowerCase().replace(/rack power strips?/g, 'rpdu'); const out = new Set(ORDER_KIND.filter(([, re]) => re.test(t)).map(([k]) => k));
  if (out.has('battery')) out.delete('ups'); if (out.has('rental')) out.delete('chiller');
  return out;
}
/** Delivery's purchase orders laid over the schedule: an equipment line to buy is covered by the orders of its phase (an order names its phase
 *  after " · ", or covers every phase) that share its kind of kit. Drafts leave it "to order" (late once the order-by date passes); placed
 *  orders mark it ordered, and a delivery Delivery reports late past the need date marks it late. */
export function withDeliveryOrders(items: ScheduleItem[], orders: ScheduleOrder[], phaseNames: string[]): ScheduleItem[] {
  if (!orders.length) return items;
  const now = clockMs();
  const phaseOf = (o: ScheduleOrder) => phaseNames.find(n => o.item.endsWith(` · ${n}`));
  const kinds = new Map(orders.map(o => [o.id, orderKinds(o.item)]));
  return items.map(it => {
    if (it.kind !== 'equipment' || it.source === 'stock') return it;
    const mine = orderKinds(`${it.item} ${it.note ?? ''}`);
    if (!mine.size) return it;
    const hit = orders.filter(o => { const ph = phaseOf(o); return (!ph || ph === it.phase) && [...kinds.get(o.id)!].some(k => mine.has(k)); });
    if (!hit.length) return it;
    const ids = hit.map(o => o.id).join(', ');
    if (hit.every(o => o.state === 'Draft')) {
      const late = new Date(it.orderBy).getTime() < now;
      return { ...it, orders: hit, poId: hit[0].id, late, status: late ? 'late' : 'to order', note: `${ids} ${hit.length === 1 ? 'is' : 'are'} still draft${late ? ' after the order-by date' : ''}` };
    }
    const lateDelivery = hit.some(o => o.state === 'Late' && o.due > it.needBy);
    const states = [...new Set(hit.map(o => o.state.toLowerCase()))].join(' / ');
    return { ...it, orders: hit, poId: hit[0].id, late: lateDelivery, status: lateDelivery ? 'late' : 'ordered', note: `${ids} ${states}${lateDelivery ? `, due after the need date` : ''}` };
  });
}
/** Supplier lead time for an item: the benchmark high (the figure the bill of materials shows) plus the schedule contingency as a separate buffer. */
export function leadWeeksFor(leadItem: string, benchmarks: T.PlannerBenchmark[], contingencyPct = 0): { leadWeeks: number; bufferWeeks: number; low?: number; source: string } {
  const b = benchmarks.find(x => x.metric === `leadWeeks:${leadItem}`);
  const lead = r0(b?.high ?? b?.value ?? 8);
  return { leadWeeks: lead, bufferWeeks: r0((lead * contingencyPct) / 100), low: b?.low, source: b ? b.source : 'default 8 weeks (no benchmark)' };
}
/** Weeks to move stock between sites or out of the depot. */
export const TRANSFER_WEEKS = 2;
interface SchedLine { item: string; lead: string; weeksBefore: number; kind?: ItemKind; models?: string[]; units?: number; firstOnly?: boolean }

export function schedule(plan: T.PlannerPlan, sizing: Sizing, benchmarks: T.PlannerBenchmark[], p: P, c?: Pick<ScopeCtx, 'data'> & { it?: ItQuantities }): ScheduleItem[] {
  const now = clockMs();
  const phases = datedPhases(plan);
  if (!phases.length) return [];
  const contingencyPct = num(p, 'contingencyPct', 15);
  const data = c?.data && c.data.ready !== false ? c.data : undefined;
  const approved = ['Approved', 'Executing', 'Completed'].includes(plan.status);
  const completed = plan.status === 'Completed';
  const pos = data ? data.purchaseOrders.filter(po => po.plannerPlanId === plan.id) : [];
  const totalKw = phases.reduce((a, ph) => a + ph.itKw, 0) || 1;
  const items: ScheduleItem[] = [];
  const s = sizing; const build = WHOLE_SITE_SCOPES.includes(plan.scope);
  const lines: SchedLine[] = [];
  if (s.itKw > 0 && ['new-dc', 'expansion', 'plant', 'hall', 'retrofit', 'pod', 'edge', 'portfolio'].includes(plan.scope)) {
    if (build || plan.scope === 'plant') {
      if (s.plant.some(x => x.kind === 'substation')) lines.push({ item: 'HV substation (grid transformers)', lead: 'HV substation', weeksBefore: 30, kind: 'hv-transformer', firstOnly: true });
      lines.push({ item: 'Transformers', lead: 'Transformer (33 kV)', weeksBefore: 30, kind: 'transformer' }, { item: 'Switchgear', lead: 'Switchgear', weeksBefore: 24, kind: 'switchgear' });
      if (s.plant.some(x => x.kind === 'generator')) lines.push({ item: 'Generators', lead: 'Generator (2.5 MVA)', weeksBefore: 26, kind: 'generator' });
      lines.push({ item: 'UPS modules', lead: 'UPS (1 MW module)', weeksBefore: 20, kind: 'ups' });
      if (s.cooling.heatRejection.chillers) lines.push({ item: 'Chillers', lead: 'Chiller', weeksBefore: 20, kind: 'chiller' });
      if (s.cooling.heatRejection.coolers) lines.push({ item: s.cooling.heatRejection.coolers.kind === 'adiabatic cooler' ? 'Adiabatic coolers' : 'Dry coolers', lead: benchmarks.some(b => b.metric === 'leadWeeks:Dry cooler') ? 'Dry cooler' : 'Chiller', weeksBefore: 20, kind: 'dry-cooler' });
    }
    if (plan.scope !== 'plant') {
      if (s.cooling.cdu) lines.push({ item: 'CDUs', lead: 'CRAH / CDU', weeksBefore: 14, kind: 'cdu' });
      if (s.cooling.air.units) lines.push({ item: s.cooling.air.label.replace(/ \(.*\)$/, ''), lead: 'CRAH / CDU', weeksBefore: 14, kind: s.cooling.air.kind === 'reardoor' ? 'reardoor' : s.cooling.air.kind === 'inrow' ? 'inrow' : s.cooling.air.kind === 'fanwall' ? 'fanwall' : 'crah' });
      lines.push({ item: 'PDUs', lead: 'PDU', weeksBefore: 12, kind: 'pdu' }, { item: 'Racks and containment', lead: 'Racks and containment', weeksBefore: 10, kind: 'rack' });
      if (s.network.leaves) lines.push({ item: 'Spine and leaf switches', lead: 'Spine / leaf switches', weeksBefore: 10, kind: 'leaf', models: [CATALOGUE.leaf.options[0].model, CATALOGUE.spine.options[0].model], units: s.network.leaves + (plan.scope === 'pod' ? 0 : s.network.spines) });
      if (s.network.leaves) lines.push({ item: 'Optics', lead: 'Optics (400G)', weeksBefore: 8, kind: 'optics' }, { item: 'Fibre trunks', lead: 'Fibre trunks', weeksBefore: 8, kind: 'fibre' });
      for (const l of c?.it?.lines ?? []) lines.push({ item: `${l.className === 'GPU' ? 'GPU servers' : l.className === 'Storage' ? 'Storage arrays' : 'Servers'} (${l.model})`, lead: l.leadItem, weeksBefore: 4, kind: l.kind, models: [l.model], units: l.units });
    }
  }
  if (plan.scope === 'network') { lines.push({ item: 'Optics', lead: 'Optics (400G)', weeksBefore: 4, kind: 'optics' }, { item: 'Line cards', lead: 'Spine / leaf switches', weeksBefore: 6, kind: 'spine' }); }
  const rm = str(p, 'replacementModel');
  if (plan.scope === 'server-refresh') { const gpu = /XE9680|DGX|821GE/.test(rm); lines.push({ item: gpu ? 'GPU servers' : 'Servers', lead: gpu ? 'GPU servers' : 'General servers', weeksBefore: 2, kind: gpu ? 'gpu-server' : 'server', models: rm ? [rm] : undefined, units: Math.ceil(num(p, 'affectedCount', 0) / Math.max(1, num(p, 'consolidationRatio', 2))) }); }
  if (plan.scope === 'network-refresh') { lines.push({ item: 'Switches and routers', lead: 'Spine / leaf switches', weeksBefore: 2, kind: 'leaf', models: rm ? [rm] : undefined, units: num(p, 'affectedCount', 0) }, { item: 'Optics', lead: 'Optics (400G)', weeksBefore: 1, kind: 'optics' }); }
  if (plan.scope === 'rack-replace') { lines.push({ item: 'Racks', lead: 'Racks and containment', weeksBefore: 2, kind: 'rack' }, { item: 'Rack power strips', lead: 'PDU', weeksBefore: 2, kind: 'rack-pdu', models: ['Geist rPDU 3-phase'], units: num(p, 'affectedRacks', 0) * 2 }); }

  // Free stock per model, consumed phase by phase.
  const stockLeft = new Map<string, number>();
  const stockOf = (model: string) => { if (!data) return 0; if (!stockLeft.has(model)) stockLeft.set(model, freeStock(data, model, plan.dataCenterId, plan.id).length); return stockLeft.get(model)!; };
  const vendorOf = (kind?: ItemKind) => (kind && CATALOGUE[kind] ? chooseOption(kind, plan.targetGoLive, data?.assetModels ?? [], data?.vendors ?? []).option.vendor : undefined);
  const vendorId = (name?: string) => (name ? data?.vendors.find(v => v.name === name)?.id : undefined);

  phases.forEach((ph, pi) => {
    const gl = new Date(ph.goLive).getTime(); const share = ph.itKw / totalKw;
    for (const l of lines) {
      if (l.firstOnly && pi > 0) continue;
      const lt = leadWeeksFor(l.lead, benchmarks, contingencyPct);
      const needBy = gl - l.weeksBefore * WEEK;
      let source: ScheduleItem['source'] = 'procure'; let lead = lt.leadWeeks; let note: string | undefined;
      if (l.models && l.units && data) {
        const need = Math.max(1, Math.round(l.units * (phases.length > 1 ? share : 1)));
        let have = 0; for (const m of l.models) { const st = stockOf(m); const take = Math.min(st, need - have); if (take > 0) { stockLeft.set(m, st - take); have += take; } }
        if (have >= need) { source = 'stock'; lead = TRANSFER_WEEKS; note = `${need} unit(s) of ${l.models.join(' / ')} in free stock: transfer only`; }
        else if (have > 0) { source = 'mixed'; note = `${have} of ${need} from stock, ${need - have} to buy`; }
      }
      const buffer = source === 'stock' ? 0 : lt.bufferWeeks;
      const orderBy = needBy - (lead + buffer) * WEEK;
      let late = orderBy < now; let status: ScheduleItem['status'] = source === 'stock' ? 'stock' : 'to order'; let poId: string | undefined;
      if (completed) { late = false; status = 'ordered'; }
      else if (approved && data && source !== 'stock') {
        const vid = vendorId(vendorOf(l.kind));
        const po = pos.find(x => (!x.planPhaseId || x.planPhaseId === ph.id) && (!vid || x.vendorId === vid));
        if (po) { poId = po.poId ?? po.id; if (po.status === 'Draft') { late = new Date(po.orderBy ?? new Date(orderBy).toISOString()).getTime() < now; status = late ? 'late' : 'to order'; note = `${poId} is still a draft${late ? ' after its order-by date' : ''}`; } else { late = false; status = 'ordered'; note = `${poId} ${po.status.toLowerCase()}`; } }
        else { status = late ? 'late' : 'to order'; note = late ? 'no purchase order raised and the order-by date has passed' : 'no purchase order yet'; }
      } else if (late) status = 'late';
      items.push({ item: l.item, leadItem: l.lead, leadWeeks: lead, bufferWeeks: buffer, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late, phase: ph.name, phaseId: ph.id, kind: 'equipment', source, note: note ?? `${lt.leadWeeks} weeks (${lt.source})${buffer ? ` + ${buffer} weeks buffer` : ''}`, poId, status });
    }
    const gates: [string, number][] = plan.scope === 'new-dc' ? [['Shell complete (civil input)', 36], ['Power on', 20], ['Cooling commissioned', 12], ['Network live', 6], ['Go-live readiness', 1]] : plan.scope === 'expansion' ? [['Shell complete (civil input)', 28], ['Power on', 16], ['Commissioning level 5', 4], ['Go-live readiness', 1]] : plan.scope === 'rack' ? [['Change approved', 1]] : [['Design review', 12], ['Commissioning complete', 2], ['Go-live readiness', 1]];
    for (const [g, w] of gates) items.push({ item: g, leadWeeks: 0, needBy: new Date(gl - w * WEEK).toISOString(), orderBy: new Date(gl - w * WEEK).toISOString(), late: false, phase: ph.name, phaseId: ph.id, kind: 'gate', status: 'gate' });
  });
  for (const pm of plan.permits) { const needBy = new Date(pm.neededBefore).getTime(); const orderBy = needBy - pm.leadWeeks * WEEK; const late = !completed && pm.status === 'Not started' && orderBy < now; items.push({ item: `Permit · ${pm.name}`, leadWeeks: pm.leadWeeks, needBy: pm.neededBefore, orderBy: new Date(orderBy).toISOString(), late, phase: phases[0].name, phaseId: phases[0].id, kind: 'permit', status: 'permit', note: `${pm.authority}, ${pm.status.toLowerCase()}` }); }
  return items.sort((a, b) => a.orderBy.localeCompare(b.orderBy));
}

/* ================================================================== sustainability */
export interface Sustainability { pue: number; wue: number; energyMwhYear: number; carbonTYear: number; renewableSharePct: number; heatReuseMwhYear: number }
export function sustainability(_plan: T.PlannerPlan, p: P, sizing: Sizing, est: Estimate, benchmarks: T.PlannerBenchmark[]): Sustainability {
  const carbon = benchmarks.find(b => b.metric === 'carbonKgPerKwh')?.value ?? 0.38;
  const renewable = num(p, 'renewableSharePct', 50);
  const hr = sizing.cooling.heatRejection;
  const adiabatic = hr.streams.some(s => s.method === 'adiabatic cooler');
  const wue = ['liquid-to-chip', 'immersion'].includes(sizing.cooling.type) ? (adiabatic ? 0.3 : 0.15) : sizing.cooling.type === 'chilled-water' ? 0.9 : sizing.cooling.type === 'air-economiser' ? 0.4 : 0.6;
  return { pue: sizing.pue.value, wue, energyMwhYear: est.energyMwhYear, carbonTYear: r0((est.energyMwhYear * 1000 * carbon * (1 - renewable / 100)) / 1000), renewableSharePct: renewable, heatReuseMwhYear: sizing.cooling.liquidKw > 0 ? r0(est.energyMwhYear * 0.35 * (sizing.cooling.liquidKw / Math.max(1, sizing.itKw))) : 0 };
}

/* ================================================================== readiness */
export interface AspectScore { aspect: T.PlannerAspect; depth: T.PlannerAspectDepth; answered: number; total: number; pct: number; findings: Finding[]; /** Inputs still on an untouched template default (not counted as answered). */ defaults?: number }
/** Sources that count as an answer: entered, from requirements, benchmark, estate actual, document or accepted AI. A template default left as it is does not. */
const CONFIRMED: T.PlannerParamSource[] = ['user', 'requirement', 'benchmark', 'actual', 'document', 'ai'];
export function aspectScores(resolved: ResolvedTemplate | null, plan: T.PlannerPlan, findings: Finding[], effective?: Record<string, Sourced<ParamValue>>): AspectScore[] {
  const req = resolved?.template.requiredAspects ?? [];
  const params = resolved?.params ?? [];
  return req.filter(r => r.depth !== 'skipped').map(r => {
    const keys = params.filter(x => x.aspect === r.aspect).map(x => x.key);
    let answered = 0, defaults = 0;
    for (const k of keys) {
      const src = plan.params[k] !== undefined ? (plan.paramSources[k] ?? 'user') : undefined;
      if (src && CONFIRMED.includes(src)) answered++;
      else if (src === 'template' || effective?.[k] !== undefined) defaults++;
    }
    const extra = r.aspect === 'risk' ? (plan.risks.length ? 1 : 0) : r.aspect === 'compliance' ? (plan.permits.length ? 1 : 0) : r.aspect === 'schedule' ? (plan.phases.length ? 1 : 0) : 0;
    const total = keys.length + (['risk', 'compliance', 'schedule'].includes(r.aspect) ? 1 : 0);
    return { aspect: r.aspect, depth: r.depth, answered: answered + extra, total, pct: total ? r0(((answered + extra) / total) * 100) : 100, findings: findings.filter(f => f.rule.aspect === r.aspect), defaults };
  });
}

/* ================================================================== evaluate */
export interface Evaluation {
  params: Record<string, Sourced<ParamValue>>; resolved: ResolvedTemplate | null; sizing: Sizing; ladder: LadderRow[]; estimate: Estimate; findings: Finding[]; schedule: ScheduleItem[]; sustainability: Sustainability; aspects: AspectScore[];
  hardFails: number; softWarns: number; readinessPct: number; bindingConstraint: LadderRow['bindingConstraint'];
  /** Everything the hooks saw: the plan, the platform data and the site baselines (when loaded). */
  ctx: ScopeCtx;
  /** Results computed by the plan type's family (see lib/scopes); read with the family's own getters. */
  scope: Record<string, unknown>;
  /** Bill of materials against the estimate (whole-site scopes show it on the Cost tab). */
  reconciliation?: Reconciliation;
  /** Inputs still on untouched template defaults (shown separately from readiness). */
  defaultsCount?: number;
  /** The planner's bill of materials changes against the proposal (plan.materialOverrides), when there are any. */
  materials?: MaterialsEffect;
}
/** The plan as a scenario sees it: its phases replaced when the scenario carries phase overrides. */
export function planForScenario(plan: T.PlannerPlan, scenario?: T.PlannerScenario | null): T.PlannerPlan {
  return scenario?.phaseOverrides?.length ? { ...plan, phases: scenario.phaseOverrides } : plan;
}
/**
 * Evaluate a plan. `data` is the platform data (see plannerData.ts); without it the engine
 * still runs, but checks against the real site are reported as not checked.
 */
export function evaluate(basePlan: T.PlannerPlan, scenario: T.PlannerScenario | null | undefined, templates: T.PlannerTemplate[], benchmarks: T.PlannerBenchmark[], actuals?: EstateActuals, data?: PlannerData): Evaluation {
  const plan = planForScenario(basePlan, scenario);
  const resolved = resolveTemplate(plan.templateId, templates);
  const profile = templates.find(t => t.kind === 'profile' && t.dcTypeKey === plan.dcTypeKey) ?? null;
  const params = effectiveParams(resolved, plan, scenario, profile);
  const ctx: ScopeCtx = {
    plan, scenario, params, templates, benchmarks, actuals, data,
    site: data && plan.dataCenterId ? siteBaseline(data, plan.dataCenterId, { excludePlanId: plan.id }) : undefined,
    peerSite: data && plan.peerDataCenterId ? siteBaseline(data, plan.peerDataCenterId, { excludePlanId: plan.id }) : undefined,
    campus: data && plan.campusId && plan.scope === 'expansion' ? campusBaseline(data, plan.campusId, { excludePlanId: plan.id }) : undefined,
  };
  const model = modelFor(plan.scope);
  let sizing = size(plan, params, benchmarks, actuals);
  if (model.size) sizing = model.size(ctx, sizing);
  let ladder = capacityLadder(plan, params, sizing, ctx);
  if (model.ladder) ladder = model.ladder(ctx, sizing, ladder);
  let est = estimate(plan, params, sizing, benchmarks, actuals, data);
  if (model.estimate) est = scopeCashflow(plan, params, sizing, model.estimate(ctx, sizing, est), est);
  let sched = schedule(plan, sizing, benchmarks, params, { data, it: est.it });
  if (model.schedule) sched = model.schedule(ctx, sizing, sched);
  const sus = sustainability(plan, params, sizing, est, benchmarks);
  const ev: Evaluation = { params, resolved, sizing, ladder, estimate: est, findings: [], schedule: sched, sustainability: sus, aspects: [], hardFails: 0, softWarns: 0, readinessPct: 0, bindingConstraint: 'none', ctx, scope: {} };
  if (model.analyse) ev.scope = model.analyse(ctx, ev);
  let bom: Bom | undefined;
  try { bom = buildBom(plan, ev, benchmarks); } catch { bom = undefined; }
  if (bom && plan.materialOverrides?.length) {
    // The planner's bill changes (Materials tab): one CapEx line for the difference against the proposal, the order schedule re-laid.
    const proposal = buildBom(plan, ev, benchmarks, { proposal: true });
    const fx = compareBoms(proposal, bom, plan.materialOverrides, bom.materials?.stale, bom.materials?.warnings);
    ev.materials = fx;
    if (fx.delta) {
      const line = materialsEstimateLine(fx);
      let est2 = estimate(plan, params, sizing, benchmarks, actuals, data, [line]);
      if (model.estimate) {
        const fam = model.estimate(ctx, sizing, est2);
        const withLine = fam.capex.some(l => l.item === MATERIAL_CHANGES_ITEM) ? fam : { ...fam, capex: [...fam.capex, line], capexTotal: fam.capexTotal + line.amount, plantCapexTotal: fam.plantCapexTotal + line.amount, capexPerRack: sizing.racks ? r0((fam.capexTotal + line.amount) / sizing.racks) : fam.capexPerRack };
        est2 = scopeCashflow(plan, params, sizing, withLine, est2);
      }
      ev.estimate = est = est2;
    }
    const contingencyPct = num(params, 'contingencyPct', 15);
    ev.schedule = sched = scheduleWithMaterials(sched, plan, proposal, bom, item => leadWeeksFor(item, benchmarks, contingencyPct), m => (data?.ready ? freeStock(data, m, plan.dataCenterId, plan.id).length : 0));
  }
  try { ev.reconciliation = bom ? reconcile(est, bom) : undefined; } catch { ev.reconciliation = undefined; }
  const findings = evaluateRules(resolved?.rules ?? [], plan, params, sizing, est, benchmarks, sched, model.check ? (rule => model.check!(ctx, rule, ev)) : undefined, ctx, ev.reconciliation);
  const aspects = aspectScores(resolved, plan, findings, params);
  ev.findings = findings; ev.aspects = aspects;
  ev.hardFails = findings.filter(f => f.status === 'fail').length; ev.softWarns = findings.filter(f => f.status === 'warn').length;
  ev.readinessPct = aspects.length ? r0(aspects.reduce((a, x) => a + x.pct, 0) / aspects.length) : 0;
  ev.defaultsCount = aspects.reduce((a, x) => a + (x.defaults ?? 0), 0);
  ev.bindingConstraint = ladder.find(l => l.bindingConstraint !== 'none')?.bindingConstraint ?? 'none';
  return ev;
}

export const ASPECT_LABEL: Record<T.PlannerAspect, string> = { space: 'Space and layout', power: 'Power', cooling: 'Cooling and thermal', network: 'Network and connectivity', it: 'Compute, storage and GPU', fire: 'Fire, life safety and water', security: 'Physical security', sustainability: 'Environment and sustainability', resilience: 'Resilience and tier', operations: 'Operations and staffing', supply: 'Supply chain', schedule: 'Schedule and dependencies', finance: 'Finance', compliance: 'Compliance and permits', commissioning: 'Commissioning and handover', migration: 'Migration and cut-over', risk: 'Risk' };
export const SCOPE_LABEL: Record<T.PlannerScope, string> = { rack: 'Rack placement', pod: 'Pod, row or cage', hall: 'Hall fit-out', retrofit: 'Densification or liquid retrofit', plant: 'Plant upgrade', network: 'Network uplift', expansion: 'Site expansion', 'new-dc': 'New data centre', portfolio: 'Regional portfolio', migration: 'Migration or decommission', edge: 'Edge rollout', 'server-refresh': 'Server refresh or replacement', 'network-refresh': 'Network device refresh', 'rack-replace': 'Rack replacement' };
export const SOURCE_LABEL: Record<T.PlannerParamSource, string> = { user: 'Entered', requirement: 'From your requirements', template: 'Template default', benchmark: 'Benchmark', actual: 'Estate actual', document: 'From document', ai: 'Proposed' };
/** A USD figure in the geography's money when the app registered its formatter (compat/registry), else short USD. */
export function fmtUsd(n: number): string { const f = plannerMoney(); if (f) return f(n); return Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`; }
export function fmtKw(kw: number): string { return kw >= 1000 ? `${(kw / 1000).toFixed(kw >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`; }
export { r0, r1, r2 };
