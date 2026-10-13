/**
 * Plant upgrade model — the plant a live site has today, what the plan adds, and what happens
 * to redundancy while each item is cut in.
 *
 *  - Baseline per system from the site's records: utility feeds, transformers, UPS, generators,
 *    chillers and room cooling (CRAH, CRAC, CDU per zone). For each: installed, usable at the
 *    target redundancy, measured load, capacity held by other plans, and the headroom.
 *  - The plan's plant lines (add / replace / uprate) give the to-be plant per stage. Sizing is
 *    "required at the target redundancy minus usable existing": the suggested quantity is the
 *    smallest number of units of the chosen rating that closes the gap (N+1 = ceil(load/unit)+1).
 *  - Capacity enabled = the IT load the site can still accept after the works (lowest system).
 *  - Cut-in sequence: for each step, what is isolated, what remains and whether it carries the
 *    live load, the redundancy left, the racks, services and customers exposed (UPS → PDU → rack
 *    feed → rack → devices → services), the window and its clashes, and temporary plant.
 *  - Bill of materials from the plant lines plus the standard works, and the schedule with the
 *    plant gates (MOP approved → FAT → delivery → cut-ins → L4 → L5 IST → handover) per stage.
 *
 * Pure functions: no React, no engine or outputs calls (types only).
 */
import type * as T from '../p2b/types';
import type { Estimate, EstimateLine, LadderRow, ParamValue, ScheduleItem, Sourced } from './engine';
import { leadWeeksFor } from './engine';
import type { BomItem } from './outputs';
import { byId, groupBy, type PlannerData } from './plannerData';
import { KVA_TO_KW, usableAt, type SiteBaseline } from './site';
import { clashes, impactOf, nextFreeWindow, type Clash } from './impact';
import { clockMs } from '../compat/clock';

