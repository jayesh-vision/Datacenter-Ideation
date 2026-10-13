/**
 * Site baseline — what an existing site can really take, from the platform's own records.
 *
 * Every plan that works inside a live site (rack, pod, hall, retrofit, plant, replacements,
 * migrations, and the campus behind an expansion) reads this instead of sizing a plant from
 * the plan's own kW. It follows the power chain utility → transformer → UPS → PDU → feed →
 * rack and the cooling chain zone → units → plant, and for each stage gives:
 *
 *   installed  — nameplate of the units in service
 *   usable     — what can be loaded at the stage's redundancy (N+1 loses the largest unit,
 *                2N counts one side only)
 *   load       — measured today
 *   reserved   — capacity reservations held by other plans and changes (Reserved/Committed)
 *   pipeline   — approved or executing plans at the site that have not reserved yet
 *   headroom   — usable − load − reserved − pipeline, in IT kW
 *
 * Facility-side stages (utility, transformers, generators) carry IT × PUE, so their headroom
 * is converted back to IT kW. The binding constraint is the stage with the least headroom.
 */
import type * as T from '../p2b/types';
import type * as E from '../p2b/enums';
import { dcTypeProfile } from '../p2b/dcTypes';
import { byId, groupBy, type PlannerData } from './plannerData';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const ACTIVE_HOLD: E.CapacityState[] = ['Reserved', 'Committed'];
/** Plant that counts as capacity today: not failed, not yet installed (Planned) and not retired. */
const inService = (status?: string) => status !== 'Failed' && status !== 'Planned' && status !== 'Retired';
/** A transformer's real power at the design power factor. */
export const KVA_TO_KW = 0.95;
/** Continuous load allowed on a rack feed (breaker derating). */
export const FEED_DERATING = 0.8;

export type StageKey = 'design' | 'utility' | 'transformer' | 'ups' | 'generator' | 'distribution' | 'cooling';
export interface StageBaseline {
  key: StageKey; label: string; redundancy: string;
  units: { id: string; name: string; capacityKw: number; loadKw: number; role?: string; status?: string }[];
  installedKw: number; usableKw: number; loadKw: number;
  /** True when the stage carries facility load (IT × PUE) rather than IT load. */
  facility: boolean;
  /** Headroom in IT kW after load, reservations and pipeline. */
  headroomItKw: number;
  basis: string;
}
export interface HallBaseline {
  hall: T.Hall; floor?: T.Floor; zone?: T.CoolingZone;
  positions: number; racksInstalled: number; emptyRackIds: string[]; freePositions: number;
  designKw: number; loadKw: number; reservedKw: number; headroomKw: number;
  status: NonNullable<T.Hall['status']>;
}
export interface ZoneBaseline { zone: T.CoolingZone; capacityKw: number; usableKw: number; loadKw: number; reservedKw: number; headroomKw: number; units: T.CRAC[]; hallIds: string[]; liquidKw: number }
export interface PipelineItem { planId: string; plnId: string; title: string; status: T.PlannerPlanStatus; scope: T.PlannerScope; kw: number }
export interface HoldItem { id: string; label: string; kw: number; state: E.CapacityState; planId?: string; changeRequestId?: string; resourceType: E.ResourceType; resourceId: string; expiresAt?: string }

export interface SiteBaseline {
  dc: T.DataCenter; campusId?: string; pue: number; pueSource: string;
  /** IT load today: UPS output where metered, else the sum of rack draw. */
  itLoadKw: number; rackDrawKw: number; racks: number; activeRacks: number;
  stages: StageBaseline[];
  cooling: { capacityKw: number; usableKw: number; loadKw: number; reservedKw: number; headroomKw: number; zones: ZoneBaseline[]; chillerKw: number; chillerLoadKw: number; facilityWaterHeadroomKw: number };
  halls: HallBaseline[];
  holds: HoldItem[]; reservedKw: number; reservedCoolingKw: number;
  pipeline: PipelineItem[]; pipelineKw: number;
  /** IT kW the site can still accept, and what binds it. */
  headroomItKw: number; binding: StageBaseline | undefined;
  /** −48 V DC plant instead of AC UPS (central offices, MTSOs). */
  dcPlant: boolean;
  warnings: string[];
}