type Params = Record<string, Sourced<ParamValue>>;
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const WEEK = 7 * 864e5;
const num = (p: Params, k: string, d: number) => { const v = p[k]?.value; const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d; };
const str = (p: Params, k: string, d: string) => { const v = p[k]?.value; return v === undefined || v === '' ? d : String(v); };
const kwFmt = (kw: number) => (Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(Math.abs(kw) >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`);

/* ================================================================== systems */
export type PlantSystem = 'utility' | 'transformer' | 'ups' | 'generator' | 'chiller' | 'cooling';
export const SYSTEM_LABEL: Record<PlantSystem, string> = { utility: 'Utility feeds', transformer: 'Transformers', ups: 'UPS', generator: 'Generators', chiller: 'Chillers and heat rejection', cooling: 'Room cooling (CRAH, CRAC, CDU)' };
export const SYSTEM_ORDER: PlantSystem[] = ['utility', 'transformer', 'generator', 'ups', 'chiller', 'cooling'];
/** Which system each kind of plant line belongs to. */
export const LINE_SYSTEM: Record<T.PlannerPlantLine['system'], PlantSystem> = { UPS: 'ups', Battery: 'ups', Generator: 'generator', Transformer: 'transformer', Switchgear: 'transformer', Chiller: 'chiller', 'Dry cooler': 'chiller', CRAH: 'cooling', CDU: 'cooling' };
export const POWER_SYSTEMS: PlantSystem[] = ['utility', 'transformer', 'generator', 'ups'];
export const LINE_SYSTEMS = Object.keys(LINE_SYSTEM) as T.PlannerPlantLine['system'][];
/** Heat the chillers reject per kW of IT: IT plus UPS and distribution losses and lighting (conservative). */
export const HEAT_FACTOR = 1.1;
/** Continuous rating of a generator quoted at its standby (ESP) rating (ISO 8528: prime is about 90% of standby). */
export const PRIME_OF_STANDBY = 0.9;
/** Default power factors: transformers at the design 0.95, generators at the 0.8 they are rated at, UPS at 0.9 when only kVA is known. */
export const DEFAULT_PF: Partial<Record<T.PlannerPlantLine['system'], number>> = { Transformer: KVA_TO_KW, Generator: 0.8, UPS: 0.9 };

export interface PlantUnit {
  id: string; name: string; system: PlantSystem; capacityKw: number; ratingKva?: number; loadKw: number;
  side?: 'A' | 'B'; role?: string; status?: string; feedId?: string; zoneId?: string; model?: string;
  /** New unit from a plant line (not in the records yet). */
  lineId?: string; isNew?: boolean; stage?: number;
}
export interface SystemState {
  system: PlantSystem; label: string;
  /** False when the site has no records for the system; it is then left out of the capacity figures. */
  recorded: boolean;
  /** Carries facility load (IT × PUE) or heat (IT × 1.1) rather than IT load. */
  factor: number; factorNote: string;
  redundancy: string; units: PlantUnit[];
  installedKw: number; usableKw: number; redundantKw: number;
  /** Measured load on the system (system terms) and where it comes from. */
  loadKw: number; loadSource: 'measured' | 'estimated from IT load';
  reservedKw: number; pipelineKw: number; committedKw: number;
  /** Needed after the plan: (committed + plan load × factor) × margin. */
  requiredKw: number; margin: number;
  headroomKw: number;
  /** IT load the system can carry at its redundancy and margin. */
  supportsItKw: number;
  basis: string;
}
export interface PlantBaseline {
  pue: number; itLoadKw: number; itReservedKw: number; itPipelineKw: number; committedItKw: number; planKw: number;
  systems: SystemState[]; zones: { zone: T.CoolingZone; units: PlantUnit[]; usableKw: number; loadKw: number }[];
  /** IT kW the site can accept today (lowest recorded system) and which system binds. */
  headroomItKw: number; binding?: PlantSystem;
  runtimeMin?: number; warnings: string[];
}

const LIVE = (s?: string) => s !== 'Failed' && s !== 'Planned' && s !== 'Retired';
const sideOf = (role?: string): 'A' | 'B' | undefined => (role === 'A-side' ? 'A' : role === 'B-side' ? 'B' : undefined);
const roleOf = (side?: 'A' | 'B') => (side === 'A' ? 'A-side' : side === 'B' ? 'B-side' : undefined);

/** Redundancy pattern each system is checked at. */
export function targetRedundancy(system: PlantSystem, p: Params, units: PlantUnit[]): string {
  const sides = units.some(u => u.side === 'A') && units.some(u => u.side === 'B');
  switch (system) {
    case 'ups': return str(p, 'redundancy', 'N+1');
    case 'chiller': case 'cooling': return str(p, 'coolingRedundancy', 'N+1');
    case 'utility': return sides ? '2N' : 'N';
    case 'transformer': return sides ? '2N' : units.length > 1 ? 'N+1' : 'N';
    case 'generator': return units.length > 1 || units.some(u => u.isNew) ? 'N+1' : 'N';
  }
}
/** Usable capacity of a set of units at a pattern (one side for 2N, largest unit lost for N+1). */
export function usable(redundancy: string, units: PlantUnit[]): number {
  return usableAt(redundancy, units.map(u => ({ capacityKw: u.capacityKw, role: roleOf(u.side) })));
}

/** kW of one unit of a plant line (kVA × power factor when only kVA is given; generators derated to prime when quoted at standby). */
export function lineUnitKw(line: T.PlannerPlantLine, tier?: string): { kw: number; note: string } {
  const pf = line.powerFactor ?? DEFAULT_PF[line.system] ?? 1;
  const base = line.ratingKw > 0 ? line.ratingKw : (line.ratingKva ?? 0) * pf;
  const note = line.ratingKw > 0 ? `${kwFmt(line.ratingKw)}` : line.ratingKva ? `${line.ratingKva.toLocaleString('en-US')} kVA × ${pf} = ${kwFmt(base)}` : 'no rating';
  if (line.system === 'Generator' && (line.ratingBasis ?? 'Standby (ESP)') === 'Standby (ESP)' && (tier === 'Tier III' || tier === 'Tier IV')) return { kw: base * PRIME_OF_STANDBY, note: `${note} standby × ${PRIME_OF_STANDBY} = ${kwFmt(base * PRIME_OF_STANDBY)} prime (${tier} needs a prime or continuous rating)` };
  return { kw: base, note };
}
/** Lines that change capacity (batteries and switchgear do not). */
const changesCapacity = (l: T.PlannerPlantLine) => l.system !== 'Battery' && l.system !== 'Switchgear';

/* ================================================================== baseline */
export function plantBaseline(data: PlannerData, plan: T.PlannerPlan, site: SiteBaseline, p: Params, benchmarks: T.PlannerBenchmark[]): PlantBaseline {
  const dcId = site.dc.id; const warnings: string[] = [];
  const pue = num(p, 'pueTarget', site.pue) || site.pue;
  const tier = str(p, 'tier', site.dc.tier);
  const margin = 1 + num(p, 'plantDesignMarginPct', 10) / 100;
  const genMargin = benchmarks.find(b => b.metric === 'generatorMargin')?.value ?? 1.25;
  const coolMargin = benchmarks.find(b => b.metric === 'coolingMargin')?.value ?? 1.1;
  const itLoad = site.itLoadKw; const itRes = site.reservedKw; const itPipe = site.pipelineKw;
  const committedIt = itLoad + itRes + itPipe; const planKw = Math.max(0, plan.designPowerKw);
  const feeds = groupBy(data, 'utilityFeeds', 'dataCenterId').get(dcId) ?? [];
  const feedSide = (feedId?: string) => sideOf(feeds.find(f => f.id === feedId)?.redundancyRole);
  const genStandby = str(p, 'generatorRecordedAs', 'Standby (ESP)') === 'Standby (ESP)' && (tier === 'Tier III' || tier === 'Tier IV');

  const unitsOf: Record<PlantSystem, PlantUnit[]> = {
    utility: feeds.map(f => ({ id: f.id, name: f.name, system: 'utility', capacityKw: f.capacityKw, loadKw: 0, side: sideOf(f.redundancyRole), role: f.redundancyRole })),
    transformer: data.transformers.filter(t => feeds.some(f => f.id === t.feedId) && LIVE(t.status)).map(t => ({ id: t.id, name: t.name, system: 'transformer', capacityKw: r0(t.capacityKva * KVA_TO_KW), ratingKva: t.capacityKva, loadKw: t.loadKw || 0, side: feedSide(t.feedId), feedId: t.feedId, status: t.status, model: t.model })),
    ups: (groupBy(data, 'upsUnits', 'dataCenterId').get(dcId) ?? []).filter(u => LIVE(u.status)).map(u => ({ id: u.id, name: u.name, system: 'ups', capacityKw: u.capacityKw, loadKw: u.loadKw || 0, side: feedSide(u.feedId), feedId: u.feedId, status: u.status, model: [u.manufacturer, u.model].filter(Boolean).join(' ') || undefined })),
    generator: (groupBy(data, 'generators', 'dataCenterId').get(dcId) ?? []).filter(g => LIVE(g.status)).map(g => ({ id: g.id, name: g.name, system: 'generator', capacityKw: r0(g.capacityKw * (genStandby ? PRIME_OF_STANDBY : 1)), ratingKva: g.capacityKva, loadKw: 0, status: g.status, model: g.model, role: g.redundancyRole })),
    chiller: (groupBy(data, 'chillers', 'dataCenterId').get(dcId) ?? []).filter(c => LIVE(c.status)).map(c => ({ id: c.id, name: c.name, system: 'chiller', capacityKw: c.capacityKw, loadKw: c.loadKw || 0, status: c.status, model: c.model })),
    cooling: [],
  };
  const zonesRaw = groupBy(data, 'coolingZones', 'dataCenterId').get(dcId) ?? [];
  const coolRed = str(p, 'coolingRedundancy', 'N+1');
  const zones = zonesRaw.map(z => {
    const units: PlantUnit[] = (groupBy(data, 'cracUnits', 'coolingZoneId').get(z.id) ?? []).filter(u => LIVE(u.status)).map(u => ({ id: u.id, name: u.name, system: 'cooling' as const, capacityKw: u.capacityKw, loadKw: 0, zoneId: z.id, status: u.status, model: u.model ?? u.type }));
    unitsOf.cooling.push(...units);
    const rated = units.filter(u => u.capacityKw > 0);
    // Units without a rating: fall back to the zone's recorded capacity, with no redundancy credit.
    const usableKw = rated.length ? Math.min(z.coolingCapacityKw || Infinity, usable(coolRed, rated)) : z.coolingCapacityKw > 0 ? z.coolingCapacityKw - (units.length > 1 ? z.coolingCapacityKw / units.length : 0) : 0;
    if (units.length && !rated.length) warnings.push(`${z.name}: cooling units have no rating recorded; ${z.coolingCapacityKw > 0 ? 'the zone capacity is used with one unit lost' : 'the zone has no usable cooling on record'}`);
    return { zone: z, units, usableKw: r1(usableKw), loadKw: z.currentLoadKw || 0 };
  });

  const systems: SystemState[] = SYSTEM_ORDER.map(system => {
    const units = unitsOf[system];
    // A system counts as recorded when it has rated units (cooling: or a zone capacity).
    const recorded = system === 'cooling' ? zones.some(z => z.usableKw > 0 || z.units.some(u => u.capacityKw > 0)) : units.some(u => u.capacityKw > 0);
    const factor = system === 'utility' || system === 'transformer' || system === 'generator' ? pue : system === 'chiller' ? HEAT_FACTOR : 1;
    const factorNote = factor === pue ? `facility load = IT × PUE ${pue}` : factor === HEAT_FACTOR ? `heat = IT × ${HEAT_FACTOR} (IT plus electrical losses and lighting)` : 'IT load';
    const m = system === 'generator' ? genMargin : system === 'chiller' || system === 'cooling' ? coolMargin : margin;
    const red = targetRedundancy(system, p, units);
    const usableKw = system === 'cooling' ? zones.reduce((a, z) => a + z.usableKw, 0) : usable(red, units);
    const installed = units.reduce((a, u) => a + u.capacityKw, 0);
    const measured = system === 'ups' || system === 'transformer' || system === 'chiller' ? units.reduce((a, u) => a + u.loadKw, 0) : system === 'cooling' ? zones.reduce((a, z) => a + z.loadKw, 0) : 0;
    const loadKw = measured > 0 ? measured : itLoad * factor;
    const reservedKw = (system === 'cooling' || system === 'chiller' ? site.reservedCoolingKw || itRes : itRes) * factor;
    const pipelineKw = itPipe * factor;
    const committedKw = loadKw + reservedKw + pipelineKw;
    const requiredKw = (committedKw + planKw * factor) * m;
    const supportsItKw = usableKw / (factor * m);
    return {
      system, label: SYSTEM_LABEL[system], recorded, factor, factorNote, redundancy: red, units,
      installedKw: r0(installed), usableKw: r0(usableKw), redundantKw: r0(installed - usableKw), loadKw: r0(loadKw), loadSource: measured > 0 ? 'measured' : 'estimated from IT load',
      reservedKw: r0(reservedKw), pipelineKw: r0(pipelineKw), committedKw: r0(committedKw), requiredKw: r0(requiredKw), margin: m,
      headroomKw: r0(usableKw - committedKw * m), supportsItKw: r0(supportsItKw),
      basis: `${red}${system === 'cooling' ? ' per zone' : ''}; ${factorNote}; margin ×${m}`,
    };
  });
  for (const s of systems) if (!s.recorded) warnings.push(`No ${s.label.toLowerCase()} recorded at ${site.dc.name}; that system is not checked`);
  const rec = systems.filter(s => s.recorded);
  const head = rec.map(s => ({ s: s.system, h: s.supportsItKw - committedIt }));
  const bind = head.sort((a, b) => a.h - b.h)[0];
  const runtimes = (groupBy(data, 'upsUnits', 'dataCenterId').get(dcId) ?? []).filter(u => LIVE(u.status)).map(u => u.runtimeMinutes).filter(x => x > 0);
  return { pue, itLoadKw: r1(itLoad), itReservedKw: r1(itRes), itPipelineKw: r1(itPipe), committedItKw: r1(committedIt), planKw, systems, zones, headroomItKw: r0(bind?.h ?? 0), binding: bind?.s, runtimeMin: runtimes.length ? Math.min(...runtimes) : undefined, warnings };
}

/* ================================================================== to-be */
export interface LineResult {
  line: T.PlannerPlantLine; system: PlantSystem; unitKw: number; ratingNote: string;
  target?: PlantUnit; problems: string[];
  /** Suggested quantity to meet the requirement on its own (other lines of the system kept as entered). */
  suggestedQty?: number; suggestionNote?: string;
}
export interface SystemAfter { system: PlantSystem; units: PlantUnit[]; usableKw: number; installedKw: number; requiredKw: number; ok: boolean; supportsItKw: number; addedKw: number; removedKw: number; deltaUsableKw: number }
export interface StageAfter { stage: number; systems: SystemAfter[]; headroomItKw: number; binding?: PlantSystem }

/** All existing units by id (for targets). */
function unitIndex(b: PlantBaseline): Map<string, PlantUnit> { const m = new Map<string, PlantUnit>(); for (const s of b.systems) for (const u of s.units) m.set(u.id, u); for (const z of b.zones) m.set(z.zone.id, { id: z.zone.id, name: z.zone.name, system: 'cooling', capacityKw: z.usableKw, loadKw: z.loadKw, zoneId: z.zone.id }); return m; }

/** New units a line brings, with their side or zone. */
export function newUnits(line: T.PlannerPlantLine, unitKw: number, target: PlantUnit | undefined, startIndex: number): PlantUnit[] {
  const system = LINE_SYSTEM[line.system];
  const qty = Math.max(0, Math.round(line.qty));
  return Array.from({ length: line.action === 'uprate' ? 0 : qty }, (_, i) => {
    const side = line.side ?? target?.side ?? (system === 'ups' || system === 'transformer' ? ((startIndex + i) % 2 === 0 ? 'A' : 'B') : undefined);
    return { id: `NEW-${line.id}-${i + 1}`, name: `${line.system === 'CRAH' || line.system === 'CDU' ? line.system : line.system} ${line.model ? `${line.model} ` : ''}#${i + 1} (new)`, system, capacityKw: unitKw, ratingKva: line.ratingKva, loadKw: 0, side, zoneId: line.zoneId ?? target?.zoneId, feedId: target?.feedId, lineId: line.id, isNew: true, stage: line.stage ?? 1, model: line.model };
  });
}

/** Units of every system after the lines up to `stage` are in. */
export function applyLines(b: PlantBaseline, lines: T.PlannerPlantLine[], tier: string, stage = Infinity): Map<PlantSystem, PlantUnit[]> {
  const idx = unitIndex(b);
  const out = new Map<PlantSystem, PlantUnit[]>(b.systems.map(s => [s.system, [...s.units]]));
  let n = 0;
  for (const l of lines.filter(x => (x.stage ?? 1) <= stage && changesCapacity(x))) {
    const system = LINE_SYSTEM[l.system]; const list = out.get(system) ?? [];
    const target = l.targetAssetId ? idx.get(l.targetAssetId) : undefined;
    const { kw } = lineUnitKw(l, tier);
    if (l.action === 'uprate' && target && target.system === system) { out.set(system, list.map(u => (u.id === target.id ? { ...u, capacityKw: kw, name: `${u.name} (uprated)` } : u))); continue; }
    const kept = l.action === 'replace' && target ? list.filter(u => u.id !== target.id) : list;
    const added = newUnits(l, kw, target, n); n += added.length;
    out.set(system, [...kept, ...added]);
  }
  return out;
}

function systemAfter(b: PlantBaseline, s: SystemState, units: PlantUnit[], p: Params): SystemAfter {
  const red = targetRedundancy(s.system, p, units);
  let usableKw: number;
  if (s.system === 'cooling') {
    const coolRed = str(p, 'coolingRedundancy', 'N+1');
    const zoneIds = [...new Set([...b.zones.map(z => z.zone.id), ...units.map(u => u.zoneId).filter(Boolean) as string[]])];
    usableKw = zoneIds.reduce((a, zid) => { const z = b.zones.find(x => x.zone.id === zid); const zu = units.filter(u => u.zoneId === zid && u.capacityKw > 0); const cap = z?.zone.coolingCapacityKw && !zu.some(u => u.isNew) ? z.zone.coolingCapacityKw : Infinity; return a + (zu.length ? Math.min(cap, usable(coolRed, zu)) : 0); }, 0);
    const unzoned = units.filter(u => !u.zoneId && u.capacityKw > 0); if (unzoned.length) usableKw += usable(coolRed, unzoned);
  } else usableKw = usable(red, units);
  const installed = units.reduce((a, u) => a + u.capacityKw, 0);
  const before = new Set(s.units.map(u => u.id));
  const addedKw = units.filter(u => u.isNew).reduce((a, u) => a + u.capacityKw, 0);
  const removedKw = s.units.filter(u => !units.some(x => x.id === u.id)).reduce((a, u) => a + u.capacityKw, 0) + units.filter(u => before.has(u.id) && /uprated/.test(u.name)).reduce((a, u) => a + Math.max(0, (s.units.find(x => x.id === u.id)?.capacityKw ?? 0) - u.capacityKw), 0);
  return { system: s.system, units, usableKw: r0(usableKw), installedKw: r0(installed), requiredKw: s.requiredKw, ok: !units.length ? true : usableKw >= s.requiredKw, supportsItKw: r0(usableKw / (s.factor * s.margin)), addedKw: r0(addedKw), removedKw: r0(removedKw), deltaUsableKw: r0(usableKw - s.usableKw) };
}

/** Smallest quantity of `unitKw` units that brings the system to its requirement at the target redundancy. */
export function suggestQty(b: PlantBaseline, s: SystemState, base: PlantUnit[], unitKw: number, p: Params, zoneId?: string): { qty: number; note: string } {
  if (unitKw <= 0) return { qty: 0, note: 'Enter a rating to size the quantity' };
  for (let k = 0; k <= 60; k++) {
    const extra: PlantUnit[] = Array.from({ length: k }, (_, i) => ({ id: `S${i}`, name: 'x', system: s.system, capacityKw: unitKw, loadKw: 0, side: s.system === 'ups' || s.system === 'transformer' ? (i % 2 === 0 ? 'A' : 'B') : undefined, zoneId: zoneId ?? b.zones[0]?.zone.id, isNew: true }));
    const after = systemAfter(b, s, [...base, ...extra], p);
    if (after.usableKw >= s.requiredKw) {
      const n = Math.ceil(s.requiredKw / unitKw);
      const red = targetRedundancy(s.system, p, [...base, ...extra]);
      return { qty: k, note: `${s.recorded ? '' : 'No existing units recorded, so sized on its own: '}${kwFmt(s.requiredKw)} needed at ${red}${red === 'N+1' && base.every(u => Math.abs(u.capacityKw - unitKw) < 1) ? ` = ceil(${kwFmt(s.requiredKw)} ÷ ${kwFmt(unitKw)}) + 1 = ${n + 1} units; ${base.length} in place` : ''}; usable ${kwFmt(s.usableKw)} today → ${k} × ${kwFmt(unitKw)} closes the gap` };
    }
  }
  return { qty: 60, note: 'More than 60 units would be needed; check the rating or the load' };
}

/* ================================================================== cut-ins */
export type RedundancyLeft = 'N+1 or better' | 'N' | 'Below N' | 'Unprotected (raw mains)';
export interface CutInResult {
  step: T.PlannerCutInStep; order: number; system?: PlantSystem; isolated: PlantUnit[]; missing: string[];
  remaining: PlantUnit[]; remainingKw: number; temporaryKw: number; liveLoadKw: number; redundancyLeft: RedundancyLeft; ok: boolean;
  exposedRackIds: string[]; exposedDeviceIds: string[]; services: number; critical: number; customers: { name: string; revenueMonthly: number; critical: number }[]; revenueMonthly: number;
  window: { start: string; end: string; proposed: boolean }; clashes: Clash[];
  needsTemporaryPlant: boolean; temporaryLine?: { item: string; spec: string; days: number; kw: number; dailyUsd: number; mobilisationUsd: number };
  notes: string[];
}
/** Racks fed through a unit: UPS → PDUs → rack feeds; transformer or feed → the UPS on that feed; cooling → zone halls. */
export function racksBehind(data: PlannerData, u: PlantUnit, dcId: string): string[] {
  const out = new Set<string>();
  const pduRacks = (upsId: string) => { for (const pdu of data.pdus.filter(x => x.upsId === upsId)) for (const f of groupBy(data, 'powerFeeds', 'pduId').get(pdu.id) ?? []) if (f.rackId) out.add(f.rackId); };
  if (u.system === 'ups') pduRacks(u.id);
  else if (u.system === 'transformer' || u.system === 'utility') { const feedId = u.system === 'utility' ? u.id : u.feedId; for (const ups of (groupBy(data, 'upsUnits', 'dataCenterId').get(dcId) ?? []).filter(x => x.feedId === feedId)) pduRacks(ups.id); }
  else if (u.system === 'cooling' || u.system === 'chiller') {
    const zones = u.system === 'cooling' ? [u.zoneId] : (byId(data, 'chillers', u.id)?.servesZoneIds ?? (groupBy(data, 'coolingZones', 'dataCenterId').get(dcId) ?? []).map(z => z.id));
    for (const h of data.halls.filter(x => x.dataCenterId === dcId && zones.includes(x.coolingZoneId))) for (const r of groupBy(data, 'racks', 'hallId').get(h.id) ?? []) out.add(r.id);
  }
  return [...out];
}