/** kW a plan adds at its site (the delta, not the total). Replacements add the change in draw. */
export function planAddedKw(p: T.PlannerPlan): number {
  const n = (k: string) => Number(p.params[k] ?? 0) || 0;
  switch (p.scope) {
    case 'server-refresh': case 'network-refresh': return Math.max(0, p.designPowerKw - n('affectedKw'));
    case 'rack-replace': return 0;
    case 'retrofit': return n('addedKw') || Math.max(0, p.designPowerKw - n('currentKw'));
    case 'migration': return 0;
    case 'plant': case 'network': return 0;
    default: return p.designPowerKw;
  }
}

/** Usable capacity of a set of units at a redundancy pattern. */
export function usableAt(redundancy: string, units: { capacityKw: number; role?: string }[]): number {
  const live = units.filter(u => u.capacityKw > 0);
  if (!live.length) return 0;
  const sum = live.reduce((a, u) => a + u.capacityKw, 0);
  const largest = Math.max(...live.map(u => u.capacityKw));
  const sides = groupSides(live);
  if (redundancy === '2N' || redundancy === '2N+1') {
    if (sides.a.length && sides.b.length) {
      const side = (xs: typeof live) => xs.reduce((a, u) => a + u.capacityKw, 0) - (redundancy === '2N+1' ? Math.max(...xs.map(u => u.capacityKw)) : 0);
      return Math.min(side(sides.a), side(sides.b));
    }
    return sum / 2;
  }
  if (redundancy === 'N+1') return live.length > 1 ? sum - largest : 0;
  return sum;
}
function groupSides<U extends { role?: string }>(units: U[]) { return { a: units.filter(u => /A/.test(u.role ?? '')), b: units.filter(u => /B/.test(u.role ?? '')) }; }

const CACHE = new WeakMap<PlannerData, Map<string, SiteBaseline>>();

/**
 * Baseline for one data centre. `excludePlanId` leaves the plan's own reservations and
 * pipeline entry out, so a plan never competes with itself.
 */
export function siteBaseline(data: PlannerData, dataCenterId: string | undefined, opts: { excludePlanId?: string; pue?: number } = {}): SiteBaseline | undefined {
  if (!dataCenterId) return undefined;
  const key = `${dataCenterId}|${opts.excludePlanId ?? ''}|${opts.pue ?? ''}`;
  let c = CACHE.get(data); if (!c) { c = new Map(); CACHE.set(data, c); }
  const hit = c.get(key); if (hit) return hit;
  const dc = byId(data, 'dataCenters', dataCenterId);
  if (!dc) return undefined;
  const b = build(data, dc, opts);
  c.set(key, b);
  return b;
}