export function analyseCutIns(data: PlannerData, plan: T.PlannerPlan, b: PlantBaseline, lines: T.PlannerPlantLine[], p: Params, stageDates: Map<number, { delivery: string; need: string }>, now = clockMs()): CutInResult[] {
  const dcId = plan.dataCenterId!; const tier = str(p, 'tier', 'Tier III');
  const idx = unitIndex(b);
  // Live state per system: existing units, then the new units each step connects.
  const state = new Map<PlantSystem, PlantUnit[]>(b.systems.map(s => [s.system, [...s.units]]));
  const lineUnits = new Map<string, PlantUnit[]>(); let n = 0;
  for (const l of lines) { const t = l.targetAssetId ? idx.get(l.targetAssetId) : undefined; const us = newUnits(l, lineUnitKw(l, tier).kw, t, n); n += us.length; lineUnits.set(l.id, us); }
  const taken: { start: string; end: string }[] = [];
  const hours = num(p, 'cutInWindowHours', 6);
  const steps = [...(plan.cutIns ?? [])].sort((a, c) => a.order - c.order);
  return steps.map(step => {
    const notes: string[] = [];
    const all = [...state.values()].flat();
    const isolated = step.isolatedAssetIds.map(id => all.find(u => u.id === id) ?? idx.get(id)).filter((u): u is PlantUnit => !!u);
    const missing = step.isolatedAssetIds.filter(id => !isolated.some(u => u.id === id));
    const system = isolated[0]?.system ?? (step.connectsLineIds?.length ? LINE_SYSTEM[lines.find(l => l.id === step.connectsLineIds![0])?.system ?? 'UPS'] : undefined);
    const sys = b.systems.find(s => s.system === system);
    const units = system ? state.get(system) ?? [] : [];
    const isoIds = new Set(isolated.map(u => u.id));
    let remaining = units.filter(u => !isoIds.has(u.id));
    // A 2N system with one side isolated: the other side carries everything.
    const temporaryKw = step.transfer === 'Temporary generator' || step.transfer === 'Rental chiller' ? Math.max(0, step.temporaryKw ?? 0) : 0;
    const live = sys ? (sys.loadKw) : 0;
    let remainingKw = remaining.reduce((a, u) => a + u.capacityKw, 0);
    if (system === 'cooling' && isolated[0]?.zoneId) { const z = isolated[0].zoneId; remaining = remaining.filter(u => u.zoneId === z); remainingKw = remaining.reduce((a, u) => a + u.capacityKw, 0); }
    const liveLoadKw = system === 'cooling' && isolated[0]?.zoneId ? (b.zones.find(z => z.zone.id === isolated[0].zoneId)?.loadKw ?? 0) : live;
    const capWithTemp = remainingKw + temporaryKw;
    const largest = remaining.length ? Math.max(...remaining.map(u => u.capacityKw)) : 0;
    let redundancyLeft: RedundancyLeft;
    if (step.transfer === 'Maintenance bypass' && (system === 'ups')) { redundancyLeft = 'Unprotected (raw mains)'; notes.push('The load runs on raw mains through the maintenance bypass: a utility disturbance reaches the IT load until the UPS is back.'); }
    else redundancyLeft = capWithTemp - largest >= liveLoadKw && remaining.length > 1 ? 'N+1 or better' : capWithTemp >= liveLoadKw ? 'N' : 'Below N';
    let ok = redundancyLeft !== 'Below N';
    if (!isolated.length && !missing.length) {
      // Nothing is taken out of service (a tie-in on pre-installed valves or a spare way): the step does not reduce capacity.
      ok = true;
      if (!remaining.some(u => u.capacityKw > 0)) { redundancyLeft = 'N+1 or better'; notes.push('No units of this system are recorded; the step takes nothing out of service'); }
    }
    if (redundancyLeft === 'Unprotected (raw mains)') {
      const utility = b.systems.find(s => s.system === 'utility');
      ok = !utility?.recorded || utility.usableKw >= liveLoadKw * b.pue;
    }
    if (!isolated.length) notes.push('Nothing isolated: the step is a tie-in that takes no plant out of service. If it does, pick the assets.');
    if (missing.length) notes.push(`${missing.length} isolated asset(s) are not in the site records`);
    // Exposure: racks behind the isolated units, then devices, services and customers.
    const rackSet = new Set<string>(); for (const u of isolated) racksBehind(data, u, dcId).forEach(r => rackSet.add(r));
    const imp = rackSet.size ? impactOf(data, { rackIds: [...rackSet] }) : undefined;
    // Window: the planned one, or the next free change night after delivery.
    const stage = step.stage ?? 1; const dates = stageDates.get(stage);
    const after = new Date(Math.max(now, dates ? new Date(dates.delivery).getTime() : now)).toISOString();
    const proposed = !step.windowStart;
    const win = proposed ? nextFreeWindow(data, { dataCenterId: dcId, rackIds: [...rackSet].slice(0, 200), hours, after, excludePlanId: plan.id, taken }) : { start: step.windowStart, end: step.windowEnd || new Date(new Date(step.windowStart).getTime() + hours * 3600e3).toISOString() };
    taken.push(win);
    const cl = clashes(data, { dataCenterId: dcId, rackIds: [...rackSet].slice(0, 200), deviceIds: isolated.map(u => u.id), start: win.start, end: win.end, excludePlanId: plan.id, excludeChangeIds: step.changeRequestId ? [step.changeRequestId] : [] });
    // Temporary plant when redundancy drops below N+1.
    // Nothing to protect when the system carries no load today.
    const needsTemporaryPlant = redundancyLeft !== 'N+1 or better' && isolated.length > 0 && liveLoadKw > 0;
    const days = Math.max(2, Math.ceil((new Date(win.end).getTime() - new Date(win.start).getTime()) / 864e5) + 1);
    const cooling = system === 'chiller' || system === 'cooling';
    const tempKw = cooling ? Math.max(largest, ...isolated.map(u => u.capacityKw), 0) : r0(liveLoadKw * (system === 'ups' ? b.pue : 1) * 1.25);
    const temporaryLine = needsTemporaryPlant && system ? (cooling
      ? { item: 'Rental chiller hire', spec: `${kwFmt(tempKw)} standby during step ${step.order} (${step.title})`, days, kw: tempKw, dailyUsd: r0(Math.max(1, tempKw / 1000) * 1200), mobilisationUsd: 12000 }
      : { item: 'Temporary generator hire', spec: `${Math.round(tempKw / 0.8).toLocaleString('en-US')} kVA standby with fuel during step ${step.order} (${step.title})`, days, kw: tempKw, dailyUsd: r0(Math.max(1, tempKw / 1000) * 1500), mobilisationUsd: 15000 }) : undefined;
    if (needsTemporaryPlant && step.transfer === 'None' && !step.mitigation?.trim()) notes.push('Redundancy drops below N+1 with no transfer method and no mitigation.');
    // Connect the new units of this step (and drop the units they replace).
    for (const lid of step.connectsLineIds ?? []) {
      const l = lines.find(x => x.id === lid); if (!l) continue; const s = LINE_SYSTEM[l.system];
      let list = state.get(s) ?? [];
      if (l.action === 'replace' && l.targetAssetId) list = list.filter(u => u.id !== l.targetAssetId);
      if (l.action === 'uprate' && l.targetAssetId) list = list.map(u => (u.id === l.targetAssetId ? { ...u, capacityKw: lineUnitKw(l, tier).kw } : u));
      state.set(s, [...list, ...(lineUnits.get(lid) ?? [])]);
    }
    return {
      step, order: step.order, system, isolated, missing, remaining, remainingKw: r0(remainingKw), temporaryKw, liveLoadKw: r0(liveLoadKw), redundancyLeft, ok,
      exposedRackIds: [...rackSet], exposedDeviceIds: imp?.deviceIds ?? [], services: imp?.services.length ?? 0, critical: imp?.critical ?? 0,
      customers: (imp?.customers ?? []).map(c => ({ name: c.customer.name, revenueMonthly: c.revenueMonthly, critical: c.critical })), revenueMonthly: r0(imp?.revenueMonthly ?? 0),
      window: { ...win, proposed }, clashes: cl, needsTemporaryPlant, temporaryLine, notes,
    };
  });
}

/* ================================================================== stages and schedule */
export interface StageInfo { stage: number; name: string; phaseId?: string; need: string; delivery: string; fat: string; mop: string; lines: T.PlannerPlantLine[] }
/** Stages from the plan phases (stage n = n-th phase by date); lines without a stage go to stage 1. */
export function stagesOf(plan: T.PlannerPlan, lines: T.PlannerPlantLine[], cutIns: T.PlannerCutInStep[]): StageInfo[] {
  const phases = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const n = Math.max(1, phases.length, ...lines.map(l => l.stage ?? 1));
  return Array.from({ length: n }, (_, i) => {
    const ph = phases[i] ?? phases[phases.length - 1];
    const need = ph?.goLive ?? plan.targetGoLive;
    const steps = cutIns.filter(c => (c.stage ?? 1) === i + 1).length || lines.filter(l => (l.stage ?? 1) === i + 1).length || 1;
    // Back from the need date: handover, L5 IST a week before, L4 two, one cut-in window per week before that, delivery a week before the first.
    const delivery = new Date(new Date(need).getTime() - (3 + steps) * WEEK).toISOString();
    const fat = new Date(new Date(delivery).getTime() - 2 * WEEK).toISOString();
    const mop = new Date(new Date(fat).getTime() - 2 * WEEK).toISOString();
    return { stage: i + 1, name: ph?.name ?? `Stage ${i + 1}`, phaseId: ph?.id, need, delivery, fat, mop, lines: lines.filter(l => (l.stage ?? 1) === i + 1) };
  });
}
/** Lead-time benchmark per kind of plant line (one function for the bill and the schedule). */
export const LEAD_ITEM: Record<T.PlannerPlantLine['system'], string> = { UPS: 'UPS (1 MW module)', Battery: 'Battery strings', Generator: 'Generator (2.5 MVA)', Transformer: 'Transformer (33 kV)', Switchgear: 'Switchgear', Chiller: 'Chiller', 'Dry cooler': 'Chiller', CRAH: 'CRAH / CDU', CDU: 'CRAH / CDU' };
/** Order state of a schedule line from the plan's purchase orders for that phase (the engine's rule): ordered when a
    non-draft PO covers it, late when the order-by date (or a draft PO's) has passed. */
export function orderState(plan: T.PlannerPlan, data: PlannerData | undefined, phaseId: string | undefined, orderBy: number, now: number): { late: boolean; status: NonNullable<ScheduleItem['status']>; poId?: string; note: string } {
  if (plan.status === 'Completed') return { late: false, status: 'ordered', note: 'plan completed' };
  const approved = plan.status === 'Approved' || plan.status === 'Executing';
  if (approved && data) {
    const pos = data.purchaseOrders.filter(po => po.plannerPlanId === plan.id && (!po.planPhaseId || !phaseId || po.planPhaseId === phaseId));
    const placed = pos.find(po => po.status !== 'Draft');
    if (placed) return { late: false, status: 'ordered', poId: placed.id, note: `${placed.id} ${placed.status.toLowerCase()}` };
    const draft = pos.find(po => po.status === 'Draft');
    if (draft) { const late = new Date(draft.orderBy ?? orderBy).getTime() < now; return { late, status: late ? 'late' : 'to order', poId: draft.id, note: `${draft.id} is still a draft${late ? ' after its order-by date' : ''}` }; }
    const late = orderBy < now; return { late, status: late ? 'late' : 'to order', note: late ? 'no purchase order raised and the order-by date has passed' : 'no purchase order yet' };
  }
  const late = orderBy < now; return { late, status: late ? 'late' : 'to order', note: late ? 'order-by date has passed' : 'to order' };
}

/* ================================================================== analysis */
export interface PlantAnalysis {
  ready: boolean; reason?: string;
  baseline?: PlantBaseline; lines: LineResult[]; after: SystemAfter[]; stages: StageInfo[]; stageAfter: StageAfter[];
  /** IT kW the site can accept today and after the works. */
  headroomBeforeKw: number; capacityEnabledKw: number; bindingAfter?: PlantSystem;
  cutIns: CutInResult[];
  bill: Omit<BomItem, 'id' | 'total' | 'partNumber'>[];
  addedKwBySystem: Partial<Record<PlantSystem, number>>; addedPlantKw: number;
  runtimeAfterMin?: number; frameSlotsNeeded: number;
}

const COST_PER_KW: Record<T.PlannerPlantLine['system'], [number, string]> = {
  UPS: [350, 'UPS module, installed frame make'], Battery: [60, 'battery strings per kW of module for 10 minutes'], Generator: [450, 'diesel generator set with enclosure and day tank'], Transformer: [62, 'per kVA, cast resin or oil, with protection'],
  Switchgear: [0, 'per line-up'], Chiller: [400, 'per kW of cooling, magnetic-bearing chiller'], 'Dry cooler': [180, 'per kW of heat rejection'], CRAH: [340, 'per kW of cooling'], CDU: [350, 'per kW of liquid cooling'],
};
/** Price of one unit of a line: entered unit cost, else the plant benchmark per kW (per kVA for transformers). */
export function unitCost(line: T.PlannerPlantLine, unitKw: number, benchmarks: T.PlannerBenchmark[]): { usd: number; basis: string } {
  if (line.unitCostUsd && line.unitCostUsd > 0) return { usd: line.unitCostUsd, basis: 'entered' };
  const b = benchmarks.find(x => x.metric === `plantCostPerKw:${line.system}`);
  const [def, what] = COST_PER_KW[line.system];
  if (line.system === 'Switchgear') return { usd: b?.value ?? 250000, basis: b ? `${b.label} benchmark` : 'indicative 250,000 USD per line-up' };
  const rate = b?.value ?? def;
  const qtyBasis = line.system === 'Transformer' ? (line.ratingKva ?? unitKw / KVA_TO_KW) : line.system === 'Battery' ? unitKw * Math.max(1, (line.runtimeMin ?? 10) / 10) : unitKw;
  return { usd: r0(rate * qtyBasis), basis: `${rate} USD ${line.system === 'Transformer' ? 'per kVA' : 'per kW'} (${b ? 'benchmark' : 'indicative'}: ${what})` };
}

const VENDOR_HINT: Partial<Record<T.PlannerPlantLine['system'], string>> = { UPS: 'Eaton', Battery: 'Eaton', Generator: 'Schneider Electric', Transformer: 'Schneider Electric', Switchgear: 'Schneider Electric', Chiller: 'Vertiv', 'Dry cooler': 'Vertiv', CRAH: 'Vertiv', CDU: 'Vertiv' };
const KIND_OF: Record<T.PlannerPlantLine['system'], BomItem['kind']> = { UPS: 'ups', Battery: 'ups', Generator: 'generator', Transformer: 'transformer', Switchgear: 'switchgear', Chiller: 'chiller', 'Dry cooler': 'chiller', CRAH: 'crah', CDU: 'cdu' };