function build(data: PlannerData, dc: T.DataCenter, opts: { excludePlanId?: string; pue?: number }): SiteBaseline {
  const warnings: string[] = [];
  const prof = dcTypeProfile(dc.dcTypeKey);
  const pue = opts.pue ?? prof?.pueTarget ?? 1.4;
  const dcPlant = !!prof?.dcPowerPlant;
  const racks = groupBy(data, 'racks', 'dataCenterId').get(dc.id) ?? [];
  const rackDrawKw = racks.reduce((a, r) => a + (r.currentPowerKw || 0), 0);
  const ups = (groupBy(data, 'upsUnits', 'dataCenterId').get(dc.id) ?? []).filter(u => inService(u.status));
  const upsLoad = ups.reduce((a, u) => a + (u.loadKw || 0), 0);
  const itLoadKw = r1(Math.max(rackDrawKw, upsLoad));
  const feeds = groupBy(data, 'utilityFeeds', 'dataCenterId').get(dc.id) ?? [];
  const feedIds = new Set(feeds.map(f => f.id));
  const xfmrs = data.transformers.filter(t => feedIds.has(t.feedId) && inService(t.status));
  const gens = (groupBy(data, 'generators', 'dataCenterId').get(dc.id) ?? []).filter(g => inService(g.status));
  const pdus = data.pdus.filter(p => (p.upsId && ups.some(u => u.id === p.upsId)) || (p.hallId && byId(data, 'halls', p.hallId)?.dataCenterId === dc.id));

  // Capacity held by others at this site.
  const rackIds = new Set(racks.map(r => r.id));
  const zoneIds = new Set((groupBy(data, 'coolingZones', 'dataCenterId').get(dc.id) ?? []).map(z => z.id));
  const pduIds = new Set(pdus.map(p => p.id)); const upsIds = new Set(ups.map(u => u.id));
  const feedRack = new Map(data.powerFeeds.filter(f => f.rackId).map(f => [f.id, f.rackId!]));
  const holds: HoldItem[] = data.capacityReservations
    .filter(h => ACTIVE_HOLD.includes(h.state) && h.status !== 'Released' && (!h.expiresAt || new Date(h.expiresAt).getTime() > clockMs()) && h.plannerPlanId !== opts.excludePlanId)
    .filter(h => h.dataCenterId === dc.id || (h.resourceType === 'PowerChain' && (pduIds.has(h.resourceId) || upsIds.has(h.resourceId) || rackIds.has(feedRack.get(h.resourceId) ?? '') || rackIds.has(h.resourceId))) || (h.resourceType === 'Cooling' && zoneIds.has(h.resourceId)) || (h.resourceType === 'Rack' && rackIds.has(h.resourceId)))
    .map(h => ({ id: h.id, label: h.label ?? h.notes ?? `${h.resourceType} ${h.resourceId}`, kw: h.unit === 'kW' ? h.quantity : 0, state: h.state, planId: h.plannerPlanId, changeRequestId: h.changeRequestId, resourceType: h.resourceType, resourceId: h.resourceId, expiresAt: h.expiresAt }));
  const reservedKw = r1(holds.filter(h => h.resourceType === 'PowerChain').reduce((a, h) => a + h.kw, 0));
  const reservedCoolingKw = r1(holds.filter(h => h.resourceType === 'Cooling').reduce((a, h) => a + h.kw, 0));

  // Approved and executing plans at the site that have not written reservations yet.
  const pipeline: PipelineItem[] = data.plannerPlans
    .filter(p => p.id !== opts.excludePlanId && p.dataCenterId === dc.id && (p.status === 'Approved' || p.status === 'Executing') && !(p.artefacts?.reservationIds?.length))
    .map(p => ({ planId: p.id, plnId: p.plnId, title: p.title, status: p.status, scope: p.scope, kw: planAddedKw(p) }))
    .filter(p => p.kw > 0);
  const pipelineKw = r1(pipeline.reduce((a, p) => a + p.kw, 0));
  const committedIt = itLoadKw + reservedKw + pipelineKw;

  const stages: StageBaseline[] = [];
  const stage = (s: Omit<StageBaseline, 'headroomItKw'>) => {
    const usableIt = s.facility ? s.usableKw / pue : s.usableKw;
    stages.push({ ...s, headroomItKw: r1(usableIt - committedIt) });
  };
  stage({ key: 'design', label: 'Site design load', redundancy: dc.tier, units: [], installedKw: dc.designPowerKw, usableKw: dc.designPowerKw, loadKw: itLoadKw, facility: false, basis: `Design IT load of ${dc.name}` });
  if (feeds.length) {
    const units = feeds.map(f => ({ id: f.id, name: f.name, capacityKw: f.capacityKw, loadKw: 0, role: f.redundancyRole }));
    const sides = groupSides(units);
    const usable = sides.a.length && sides.b.length ? Math.min(sides.a.reduce((a, u) => a + u.capacityKw, 0), sides.b.reduce((a, u) => a + u.capacityKw, 0)) : units.reduce((a, u) => a + u.capacityKw, 0);
    stage({ key: 'utility', label: 'Utility feeds', redundancy: sides.a.length && sides.b.length ? 'A and B' : 'Single', units, installedKw: units.reduce((a, u) => a + u.capacityKw, 0), usableKw: usable, loadKw: r0(itLoadKw * pue), facility: true, basis: sides.a.length && sides.b.length ? 'Each side must carry the whole facility load' : 'All feeds together' });
  } else warnings.push('No utility feeds recorded for the site');
  if (xfmrs.length) {
    const units = xfmrs.map(t => ({ id: t.id, name: t.name, capacityKw: r0(t.capacityKva * KVA_TO_KW), loadKw: t.loadKw, role: feeds.find(f => f.id === t.feedId)?.redundancyRole }));
    const usable = usableAt(units.length > 1 && groupSides(units).a.length && groupSides(units).b.length ? '2N' : units.length > 1 ? 'N+1' : 'N', units);
    stage({ key: 'transformer', label: 'Transformers', redundancy: units.length > 1 ? 'N+1 or 2N by side' : 'N', units, installedKw: units.reduce((a, u) => a + u.capacityKw, 0), usableKw: usable, loadKw: r0(units.reduce((a, u) => a + u.loadKw, 0)), facility: true, basis: `kVA × ${KVA_TO_KW} power factor, one unit or one side lost` });
  }
  if (ups.length) {
    const red = mode(ups.map(u => u.redundancy)) ?? 'N+1';
    const units = ups.map(u => ({ id: u.id, name: u.name, capacityKw: u.capacityKw, loadKw: u.loadKw, role: feeds.find(f => f.id === u.feedId)?.redundancyRole, status: u.status }));
    stage({ key: 'ups', label: dcPlant ? 'DC power plant' : 'UPS', redundancy: red, units, installedKw: units.reduce((a, u) => a + u.capacityKw, 0), usableKw: usableAt(red, units), loadKw: r0(upsLoad), facility: false, basis: red === 'N+1' ? 'Largest module lost' : red.startsWith('2N') ? 'One side carries the whole load' : 'No redundancy' });
  } else warnings.push('No UPS recorded for the site');
  if (gens.length) {
    const units = gens.map(g => ({ id: g.id, name: g.name, capacityKw: g.capacityKw, loadKw: 0, role: g.redundancyRole }));
    stage({ key: 'generator', label: 'Generators', redundancy: units.length > 1 ? 'N+1' : 'N', units, installedKw: units.reduce((a, u) => a + u.capacityKw, 0), usableKw: usableAt(units.length > 1 ? 'N+1' : 'N', units), loadKw: 0, facility: true, basis: 'Facility load with the largest set lost' });
  }

  // Cooling: zones with the units in them; usable loses the largest unit in each zone.
  const zones = (groupBy(data, 'coolingZones', 'dataCenterId').get(dc.id) ?? []).map(z => {
    const units = (groupBy(data, 'cracUnits', 'coolingZoneId').get(z.id) ?? []).filter(u => inService(u.status));
    const installed = units.length ? units.reduce((a, u) => a + u.capacityKw, 0) : z.coolingCapacityKw;
    const usable = units.length > 1 ? installed - Math.max(...units.map(u => u.capacityKw)) : installed;
    const capacity = Math.min(z.coolingCapacityKw || installed, installed);
    const usableKw = Math.min(capacity, usable);
    const reserved = holds.filter(h => h.resourceType === 'Cooling' && h.resourceId === z.id).reduce((a, h) => a + h.kw, 0);
    const hallIds = data.halls.filter(h => h.coolingZoneId === z.id).map(h => h.id);
    return { zone: z, capacityKw: r1(capacity), usableKw: r1(usableKw), loadKw: r1(z.currentLoadKw), reservedKw: r1(reserved), headroomKw: r1(usableKw - z.currentLoadKw - reserved), units, hallIds, liquidKw: r1(units.filter(u => u.type === 'CDU').reduce((a, u) => a + u.capacityKw, 0)) } satisfies ZoneBaseline;
  });
  const chillers = (groupBy(data, 'chillers', 'dataCenterId').get(dc.id) ?? []).filter(c => inService(c.status));
  const chillerKw = chillers.reduce((a, c) => a + c.capacityKw, 0); const chillerLoadKw = chillers.reduce((a, c) => a + c.loadKw, 0);
  const chillerUsable = chillers.length > 1 ? chillerKw - Math.max(...chillers.map(c => c.capacityKw)) : chillerKw;
  const cooling = {
    capacityKw: r1(zones.reduce((a, z) => a + z.capacityKw, 0)), usableKw: r1(zones.reduce((a, z) => a + z.usableKw, 0)), loadKw: r1(zones.reduce((a, z) => a + z.loadKw, 0)),
    reservedKw: reservedCoolingKw, headroomKw: r1(zones.reduce((a, z) => a + Math.max(0, z.headroomKw), 0)), zones, chillerKw: r1(chillerKw), chillerLoadKw: r1(chillerLoadKw),
    facilityWaterHeadroomKw: r1(chillerUsable - chillerLoadKw),
  };
  if (zones.length) stage({ key: 'cooling', label: 'Cooling zones', redundancy: 'N+1 per zone', units: zones.map(z => ({ id: z.zone.id, name: z.zone.name, capacityKw: z.usableKw, loadKw: z.loadKw })), installedKw: cooling.capacityKw, usableKw: r1(cooling.usableKw - reservedCoolingKw + reservedKw), loadKw: cooling.loadKw, facility: false, basis: 'Each zone with its largest unit lost' });

  // Halls: positions, empty racks and power headroom per hall.
  const halls: HallBaseline[] = (groupBy(data, 'halls', 'dataCenterId').get(dc.id) ?? []).map(h => {
    const hr = racks.filter(r => r.hallId === h.id);
    const empty = hr.filter(r => (r.status === 'Planned' || r.status === 'Reserved') && !r.currentPowerKw && !isHeld(data, r.id, opts.excludePlanId));
    const installed = hr.filter(r => r.status !== 'Retired').length;
    const positions = Math.max(h.rackCapacity, installed);
    const load = hr.reduce((a, r) => a + (r.currentPowerKw || 0), 0);
    const reserved = holds.filter(x => x.resourceType === 'PowerChain' && (rackIds.has(x.resourceId) ? byId(data, 'racks', x.resourceId)?.hallId === h.id : feedRack.has(x.resourceId) ? byId(data, 'racks', feedRack.get(x.resourceId))?.hallId === h.id : pdus.find(p => p.id === x.resourceId)?.hallId === h.id)).reduce((a, x) => a + x.kw, 0);
    const z = zones.find(zz => zz.zone.id === h.coolingZoneId);
    return { hall: h, floor: byId(data, 'floors', h.floorId), zone: z?.zone, positions, racksInstalled: installed, emptyRackIds: empty.map(r => r.id), freePositions: Math.max(0, positions - installed) + empty.length, designKw: h.designPowerKw, loadKw: r1(load), reservedKw: r1(reserved), headroomKw: r1(h.designPowerKw - load - reserved), status: h.status ?? (installed === 0 ? 'Shell' : 'Live') };
  });

  const binding = [...stages].filter(s => s.key !== 'cooling').sort((a, b) => a.headroomItKw - b.headroomItKw)[0];
  return {
    dc, campusId: dc.campusId, pue, pueSource: opts.pue ? 'plan' : prof ? `${prof.name} profile` : 'default',
    itLoadKw, rackDrawKw: r1(rackDrawKw), racks: racks.length, activeRacks: racks.filter(r => r.status === 'Active' || r.status === 'Full').length,
    stages, cooling, halls, holds, reservedKw, reservedCoolingKw, pipeline, pipelineKw,
    headroomItKw: binding ? Math.max(0, binding.headroomItKw) : 0, binding, dcPlant, warnings,
  };
}