export function analysePlant(c: { plan: T.PlannerPlan; params: Params; benchmarks: T.PlannerBenchmark[]; data?: PlannerData; site?: SiteBaseline }, now = clockMs()): PlantAnalysis {
  const { plan, params: p, benchmarks } = c;
  const lines = plan.plantLines ?? [];
  const empty: PlantAnalysis = { ready: false, lines: [], after: [], stages: [], stageAfter: [], headroomBeforeKw: 0, capacityEnabledKw: 0, cutIns: [], bill: [], addedKwBySystem: {}, addedPlantKw: 0, frameSlotsNeeded: 0 };
  if (!c.data || !c.data.ready) return { ...empty, reason: 'Platform data still loading' };
  if (!c.site || !plan.dataCenterId) return { ...empty, reason: 'Pick the site first' };
  const data = c.data;
  const tier = str(p, 'tier', c.site.dc.tier);
  const b = plantBaseline(data, plan, c.site, p, benchmarks);
  const idx = unitIndex(b);
  const lineResults: LineResult[] = lines.map(l => {
    const system = LINE_SYSTEM[l.system]; const { kw, note } = lineUnitKw(l, tier);
    const target = l.targetAssetId ? idx.get(l.targetAssetId) : undefined;
    const problems: string[] = [];
    if (changesCapacity(l) && kw <= 0) problems.push('No rating');
    if ((l.action === 'replace' || l.action === 'uprate') && !l.targetAssetId) problems.push(`${l.action === 'replace' ? 'Replace' : 'Uprate'} needs the existing asset`);
    if (l.targetAssetId && !target) problems.push('The chosen asset is not in the site records');
    if (target && target.system !== system && !(system === 'cooling' && target.zoneId)) problems.push(`${target.name} is not part of ${SYSTEM_LABEL[system].toLowerCase()}`);
    if (l.action !== 'uprate' && l.qty <= 0) problems.push('Quantity is zero');
    const s = b.systems.find(x => x.system === system)!;
    let sug: { qty: number; note: string } | undefined;
    if (changesCapacity(l) && l.action === 'add' && kw > 0) {
      // Everything else in the system as entered, this line sized on its own.
      const others = applyLines(b, lines.filter(x => x.id !== l.id), tier).get(system) ?? [];
      sug = suggestQty(b, s, others, kw, p, l.zoneId ?? target?.zoneId);
    }
    return { line: l, system, unitKw: r0(kw), ratingNote: note, target, problems, suggestedQty: sug?.qty, suggestionNote: sug?.note };
  });
  const finalUnits = applyLines(b, lines, tier);
  const after = b.systems.map(s => systemAfter(b, s, finalUnits.get(s.system) ?? [], p));
  const headAfter = (xs: SystemAfter[]) => { const rec = xs.filter(x => b.systems.find(s => s.system === x.system)?.recorded); const h = rec.map(x => ({ s: x.system, h: x.supportsItKw - b.committedItKw })).sort((a, z) => a.h - z.h)[0]; return h; };
  const stages = stagesOf(plan, lines, plan.cutIns ?? []);
  const stageAfter: StageAfter[] = stages.map(st => { const u = applyLines(b, lines, tier, st.stage); const xs = b.systems.map(s => systemAfter(b, s, u.get(s.system) ?? [], p)); const h = headAfter(xs); return { stage: st.stage, systems: xs, headroomItKw: r0(Math.max(0, h?.h ?? 0)), binding: h?.s }; });
  const ha = headAfter(after);
  const cutIns = analyseCutIns(data, plan, b, lines, p, new Map(stages.map(s => [s.stage, { delivery: s.delivery, need: s.need }])), now);
  const addedKwBySystem: Partial<Record<PlantSystem, number>> = {};
  for (const a of after) if (a.addedKw) addedKwBySystem[a.system] = a.addedKw;
  const addedPlantKw = r0(lineResults.filter(x => changesCapacity(x.line) && x.line.action !== 'uprate').reduce((a, x) => a + x.unitKw * x.line.qty, 0) + lineResults.filter(x => x.line.action === 'uprate' && x.target).reduce((a, x) => a + Math.max(0, x.unitKw - (x.target?.capacityKw ?? 0)), 0));
  const upsAfter = after.find(a => a.system === 'ups');
  const loadNow = b.systems.find(s => s.system === 'ups')?.loadKw ?? 0;
  const loadAfter = (b.systems.find(s => s.system === 'ups')?.committedKw ?? 0) + b.planKw;
  // Battery energy after the works: today's strings (recorded runtime × today's load) plus the new modules' strings
  // (their runtime at full module load), spread over the load after the works.
  const rtNew = num(p, 'upsRuntimeMin', 10);
  const newStringsKwMin = lineResults.filter(x => x.line.system === 'UPS' && x.line.action !== 'uprate').reduce((a, x) => a + x.unitKw * x.line.qty * rtNew, 0)
    + lineResults.filter(x => x.line.system === 'Battery').reduce((a, x) => a + (x.target?.capacityKw ?? 0) * Math.max(0, (x.line.runtimeMin ?? rtNew) - (b.runtimeMin ?? 0)), 0);
  const runtimeAfterMin = b.runtimeMin !== undefined && loadNow > 0 && upsAfter ? r1((b.runtimeMin * loadNow + newStringsKwMin) / Math.max(loadNow, loadAfter)) : undefined;
  const frameSlotsNeeded = lines.filter(l => l.system === 'UPS' && l.action === 'add').reduce((a, l) => a + l.qty, 0);
  const an: PlantAnalysis = { ready: true, baseline: b, lines: lineResults, after, stages, stageAfter, headroomBeforeKw: Math.max(0, b.headroomItKw), capacityEnabledKw: r0(Math.max(0, ha?.h ?? 0)), bindingAfter: ha?.s, cutIns, bill: [], addedKwBySystem, addedPlantKw, runtimeAfterMin, frameSlotsNeeded };
  an.bill = plantBill(an, p, benchmarks);
  return an;
}

/* ================================================================== bill of materials */
export function plantBill(an: PlantAnalysis, p: Params, benchmarks: T.PlannerBenchmark[]): Omit<BomItem, 'id' | 'total' | 'partNumber'>[] {
  const out: Omit<BomItem, 'id' | 'total' | 'partNumber'>[] = [];
  const stageInfo = (s?: number) => an.stages.find(x => x.stage === (s ?? 1));
  const frameMake = (target?: PlantUnit) => target?.model?.split(' ')[0];
  const add = (l: Omit<BomItem, 'id' | 'total' | 'partNumber'>) => { if (l.qty > 0) out.push(l); };
  let electricalKw = 0; let items = 0; let heavyLifts = 0;
  for (const r of an.lines) {
    const l = r.line; if (r.problems.some(x => /No rating|Quantity is zero/.test(x))) continue;
    const st = stageInfo(l.stage); const lead = LEAD_ITEM[l.system];
    const qty = l.action === 'uprate' ? 1 : l.qty;
    const cost = unitCost(l, r.unitKw, benchmarks);
    const make = l.manufacturer ?? (l.system === 'UPS' || l.system === 'Battery' ? frameMake(r.target) : undefined) ?? VENDOR_HINT[l.system] ?? 'To tender';
    const label = l.system === 'UPS' ? (l.action === 'add' ? 'UPS module' : l.action === 'replace' ? 'UPS (replacement)' : 'UPS uprate') : l.system === 'Battery' ? 'UPS battery strings' : l.system === 'Generator' ? 'Diesel generator' : l.system === 'Transformer' ? 'Transformer' : l.system === 'Switchgear' ? 'LV/MV switchgear line-up' : l.system === 'CRAH' ? 'Computer room air handler' : l.system === 'CDU' ? 'Coolant distribution unit' : l.system;
    const spec = `${l.model ? `${l.model}, ` : ''}${r.ratingNote}${l.action === 'replace' && r.target ? `, replaces ${r.target.name}` : l.action === 'uprate' && r.target ? `, uprates ${r.target.name}` : r.target ? `, joins ${r.target.name}` : ''}${l.system === 'Battery' ? `, ${l.runtimeMin ?? num(p, 'upsRuntimeMin', 10)} min at full load` : ''}`;
    add({ kind: KIND_OF[l.system], category: LINE_SYSTEM[l.system] === 'chiller' || LINE_SYSTEM[l.system] === 'cooling' ? 'Cooling' : 'Power', item: label, spec, qty, unit: l.action === 'uprate' ? 'uprate' : 'each', unitCost: l.action === 'uprate' ? r0(cost.usd * 0.35) : cost.usd, leadItem: lead, manufacturer: make, model: l.model, phaseId: st?.phaseId, needBy: st?.delivery });
    // UPS modules: batteries are a separate line (P17) unless the plan already has a battery line for that frame.
    if (l.system === 'UPS' && l.action !== 'uprate' && !an.lines.some(x => x.line.system === 'Battery' && x.line.targetAssetId === l.targetAssetId && (x.line.stage ?? 1) === (l.stage ?? 1))) {
      const rt = num(p, 'upsRuntimeMin', 10);
      add({ kind: 'ups', category: 'Power', item: 'UPS battery strings', spec: `For ${qty} × ${kwFmt(r.unitKw)} module${qty === 1 ? '' : 's'}, ${rt} min at full load (first fill)`, qty, unit: 'set', unitCost: r0((benchmarks.find(x => x.metric === 'plantCostPerKw:Battery')?.value ?? 60) * r.unitKw * Math.max(1, rt / 10)), leadItem: 'Battery strings', manufacturer: make, phaseId: st?.phaseId, needBy: st?.delivery });
    }
    if (l.system === 'Generator' && l.action !== 'uprate') {
      const hours = num(p, 'generatorFuelHours', 24); const litres = r0(r.unitKw * 0.27 * hours);
      add({ kind: 'install', category: 'Power', item: 'Fuel first fill', spec: `${litres.toLocaleString('en-US')} L diesel per set (${hours} h at full load, 0.27 L/kWh)`, qty, unit: 'set', unitCost: r0(litres * 1.1), manufacturer: 'Fuel supplier', phaseId: st?.phaseId, needBy: st?.delivery });
    }
    if ((l.system === 'Chiller' || l.system === 'CRAH') && l.action !== 'uprate') { add({ kind: 'install', category: 'Cooling', item: 'Refrigerant charge and leak test', spec: `Low-GWP refrigerant, F-gas certified technician, ${label.toLowerCase()}`, qty, unit: 'unit', unitCost: l.system === 'Chiller' ? 9500 : 2500, manufacturer: 'Certified refrigeration contractor', phaseId: st?.phaseId, needBy: st?.need }); }
    if (POWER_SYSTEMS.includes(LINE_SYSTEM[l.system]) && l.system !== 'Battery') electricalKw += r.unitKw * qty;
    if (l.system !== 'Battery') items += qty;
    if (['Chiller', 'Generator', 'Transformer', 'Dry cooler'].includes(l.system)) heavyLifts += qty;
  }
  if (!out.length) return out;
  const st1 = an.stages[0];
  // Standard plant works.
  const install = out.filter(l => ['ups', 'generator', 'transformer', 'switchgear', 'chiller', 'crah', 'cdu'].includes(l.kind) && l.item !== 'UPS battery strings').reduce((a, l) => a + l.qty * l.unitCost, 0);
  add({ kind: 'install', category: 'Power', item: 'Installation, positioning and termination', spec: '12% of equipment: rigging on site, terminations, pipework connections', qty: 1, unit: 'lot', unitCost: r0(install * 0.12), manufacturer: 'NetBuild Corp', phaseId: st1?.phaseId, needBy: st1?.delivery });
  if (electricalKw > 0) add({ kind: 'install', category: 'Power', item: 'LV breakers, cabling and containment', spec: `Incoming and outgoing breakers, cables and tray for ${kwFmt(electricalKw)} of new electrical plant (35 USD/kW)`, qty: r0(electricalKw), unit: 'kW', unitCost: 35, manufacturer: 'NetBuild Corp', phaseId: st1?.phaseId, needBy: st1?.delivery });
  if (electricalKw > 0) add({ kind: 'install', category: 'Power', item: 'Short-circuit, protection and arc-flash study', spec: 'Fault levels, discrimination, breaker settings and new arc-flash labels', qty: 1, unit: 'study', unitCost: 28000, manufacturer: 'Electrical consultant', phaseId: st1?.phaseId, needBy: st1?.mop });
  if (items > 0) add({ kind: 'bms', category: 'Monitoring', item: 'BMS and EPMS integration', spec: 'Points, alarms, graphics and trends for each new item', qty: items, unit: 'item', unitCost: 12000, manufacturer: 'Schneider Electric', phaseId: st1?.phaseId, needBy: st1?.need });
  const loadBankKw = Math.max(0, ...an.lines.filter(x => POWER_SYSTEMS.includes(x.system) || x.system === 'chiller').map(x => x.unitKw * Math.max(1, x.line.qty)));
  if (loadBankKw > 0) { const days = num(p, 'loadBankDays', 5); add({ kind: 'install', category: 'Power', item: 'Load bank hire for L4 and L5 tests', spec: `${kwFmt(loadBankKw)} resistive and reactive load banks, ${days} days with cabling and operator`, qty: days, unit: 'day', unitCost: r0(Math.max(1, loadBankKw / 1000) * 2500), manufacturer: 'Load bank rental', phaseId: an.stages[an.stages.length - 1]?.phaseId, needBy: an.stages[an.stages.length - 1]?.need }); }
  if (heavyLifts > 0) add({ kind: 'install', category: 'Cooling', item: 'Crane and rigging', spec: `Mobile crane, lift plan and road closure for ${heavyLifts} heavy item${heavyLifts === 1 ? '' : 's'}`, qty: heavyLifts, unit: 'lift', unitCost: 18000, manufacturer: 'Crane hire', phaseId: st1?.phaseId, needBy: st1?.delivery });
  add({ kind: 'install', category: 'Power', item: 'Commissioning agent (L3 to L5 witness)', spec: 'Scripts, witness and sign-off for each new item and the integrated test', qty: Math.max(1, items), unit: 'item', unitCost: 6000, manufacturer: 'Commissioning agent', phaseId: an.stages[an.stages.length - 1]?.phaseId, needBy: an.stages[an.stages.length - 1]?.need });
  // Temporary plant for steps that leave the system below N+1.
  for (const ci of an.cutIns) if (ci.temporaryLine) {
    const t = ci.temporaryLine; const st = stageInfo(ci.step.stage);
    add({ kind: 'install', category: ci.system === 'chiller' || ci.system === 'cooling' ? 'Cooling' : 'Power', item: t.item, spec: `${t.spec}, ${t.days} days including mobilisation`, qty: t.days, unit: 'day', unitCost: t.dailyUsd + r0(t.mobilisationUsd / t.days), leadItem: 'Rental plant (mobilisation)', manufacturer: 'Rental plant supplier', phaseId: st?.phaseId, needBy: ci.window.start });
  }
  return out;
}

/* ================================================================== estimate */
export function plantEstimate(an: PlantAnalysis, plan: T.PlannerPlan, p: Params, benchmarks: T.PlannerBenchmark[], generic: Estimate): Estimate {
  const billTotal = an.bill.reduce((a, l) => a + r0(l.qty) * l.unitCost, 0);
  const contPct = num(p, 'costContingencyPct', 10);
  const capex: EstimateLine[] = [];
  const cats = new Map<string, number>();
  for (const l of an.bill) cats.set(l.item, (cats.get(l.item) ?? 0) + r0(l.qty) * l.unitCost);
  for (const [item, amount] of cats) capex.push({ category: 'CapEx', item, amount: r0(amount), basis: 'bill of materials (plant lines and standard works)', source: 'benchmark' });
  const contingency = r0(billTotal * contPct / 100);
  if (contingency) capex.push({ category: 'CapEx', item: 'Services and contingency (risk allowance)', amount: contingency, basis: `${contPct}% of the bill of materials`, source: p['costContingencyPct']?.source ?? 'template' });
  const capexTotal = billTotal + contingency;
  const tariff = num(p, 'tariffUsdPerKwh', plan.tariffUsdPerKwh ?? 0.1);
  const equip = an.bill.filter(l => ['ups', 'generator', 'transformer', 'switchgear', 'chiller', 'crah', 'cdu'].includes(l.kind)).reduce((a, l) => a + r0(l.qty) * l.unitCost, 0);
  const maintPct = num(p, 'maintenancePctCapex', 2.5);
  const upsAdded = an.addedKwBySystem.ups ?? 0; const xfAdded = an.addedKwBySystem.transformer ?? 0;
  // Fixed losses of the new plant: UPS modules about 1% of rating at light load, transformers about 0.3% no-load.
  const lossKw = upsAdded * 0.01 + xfAdded * 0.003;
  const opex: EstimateLine[] = ([
    { category: 'OpEx', item: 'Maintenance on the added plant', amount: r0((equip * maintPct) / 100 / 12), basis: `${maintPct}% a year of ${Math.round(equip).toLocaleString('en-US')} USD of new equipment`, source: p['maintenancePctCapex']?.source ?? 'benchmark' },
    { category: 'OpEx', item: 'Fixed losses of the new plant', amount: r0(lossKw * 730 * tariff), basis: `${r1(lossKw)} kW (UPS about 1% of rating idle, transformers 0.3% no-load) × 730 h × ${tariff} USD/kWh`, source: 'benchmark' },
  ] satisfies EstimateLine[]).filter(l => l.amount > 0);
  const opexMonthly = opex.reduce((a, l) => a + l.amount, 0);
  const b = an.baseline;
  const benefitLines: EstimateLine[] = [
    { category: 'Benefit', item: 'Capacity enabled', amount: 0, basis: `${kwFmt(an.capacityEnabledKw)} of IT the site can accept after the works at the target redundancy (${kwFmt(an.headroomBeforeKw)} today)`, source: 'actual' },
  ];
  const short = an.after.filter(a => !b?.systems.find(s => s.system === a.system)?.recorded ? false : (b!.systems.find(s => s.system === a.system)!.usableKw < a.requiredKw));
  if (short.length) benefitLines.push({ category: 'Benefit', item: 'Risk avoided', amount: 0, basis: `Without the works ${short.map(s => SYSTEM_LABEL[s.system].toLowerCase()).join(', ')} would carry the planned load below the target redundancy; not a cash saving, shown for the decision`, source: 'actual' });
  const bench = benchmarks.find(x => x.metric === 'capexPerKwAdded:plant');
  return {
    ...generic,
    capex, capexTotal: r0(capexTotal), capexPerKw: an.addedPlantKw ? r0(capexTotal / an.addedPlantKw) : 0, capexPerRack: 0,
    opex, opexMonthly: r0(opexMonthly), opexAnnual: r0(opexMonthly * 12), energyMwhYear: r0((lossKw * 8760) / 1000),
    revenueAnnual: 0, energyRecoveredAnnual: 0, marginAnnual: r0(-opexMonthly * 12), paybackMonths: null,
    paybackBasis: 'A plant upgrade is justified by the capacity it enables and the risk it removes, not by payback',
    plantCapexTotal: r0(capexTotal), costPerKwMonth: 0,
    benchmarkBand: bench ? { low: bench.low ?? bench.value ?? 0, high: bench.high ?? bench.value ?? 0, source: bench.source } : undefined,
    benefitLines, benefitAnnual: 0, basis: 'bottom-up', contingencyUsd: contingency, capacityEnabledKw: an.capacityEnabledKw,
  };
}