function mode<V extends string>(xs: V[]): V | undefined { const m = new Map<V, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; }
function isHeld(data: PlannerData, rackId: string, excludePlanId?: string): boolean {
  return data.capacityReservations.some(h => h.resourceType === 'Rack' && h.resourceId === rackId && ACTIVE_HOLD.includes(h.state) && h.plannerPlanId !== excludePlanId && (!h.expiresAt || new Date(h.expiresAt).getTime() > clockMs()));
}

/* ================================================================== racks */
export interface UBlock { start: number; end: number; size: number }
export interface RackBaseline {
  rack: T.Rack; hall?: T.Hall; row?: T.Row; zone?: T.CoolingZone;
  /** Power the rack can take: the lower of the rack rating and its feeds (each side carries the whole rack). */
  ratingKw: number; feedRatingKw?: number; feeds: T.PowerFeed[]; drawKw: number; reservedKw: number; headroomKw: number;
  /** Occupied units (devices and active rack reservations). */
  usedUnits: Set<number>; freeBlocks: UBlock[]; largestFreeBlock: number;
  weightKg: number; maxWeightKg: number; devices: T.Device[];
  /** Free outlets on the rack's PDUs, when recorded. */
  pdus: T.PDU[];
}
/** kW one rack feed can carry continuously. */
export function feedKw(f: T.PowerFeed): number {
  const phaseFactor = f.phase === 'Three-phase' ? Math.sqrt(3) : 1;
  return (f.voltage * f.amperage * phaseFactor * (f.maxUtilizationPct ? f.maxUtilizationPct / 100 : FEED_DERATING)) / 1000;
}
export function rackBaseline(data: PlannerData, rackId: string, opts: { excludePlanId?: string } = {}): RackBaseline | undefined {
  const rack = byId(data, 'racks', rackId); if (!rack) return undefined;
  const feeds = (groupBy(data, 'powerFeeds', 'rackId').get(rack.id) ?? []).filter(f => f.status !== 'Offline' && f.status !== 'Failed');
  const sides = feeds.length ? Math.min(...['Primary', 'Redundant'].map(t => feeds.filter(f => f.type === t).reduce((a, f) => a + feedKw(f), 0)).filter(x => x > 0)) : undefined;
  const feedRatingKw = sides !== undefined && Number.isFinite(sides) ? r1(sides) : feeds.length ? r1(Math.max(...feeds.map(feedKw))) : undefined;
  const ratingKw = feedRatingKw ? Math.min(rack.maxPowerKw, feedRatingKw) : rack.maxPowerKw;
  const devices = (groupBy(data, 'devices', 'rackId').get(rack.id) ?? []).filter(d => d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed');
  const used = new Set<number>();
  for (const d of devices) if (d.position) for (let u = d.position; u < d.position + Math.max(1, d.heightU ?? 1); u++) used.add(u);
  for (const rr of groupBy(data, 'rackReservations', 'rackId').get(rack.id) ?? []) if (rr.status === 'Active' && rr.plannerPlanId !== opts.excludePlanId) rr.units.forEach(u => used.add(u));
  const blocks: UBlock[] = []; let start = 0;
  for (let u = 1; u <= rack.heightU + 1; u++) { const free = u <= rack.heightU && !used.has(u); if (free && !start) start = u; if (!free && start) { blocks.push({ start, end: u - 1, size: u - start }); start = 0; } }
  const reserved = data.capacityReservations.filter(h => ACTIVE_HOLD.includes(h.state) && h.plannerPlanId !== opts.excludePlanId && h.unit === 'kW' && (h.resourceId === rack.id || feeds.some(f => f.id === h.resourceId))).reduce((a, h) => a + h.quantity, 0);
  const pduIds = new Set(feeds.map(f => f.pduId).filter(Boolean) as string[]);
  return {
    rack, hall: byId(data, 'halls', rack.hallId), row: byId(data, 'rows', rack.rowId), zone: byId(data, 'coolingZones', rack.coolingZoneId),
    ratingKw: r1(ratingKw), feedRatingKw, feeds, drawKw: r1(rack.currentPowerKw || 0), reservedKw: r1(reserved), headroomKw: r1(ratingKw - (rack.currentPowerKw || 0) - reserved),
    usedUnits: used, freeBlocks: blocks, largestFreeBlock: Math.max(0, ...blocks.map(b => b.size)),
    weightKg: rack.currentWeightKg || devices.reduce((a, d) => a + (d.weightKg ?? 0), 0), maxWeightKg: rack.maxWeightKg, devices,
    pdus: data.pdus.filter(p => pduIds.has(p.id)),
  };
}
/** Lowest contiguous free block of at least `u` units, or undefined. */
export function findUBlock(rb: RackBaseline, u: number): UBlock | undefined { return rb.freeBlocks.find(b => b.size >= u); }

/* ================================================================== campus */
export interface CampusBaseline {
  campus: T.Campus; dataCenters: T.DataCenter[];
  feedsA: number; feedsB: number; perSideKw: number; transformerKw: number;
  /** Facility load the existing buildings are entitled to (design IT × their PUE). */
  committedFacilityKw: number; measuredFacilityKw: number;
  /** Facility kW still free on the campus intake, and the IT kW that supports at the new building's PUE. */
  facilityHeadroomKw: number; itHeadroomKw: (pue: number) => number;
  sites: SiteBaseline[];
}
export function campusBaseline(data: PlannerData, campusId: string | undefined, opts: { excludePlanId?: string } = {}): CampusBaseline | undefined {
  const campus = byId(data, 'campuses', campusId); if (!campus) return undefined;
  const dcs = data.dataCenters.filter(d => d.campusId === campus.id && d.status !== 'Retired');
  const sites = dcs.map(d => siteBaseline(data, d.id, opts)).filter((x): x is SiteBaseline => !!x);
  const feeds = data.utilityFeeds.filter(f => dcs.some(d => d.id === f.dataCenterId));
  const feedsA = feeds.filter(f => f.redundancyRole === 'A-side').reduce((a, f) => a + f.capacityKw, 0);
  const feedsB = feeds.filter(f => f.redundancyRole === 'B-side').reduce((a, f) => a + f.capacityKw, 0);
  const perSide = feedsA && feedsB ? Math.min(feedsA, feedsB) : feedsA + feedsB;
  const xfmr = data.transformers.filter(t => feeds.some(f => f.id === t.feedId)).reduce((a, t) => a + t.capacityKva * KVA_TO_KW, 0);
  const committed = sites.reduce((a, s) => a + Math.max(s.dc.designPowerKw, s.itLoadKw + s.reservedKw + s.pipelineKw) * s.pue, 0);
  const measured = sites.reduce((a, s) => a + s.itLoadKw * s.pue, 0);
  const head = perSide - committed;
  return { campus, dataCenters: dcs, feedsA, feedsB, perSideKw: perSide, transformerKw: r0(xfmr), committedFacilityKw: r0(committed), measuredFacilityKw: r0(measured), facilityHeadroomKw: r0(head), itHeadroomKw: (p: number) => r0(Math.max(0, head) / Math.max(1, p)), sites };
}