/* ================================================================== schedule */
export function plantSchedule(an: PlantAnalysis, plan: T.PlannerPlan, p: Params, benchmarks: T.PlannerBenchmark[], data: PlannerData | undefined, now = clockMs()): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const bufferPct = num(p, 'contingencyPct', 15);
  for (const st of an.stages) {
    // Long-lead items: one row per lead item in the stage, from the bill.
    const leadLines = an.bill.filter(l => l.leadItem && (l.phaseId ?? an.stages[0]?.phaseId) === st.phaseId);
    const byLead = new Map<string, typeof leadLines>();
    for (const l of leadLines) byLead.set(l.leadItem!, [...(byLead.get(l.leadItem!) ?? []), l]);
    for (const [lead, ls] of byLead) {
      const lt = leadWeeksFor(lead, benchmarks, bufferPct);
      const needBy = new Date(ls[0].needBy ?? st.delivery).getTime();
      const orderBy = needBy - (lt.leadWeeks + lt.bufferWeeks) * WEEK;
      const os = orderState(plan, data, st.phaseId, orderBy, now);
      items.push({ item: `${ls.map(l => `${l.qty} × ${l.item}`).join(', ')}`, leadWeeks: lt.leadWeeks, bufferWeeks: lt.bufferWeeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late: os.late, status: os.status, poId: os.poId, phase: st.name, phaseId: st.phaseId, kind: 'equipment', source: 'procure', note: `${lt.leadWeeks} weeks (${lt.source}) + ${lt.bufferWeeks} weeks buffer; ${os.note}` });
    }
    // Gates.
    const gate = (item: string, at: string, note?: string) => items.push({ item, leadWeeks: 0, needBy: at, orderBy: at, late: false, phase: st.name, phaseId: st.phaseId, kind: 'gate', status: 'gate', note });
    gate(`${st.name} · studies and MOP approved`, st.mop, 'Short-circuit and protection study, method of procedure for every cut-in, facilities sign-off');
    gate(`${st.name} · factory acceptance test`, st.fat);
    gate(`${st.name} · plant delivered`, st.delivery);
    const steps = an.cutIns.filter(c => (c.step.stage ?? 1) === st.stage);
    steps.forEach((c, i) => gate(`${st.name} · cut-in ${i + 1}: ${c.step.title}`, c.window.start, `${c.redundancyLeft} during the window${c.window.proposed ? ' (proposed window)' : ''}`));
    gate(`${st.name} · L4 functional tests`, new Date(new Date(st.need).getTime() - 2 * WEEK).toISOString());
    gate(`${st.name} · L5 integrated systems test`, new Date(new Date(st.need).getTime() - 1 * WEEK).toISOString(), 'With load banks at the planned load');
    gate(`${st.name} · handover`, st.need);
  }
  for (const pm of plan.permits) { const needBy = new Date(pm.neededBefore).getTime(); const orderBy = needBy - pm.leadWeeks * WEEK; items.push({ item: `Permit · ${pm.name}`, leadWeeks: pm.leadWeeks, needBy: pm.neededBefore, orderBy: new Date(orderBy).toISOString(), late: plan.status !== 'Completed' && pm.status === 'Not started' && orderBy < now, phase: an.stages[0]?.name ?? 'Stage 1', phaseId: an.stages[0]?.phaseId, kind: 'permit', status: 'permit' }); }
  return items.sort((a, b) => a.orderBy.localeCompare(b.orderBy));
}

/* ================================================================== ladder */
export function plantLadder(an: PlantAnalysis, plan: T.PlannerPlan, now = clockMs()): LadderRow[] {
  const b = an.baseline; if (!b) return [];
  const phases = [...plan.phases].sort((a, z) => a.goLive.localeCompare(z.goLive));
  let committed = b.committedItKw;
  return an.stageAfter.map((sa, i) => {
    const ph = phases[i] ?? { id: `S${sa.stage}`, name: `Stage ${sa.stage}`, goLive: an.stages[i]?.need ?? plan.targetGoLive, itKw: 0, halls: 0, racks: 0, status: 'Planned' as const };
    committed += ph.itKw;
    const supports = r0(b.committedItKw + sa.headroomItKw);
    return { phase: ph, installedKw: supports, committedKw: r0(committed), reserveKw: 0, headroomKw: r0(Math.max(0, supports - committed)), usablePct: supports ? r0((committed / supports) * 100) : 0, racks: 0, halls: 0, monthsFromNow: r1(Math.max(0, (new Date(ph.goLive).getTime() - now) / (30.4 * 864e5))), bindingConstraint: sa.binding === 'chiller' || sa.binding === 'cooling' ? 'cooling' : 'power' };
  });
}

/* ================================================================== commissioning */
export const ATP_STEPS: Record<'Power' | 'Cooling' | 'Integrated', { description: string; method: string; expected: string }[]> = {
  Power: [
    { description: 'Visual inspection, torque marks and labels', method: 'Walk-down against the drawings', expected: 'No defects; labels match the single-line' },
    { description: 'Insulation resistance and continuity', method: 'IR tester at 1 kV', expected: 'Above the manufacturer minimum' },
    { description: 'Protection settings applied', method: 'Read back relay and breaker settings', expected: 'As per the protection study' },
    { description: 'Load test at 25, 50, 75 and 100%', method: 'Load bank, 30 minutes per step', expected: 'Voltage and frequency within tolerance; no alarms' },
    { description: 'Transfer and failover', method: 'Open the input; transfer to battery or the other path', expected: 'No break to the load; alarms raised in BMS/EPMS' },
  ],
  Cooling: [
    { description: 'Pressure and leak test', method: 'Hold test pressure for 24 hours', expected: 'No pressure drop beyond tolerance' },
    { description: 'Controls and sensors', method: 'Point-to-point check with BMS', expected: 'Every point reads and alarms correctly' },
    { description: 'Capacity at design conditions', method: 'Load bank heat, measure supply and return', expected: 'Rated capacity at design temperatures' },
    { description: 'Failover', method: 'Trip the lead unit', expected: 'Standby unit starts; temperatures stay in the envelope' },
  ],
  Integrated: [
    { description: 'Utility failure simulation', method: 'Open the utility incomer under load bank load', expected: 'UPS carries the load; generators start and take load within the design time' },
    { description: 'Return to utility', method: 'Restore the incomer', expected: 'Load returns to utility without a break' },
    { description: 'Cooling on generator', method: 'Run cooling plant on generator at the planned load', expected: 'Temperatures stay in the envelope' },
    { description: 'Alarm and monitoring', method: 'Check every new point in BMS and EPMS', expected: 'Alarms reach operations; trends recorded' },
  ],
};
export const atpSystemOf = (s: T.PlannerPlantLine['system']): 'Power' | 'Cooling' => (['Chiller', 'Dry cooler', 'CRAH', 'CDU'].includes(s) ? 'Cooling' : 'Power');
