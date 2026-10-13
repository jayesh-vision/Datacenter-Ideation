/**
 * Placement inside a live site — where new racks, pods, halls and retrofits go, read from the
 * platform's own records.
 *
 *  - Equipment: an equipment list of DCIM asset models gives the rack units, typical and
 *    maximum draw, weight, data ports and power supplies (ports and supplies are counted on a
 *    device of the same model already in DCIM; the model class is the fallback).
 *  - Racks: each candidate rack is checked on a contiguous free U block (devices and active
 *    rack reservations), power at the lower of the rack rating and its A and B feeds (with
 *    breaker derating) less the larger of drawn and allocated and less reservations, the
 *    feeding PDUs (headroom and free outlets), weight against the rack and the floor, and the
 *    cooling zone. A candidate that fails a check is blocked and never offered for acceptance.
 *  - Ports and addresses: free, enabled leaf interfaces of the right speed on the nearest leaf
 *    pair, and addresses from the hall's existing subnet and VLAN.
 *  - Pods: contiguous free grid positions in one row or a facing pair of rows (one contained
 *    aisle), scored on hall, PDU and zone headroom.
 *  - Retrofits: per-rack target, readiness for liquid, filled weight, power uprate and the
 *    services on each rack.
 *
 * Everything here is pure: the scope model, the wizard panels and execution share it.
 */
import type * as T from '../p2b/types';
import { CATALOGUE, priceOf } from './catalogue';
import { byId, groupBy, type PlannerData } from './plannerData';
import { FEED_DERATING, findUBlock, rackBaseline, type HallBaseline, type RackBaseline, type SiteBaseline, type UBlock, type ZoneBaseline } from './site';
import { intToIp, parseCidr } from './ipam';
import { impactOf } from './impact';
import { clockMs } from '../compat/clock';

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

/* ================================================================== constants (stated in the UI) */
/** Capacity policy: warn at 85% of a rack's rated power, block at 90% (Templates → Capacity policy). */
export const RACK_WARN_PCT = 85, RACK_BLOCK_PCT = 90;
/** Subnets are not filled above 80% (IPAM policy). */
export const SUBNET_MAX_PCT = 80;
/** Floor load is spread over the rack and half of each adjacent aisle (0.6 m each side). */
export const AISLE_SHARE_MM = 1200;
/** Units kept free in every rack for the top-of-rack switch, patch panel and console. */
export const RESERVED_U = 4;
/** Weight of an empty cabinet and of a liquid kit (manifold, hoses, coolant), kg. */
export const EMPTY_CABINET_KG = 150, LIQUID_KIT_KG = 60;
/** Supply voltage of rack feeds in a 3-phase AC hall (line to line). */
export const AC_VOLTS = 415;

/** kW one 3-phase AC feed of the given breaker size carries continuously. */
export const acFeedKw = (amps: number, phase: 'Three-phase' | 'Single-phase' = 'Three-phase', volts = AC_VOLTS) => r1((phase === 'Three-phase' ? volts * amps * Math.sqrt(3) : 230 * amps) * FEED_DERATING / 1000);
/** Parsed feed configuration from the plan input, e.g. 'Dual 3-phase 32 A'. */
export function feedConfig(v: unknown): { dual: boolean; phase: 'Three-phase' | 'Single-phase'; amps: number; kw: number; label: string } {
  const s = String(v ?? 'Dual 3-phase 32 A');
  const dual = !/^single/i.test(s);
  const phase = /single-phase|1-phase/i.test(s) ? 'Single-phase' : 'Three-phase';
  const amps = Number(/(\d+)\s*A/.exec(s)?.[1] ?? 32);
  return { dual, phase, amps, kw: acFeedKw(amps, phase), label: s };
}

/* ================================================================== equipment */
const PORTS_BY_CATEGORY: Record<string, number> = { Server: 2, 'GPU-Node': 2, Storage: 4, Switch: 2, Router: 4, Firewall: 4, Other: 1, PDU: 0, UPS: 0 };
const PSUS_BY_CATEGORY: Record<string, number> = { Server: 2, 'GPU-Node': 6, Storage: 2, Switch: 2, Router: 4, Firewall: 2, Other: 1, PDU: 0, UPS: 1 };
export interface EquipmentRow { line: T.PlannerEquipmentLine; model?: T.AssetModel; u: number; typicalW: number; maxW: number; kg: number; ports: number; psus: number; unitPrice?: number; portsFrom: 'dcim' | 'class' }
export interface EquipmentTotals { rows: EquipmentRow[]; u: number; typicalKw: number; maxKw: number; kg: number; ports: number; psus: number; devices: number; hosts: number }

/** Data ports and power supplies of one model, counted on a device of that model already in DCIM. */
function portsOfModel(data: PlannerData, model: T.AssetModel): { ports: number; psus: number; from: 'dcim' | 'class' } {
  const dev = (groupBy(data, 'devices', 'assetModelId').get(model.id) ?? [])[0];
  const comps = dev ? groupBy(data, 'deviceComponents', 'deviceId').get(dev.id) ?? [] : [];
  const ifs = comps.filter(c => c.kind === 'interface' && !c.mgmtOnly).length;
  const psus = comps.filter(c => c.kind === 'power-port').length;
  if (dev && (ifs || psus)) {
    // A switch's data ports are what it offers, not what it consumes: count its uplinks only.
    const ports = model.category === 'Switch' ? Math.min(ifs, 2) : ifs;
    return { ports: ports || PORTS_BY_CATEGORY[model.category] || 1, psus: psus || PSUS_BY_CATEGORY[model.category] || 1, from: 'dcim' };
  }
  return { ports: PORTS_BY_CATEGORY[model.category] ?? 1, psus: PSUS_BY_CATEGORY[model.category] ?? 1, from: 'class' };
}

export function equipmentTotals(data: PlannerData | undefined, lines: T.PlannerEquipmentLine[] | undefined): EquipmentTotals | undefined {
  if (!data || !lines?.length) return undefined;
  const rows: EquipmentRow[] = lines.filter(l => l.qty > 0).map(line => {
    const model = byId(data, 'assetModels', line.assetModelId);
    if (!model) return { line, u: 0, typicalW: 0, maxW: 0, kg: 0, ports: 0, psus: 0, portsFrom: 'class' as const };
    const p = portsOfModel(data, model);
    return { line, model, u: model.heightU * line.qty, typicalW: model.typicalPowerW * line.qty, maxW: Math.max(model.maxPowerW, model.typicalPowerW) * line.qty, kg: model.weightKg * line.qty, ports: p.ports * line.qty, psus: p.psus * line.qty, unitPrice: priceOf(model.model), portsFrom: p.from };
  });
  const sum = (f: (r: EquipmentRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return { rows, u: sum(r => r.u), typicalKw: r1(sum(r => r.typicalW) / 1000), maxKw: r1(sum(r => r.maxW) / 1000), kg: sum(r => r.kg), ports: sum(r => r.ports), psus: sum(r => r.psus), devices: sum(r => r.line.qty), hosts: sum(r => (r.model && ['Server', 'GPU-Node', 'Storage'].includes(r.model.category) ? r.line.qty : 0)) };
}

/* ================================================================== IT priced from the catalogue */
export type RackClassName = 'GPU' | 'Compute' | 'Storage';
const CLASS_MODEL: Record<RackClassName, string> = { GPU: 'PowerEdge XE9680', Compute: 'PowerEdge R760', Storage: 'FlashArray //X70' };
export interface ItRack { cls: RackClassName; model: string; manufacturer: string; units: number; unitPrice: number; typicalW: number; heightU: number; weightKg: number; perRackUsd: number; basis: string }
/**
 * IT for one rack of a class: servers per rack = floor(rack kW ÷ the model's typical draw),
 * capped by the rack units left after the network and patching. One function so the shared
 * IT quantity model (engine core) can replace it.
 */
export function itPerRack(data: PlannerData | undefined, cls: RackClassName, kwPerRack: number, rackU = 42): ItRack {
  const model = CLASS_MODEL[cls];
  const am = data?.assetModels.find(m => m.model === model);
  const typicalW = am?.typicalPowerW ?? (cls === 'GPU' ? 9000 : cls === 'Storage' ? 1100 : 800);
  const heightU = am?.heightU ?? (cls === 'GPU' ? 6 : cls === 'Storage' ? 3 : 2);
  const byKw = Math.floor((kwPerRack * 1000) / typicalW);
  const byU = Math.floor((rackU - RESERVED_U) / heightU);
  const units = Math.max(0, Math.min(byKw, byU));
  const unitPrice = priceOf(model) ?? 0;
  const kind = cls === 'GPU' ? 'gpu-server' : cls === 'Storage' ? 'storage' : 'server';
  return { cls, model, manufacturer: CATALOGUE[kind].options.find(o => o.model === model)?.manufacturer ?? 'To tender', units, unitPrice, typicalW, heightU, weightKg: am?.weightKg ?? 30, perRackUsd: units * unitPrice, basis: `${units} × ${model} (${typicalW.toLocaleString('en-US')} W typical, ${heightU}U) in ${kwPerRack} kW${byU < byKw ? ', limited by rack units' : ''}` };
}

/* ================================================================== racks */
export interface RackCheck { ok: boolean; warn?: boolean; detail: string; na?: boolean }
export interface PduSide { side: 'A' | 'B'; pdu: T.PDU; headroomKw: number; freeOutlets: number }
export interface RackCandidate {
  rack: T.Rack; rb: RackBaseline; hall?: T.Hall; zone?: ZoneBaseline; floor?: T.Floor;
  block?: UBlock; allocKw: number; freeKw: number; afterPct: number;
  pduSides: PduSide[]; rpduFreeOutlets?: number;
  weightAfterKg: number; floorKgM2?: number;
  checks: { u: RackCheck; power: RackCheck; pdu: RackCheck; weight: RackCheck; cooling: RackCheck };
  blocked: string[]; warnings: string[]; score: number;
}
export interface RackNeed { u: number; kw: number; kg: number; psus: number; excludePlanId?: string; warnPct?: number; blockPct?: number; mode: 'existing-rack' | 'new-cabinet'; feed?: ReturnType<typeof feedConfig>; zoneUsedKw?: Map<string, number> }

/** kW the devices in a rack are allocated (their recorded draw), excluding the rack's own power strips. */
export function allocatedKw(rb: RackBaseline): number { return r1(rb.devices.filter(d => d.category !== 'PDU' && d.lifecycleState !== 'Retired').reduce((a, d) => a + (d.powerDrawW ?? 0), 0) / 1000); }
/** Area a rack's weight is spread over, m². */
export const rackFootprintM2 = (rack: Pick<T.Rack, 'widthMm' | 'depthMm'>) => ((rack.widthMm || 600) * ((rack.depthMm || 1200) + AISLE_SHARE_MM)) / 1e6;

/**
 * kW other plans hold on a PDU: holds on the PDU itself (unit 'kW', or 'kW-B' for the second side
 * of a 2N pair, which site totals do not count twice) and holds on racks or feeds it supplies.
 */
export function pduHeldKw(data: PlannerData, pduId: string, excludePlanId?: string): number {
  const feeds = groupBy(data, 'powerFeeds', 'pduId').get(pduId) ?? [];
  const ids = new Set<string>([pduId, ...feeds.map(f => f.id), ...feeds.map(f => f.rackId).filter((x): x is string => !!x)]);
  const now = clockMs();
  return r1(data.capacityReservations.filter(h => h.resourceType === 'PowerChain' && (h.state === 'Reserved' || h.state === 'Committed') && h.status !== 'Released' && h.plannerPlanId !== excludePlanId && (!h.expiresAt || new Date(h.expiresAt).getTime() > now) && /^kW/.test(h.unit) && ids.has(h.resourceId)).reduce((a, h) => a + h.quantity, 0));
}
/** PDU sides feeding a rack (A = primary, B = redundant), with headroom after other holds. */
export function pduSidesOf(data: PlannerData, rb: RackBaseline, excludePlanId?: string): PduSide[] {
  const out: PduSide[] = [];
  for (const f of rb.feeds) {
    const pdu = byId(data, 'pdus', f.pduId); if (!pdu) continue;
    const side = f.type === 'Redundant' ? 'B' : 'A';
    if (out.some(o => o.pdu.id === pdu.id && o.side === side)) continue;
    out.push({ side, pdu, headroomKw: r1(pdu.capacityKw - pdu.loadKw - pduHeldKw(data, pdu.id, excludePlanId)), freeOutlets: Math.max(0, pdu.outletCount - pdu.outletsUsed) });
  }
  return out;
}

/** Free outlets on a rack's own power strips, after the supplies of the devices already in it. */
export function rackOutlets(data: PlannerData, rackId: string): { strips: T.Device[]; outlets: T.DeviceComponent[]; used: number; free: T.DeviceComponent[] } {
  const devs = groupBy(data, 'devices', 'rackId').get(rackId) ?? [];
  const strips = devs.filter(d => d.category === 'PDU');
  const comps = (id: string) => groupBy(data, 'deviceComponents', 'deviceId').get(id) ?? [];
  const outlets = strips.flatMap(s => comps(s.id).filter(c => c.kind === 'power-outlet'));
  const cabled = cabledComponents(data);
  const supplies = devs.filter(d => d.category !== 'PDU' && d.lifecycleState !== 'Retired').reduce((a, d) => a + comps(d.id).filter(c => c.kind === 'power-port').length, 0);
  const used = Math.max(outlets.filter(o => cabled.has(o.id)).length, supplies);
  // Outlets in order on each strip; the first `used` are taken by the supplies already in the rack.
  const perStrip = strips.map(s => comps(s.id).filter(c => c.kind === 'power-outlet' && !cabled.has(c.id)).sort((a, b) => Number(/\d+/.exec(a.name)?.[0] ?? 0) - Number(/\d+/.exec(b.name)?.[0] ?? 0)));
  const usedPerStrip = strips.length ? Math.ceil(used / strips.length) : 0;
  const free = perStrip.flatMap(list => list.slice(usedPerStrip));
  return { strips, outlets, used, free };
}

const CABLED = new WeakMap<PlannerData, Set<string>>();
function cabledComponents(data: PlannerData): Set<string> {
  let s = CABLED.get(data); if (s) return s;
  s = new Set(); for (const c of data.cables) { if (c.aComponentId) s.add(c.aComponentId); if (c.bComponentId) s.add(c.bComponentId); }
  CABLED.set(data, s); return s;
}

/** Check one rack against a need. */
export function checkRack(data: PlannerData, site: SiteBaseline | undefined, rack: T.Rack, need: RackNeed): RackCandidate | undefined {
  const rb = rackBaseline(data, rack.id, { excludePlanId: need.excludePlanId }); if (!rb) return undefined;
  const warnPct = need.warnPct ?? RACK_WARN_PCT, blockPct = need.blockPct ?? RACK_BLOCK_PCT;
  const hall = rb.hall; const floor = hall ? byId(data, 'floors', hall.floorId) : undefined;
  const zone = site?.cooling.zones.find(z => z.zone.id === rack.coolingZoneId);
  const blocked: string[] = []; const warnings: string[] = [];
  // Rack units.
  const block = findUBlock(rb, Math.max(1, need.u));
  const u: RackCheck = block ? { ok: true, detail: `U${block.start} to U${block.start + need.u - 1} free (block of ${block.size})` } : { ok: false, detail: `No ${need.u}U contiguous block; largest free block ${rb.largestFreeBlock}U` };
  if (!u.ok) blocked.push(u.detail);
  // Power: new cabinets take the planned feed rating; existing racks the lower of rack and feed rating.
  const alloc = allocatedKw(rb);
  const used = need.mode === 'new-cabinet' ? 0 : Math.max(rb.drawKw, alloc);
  const rating = need.mode === 'new-cabinet' && need.feed ? Math.min(rack.maxPowerKw || need.feed.kw, need.feed.kw) : rb.ratingKw;
  const free = r1(rating - used - rb.reservedKw);
  const afterPct = rating > 0 ? r0(((used + rb.reservedKw + need.kw) / rating) * 100) : 999;
  const sides = rb.feeds.length ? [...new Set(rb.feeds.map(f => f.type))] : [];
  const power: RackCheck = rating <= 0 ? { ok: false, detail: 'Rack has no power rating' }
    : afterPct > blockPct ? { ok: false, detail: `${afterPct}% of ${rating} kW after placement (block at ${blockPct}%)` }
    : { ok: true, warn: afterPct > warnPct || (need.mode === 'existing-rack' && sides.length < 2), detail: `${free} kW free of ${rating} kW (${rb.feedRatingKw ? `feeds ${rb.feedRatingKw} kW per side at ${FEED_DERATING * 100}% derating` : 'no feeds recorded; rack rating used'}); ${afterPct}% after placement${need.mode === 'existing-rack' && sides.length < 2 ? '; single-fed rack' : ''}` };
  if (!power.ok) blocked.push(power.detail); else if (power.warn) warnings.push(power.detail);
  // PDUs and outlets.
  const pduSides = pduSidesOf(data, rb, need.excludePlanId);
  let pdu: RackCheck; let rpduFree: number | undefined;
  if (need.mode === 'existing-rack') {
    const ro = rackOutlets(data, rack.id);
    rpduFree = ro.free.length;
    const outletNeed = need.psus;
    const shortPdu = pduSides.filter(p => p.headroomKw < need.kw);
    if (!pduSides.length && !ro.strips.length) pdu = { ok: true, na: true, warn: true, detail: 'Not checked: no feeds or power strips recorded for this rack' };
    else if (shortPdu.length) pdu = { ok: false, detail: shortPdu.map(p => `${p.pdu.name} (${p.side}) has ${p.headroomKw} kW free, ${need.kw} kW needed`).join('; ') };
    else if (ro.strips.length && ro.free.length < outletNeed) pdu = { ok: false, detail: `${ro.free.length} free outlets on ${ro.strips.length} power strips, ${outletNeed} needed` };
    else pdu = { ok: true, detail: `${pduSides.map(p => `${p.pdu.name} (${p.side}) ${p.headroomKw} kW free`).join(', ') || 'feeding PDU not recorded'}${ro.strips.length ? `; ${ro.free.length} free outlets` : '; power strips not recorded'}` };
  } else {
    // A new cabinet takes one new circuit per side from the hall's PDUs.
    const hallPdus = hall ? hallPduSides(data, hall.id, need.excludePlanId) : [];
    const ok = (s: 'A' | 'B') => hallPdus.some(p => p.side === s && p.headroomKw >= need.kw && p.freeOutlets >= 1);
    pdu = !hallPdus.length ? { ok: true, na: true, warn: true, detail: 'Not checked: no PDUs recorded for the hall' }
      : ok('A') && (ok('B') || !need.feed?.dual) ? { ok: true, detail: `New ${need.feed?.label ?? 'feeds'} from ${hallPdus.filter(p => p.headroomKw >= need.kw && p.freeOutlets >= 1).map(p => `${p.pdu.name} (${p.side})`).slice(0, 2).join(' and ')}` }
      : { ok: false, detail: `No hall PDU on ${ok('A') ? 'side B' : 'side A'} has ${need.kw} kW and a free circuit` };
  }
  if (!pdu.ok) blocked.push(pdu.detail); else if (pdu.warn) warnings.push(pdu.detail);
  // Weight against the rack and the floor.
  const weightAfter = r0((need.mode === 'new-cabinet' ? EMPTY_CABINET_KG : rb.weightKg) + need.kg);
  const floorKgM2 = r0(weightAfter / rackFootprintM2(rack));
  const weight: RackCheck = weightAfter > rb.maxWeightKg ? { ok: false, detail: `${weightAfter} kg after placement, rack rated ${rb.maxWeightKg} kg` }
    : floor?.floorLoadingKgSqm && floorKgM2 > floor.floorLoadingKgSqm ? { ok: false, detail: `${floorKgM2} kg/m² on the floor, rated ${floor.floorLoadingKgSqm} kg/m²` }
    : { ok: true, detail: `${weightAfter} of ${rb.maxWeightKg} kg; ${floorKgM2} kg/m²${floor ? ` of ${floor.floorLoadingKgSqm}` : ' (floor rating not recorded)'}` };
  if (!weight.ok) blocked.push(weight.detail);
  // Cooling zone.
  const zoneUsed = need.zoneUsedKw?.get(zone?.zone.id ?? '') ?? 0;
  const zoneFree = zone ? r1(zone.headroomKw - zoneUsed) : undefined;
  const cooling: RackCheck = !zone ? { ok: true, na: true, warn: true, detail: 'Not checked: the rack has no cooling zone' }
    : zoneFree! >= need.kw ? { ok: true, detail: `${zone.zone.name}: ${zoneFree} kW free with one unit lost` }
    : { ok: false, detail: `${zone.zone.name}: ${zoneFree} kW free with one unit lost, ${need.kw} kW needed` };
  if (!cooling.ok) blocked.push(cooling.detail); else if (cooling.warn) warnings.push(cooling.detail);
  const score = blocked.length ? 0 : Math.max(1, Math.min(100, r0(100 - Math.max(0, afterPct - 50) - (warnings.length * 8) - (block && block.size > need.u * 3 ? 0 : 5))));
  return { rack, rb, hall, zone, floor, block, allocKw: alloc, freeKw: free, afterPct, pduSides, rpduFreeOutlets: rpduFree, weightAfterKg: weightAfter, floorKgM2, checks: { u, power, pdu, weight, cooling }, blocked, warnings, score };
}

/** PDU sides in a hall: side A are the PDUs on the first UPS, side B the rest. */
export function hallPduSides(data: PlannerData, hallId: string, excludePlanId?: string): PduSide[] {
  const pdus = data.pdus.filter(p => p.hallId === hallId);
  const upsIds = [...new Set(pdus.map(p => p.upsId ?? ''))].sort();
  return pdus.map(pdu => ({ side: (upsIds.indexOf(pdu.upsId ?? '') % 2 === 0 ? 'A' : 'B') as 'A' | 'B', pdu, headroomKw: r1(pdu.capacityKw - pdu.loadKw - pduHeldKw(data, pdu.id, excludePlanId)), freeOutlets: Math.max(0, pdu.outletCount - pdu.outletsUsed) }));
}

/** Candidate racks at a site for a placement, best first. Blocked candidates carry their reasons. */
export function rackCandidates(data: PlannerData, site: SiteBaseline | undefined, need: RackNeed, hallId?: string): RackCandidate[] {
  if (!site) return [];
  const emptyIds = new Set(site.halls.flatMap(h => h.emptyRackIds));
  const racks = (groupBy(data, 'racks', 'dataCenterId').get(site.dc.id) ?? []).filter(r => (!hallId || r.hallId === hallId) && (need.mode === 'new-cabinet' ? emptyIds.has(r.id) : r.status === 'Active'));
  return racks.map(r => checkRack(data, site, r, need)).filter((x): x is RackCandidate => !!x)
    .sort((a, b) => (a.blocked.length ? 1 : 0) - (b.blocked.length ? 1 : 0) || b.score - a.score || b.freeKw - a.freeKw);
}

/* ================================================================== ports */
export interface PortPick { deviceId: string; deviceName: string; ifaceId: string; ifaceName: string; speedMbps?: number; side: 'A' | 'B' }
const isLeaf = (d: T.Device) => d.category === 'Switch' && !/spine|core|oob|console/i.test(d.name) && d.lifecycleState !== 'Retired';
const isSpine = (d: T.Device) => (d.category === 'Switch' || d.category === 'Router') && /spine/i.test(`${d.name} ${d.hostname ?? ''}`) && d.lifecycleState !== 'Retired';
/** The nearest leaf switches to a rack: in the rack, then the row (closest first), then the hall. */
export function nearestLeaves(data: PlannerData, rack: T.Rack): { device: T.Device; rack: T.Rack; distance: number }[] {
  const hallRacks = (groupBy(data, 'racks', 'hallId').get(rack.hallId) ?? []);
  const out: { device: T.Device; rack: T.Rack; distance: number }[] = [];
  for (const r of hallRacks) for (const d of groupBy(data, 'devices', 'rackId').get(r.id) ?? []) if (isLeaf(d)) out.push({ device: d, rack: r, distance: r.id === rack.id ? 0 : r.rowId === rack.rowId ? Math.abs(r.gridX - rack.gridX) : 100 + Math.abs(r.gridY - rack.gridY) * 10 + Math.abs(r.gridX - rack.gridX) });
  return out.sort((a, b) => a.distance - b.distance || a.device.name.localeCompare(b.device.name));
}
/** Free (enabled, not management, not cabled) interfaces of a device at a speed. */
export function freeInterfaces(data: PlannerData, deviceId: string, speedMbps: number, taken?: Set<string>): T.DeviceComponent[] {
  const cabled = cabledComponents(data);
  return (groupBy(data, 'deviceComponents', 'deviceId').get(deviceId) ?? []).filter(c => c.kind === 'interface' && c.enabled !== false && !c.mgmtOnly && (c.speedMbps ?? 0) === speedMbps && !cabled.has(c.id) && !taken?.has(c.id));
}
/** Ports for a rack on the nearest leaf pair, split between the two leaves. */
export function pickPorts(data: PlannerData, rack: T.Rack, speedMbps: number, count: number, taken = new Set<string>()): { ports: PortPick[]; leaves: T.Device[]; short: number; note: string } {
  const near = nearestLeaves(data, rack);
  const withFree = near.filter(n => freeInterfaces(data, n.device.id, speedMbps, taken).length > 0);
  const pair = withFree.slice(0, 2).map(n => n.device);
  const ports: PortPick[] = [];
  for (let i = 0; i < count && pair.length; i++) {
    const side: 'A' | 'B' = pair.length > 1 && i % 2 === 1 ? 'B' : 'A';
    const dev = side === 'B' ? pair[1] : pair[0];
    const free = freeInterfaces(data, dev.id, speedMbps, taken)[0] ?? (pair[side === 'A' ? 1 : 0] ? freeInterfaces(data, pair[side === 'A' ? 1 : 0].id, speedMbps, taken)[0] : undefined);
    if (!free) break;
    taken.add(free.id);
    const owner = byId(data, 'devices', free.deviceId)!;
    ports.push({ deviceId: owner.id, deviceName: owner.name, ifaceId: free.id, ifaceName: free.name, speedMbps: free.speedMbps, side: owner.id === pair[0].id ? 'A' : 'B' });
  }
  const note = !near.length ? 'No leaf switches recorded in the hall' : !pair.length ? `No free ${speedMbps / 1000}G interfaces on the leaves in the hall` : pair.length < 2 ? `Only one leaf (${pair[0].name}) has free ${speedMbps / 1000}G ports; no A/B pair` : `Leaf pair ${pair[0].name} / ${pair[1].name}`;
  return { ports, leaves: pair, short: Math.max(0, count - ports.length), note };
}
/** Spine switches at a site and their free interfaces at a speed. */
export function spinePorts(data: PlannerData, dataCenterId: string, speedMbps: number): { spines: T.Device[]; free: number } {
  const spines = (groupBy(data, 'devices', 'dataCenterId').get(dataCenterId) ?? []).filter(isSpine);
  return { spines, free: spines.reduce((a, s) => a + freeInterfaces(data, s.id, speedMbps).length, 0) };
}

/* ================================================================== addresses */
export interface AddressPick { subnet?: T.Subnet; vlan?: T.VLAN; addresses: string[]; utilAfterPct: number; detail: string; ok: boolean; na?: boolean }
/** Addresses from the hall's existing subnet of a purpose (or the site's), kept under the IPAM fill limit. */
export function addressesFromHall(data: PlannerData, dataCenterId: string, hallId: string | undefined, purpose: T.Subnet['purpose'], need: number, taken = new Set<string>(), maxPct = SUBNET_MAX_PCT): AddressPick {
  if (need <= 0) return { addresses: [], utilAfterPct: 0, ok: true, detail: 'No addresses needed' };
  const all = data.subnets.filter(s => s.dataCenterId === dataCenterId && s.status !== 'Container' && s.status !== 'Deprecated' && s.purpose === purpose && s.state !== 'Consumed');
  const ranked = [...all.filter(s => hallId && s.hallId === hallId), ...all.filter(s => !s.hallId)];
  if (!ranked.length) return { addresses: [], utilAfterPct: 0, ok: false, detail: `No ${purpose.toLowerCase()} subnet recorded for the ${hallId ? 'hall or the site' : 'site'}` };
  for (const s of ranked) {
    const util = s.totalHosts ? ((s.usedHosts + need) / s.totalHosts) * 100 : 999;
    if (util > maxPct) continue;
    const r = parseCidr(s.cidr); if (!r) continue;
    const inUse = new Set((groupBy(data, 'ipAddresses', 'subnetId').get(s.id) ?? []).map(a => a.address));
    const out: string[] = [];
    // Hosts above the recorded used count (gateway at .1), skipping anything already recorded.
    for (let n = r.start + 2 + s.usedHosts; n < r.end && out.length < need; n++) { const ip = intToIp(n); if (!inUse.has(ip) && !taken.has(ip)) { out.push(ip); taken.add(ip); } }
    if (out.length < need) continue;
    const vlan = byId(data, 'vlans', s.vlanId);
    return { subnet: s, vlan, addresses: out, utilAfterPct: r0(util), ok: true, detail: `${need} from ${s.cidr} (${s.name})${vlan ? `, VLAN ${vlan.vlanNumber}` : ''}; ${r0(util)}% used after` };
  }
  const best = ranked[0];
  return { addresses: [], utilAfterPct: best.totalHosts ? r0(((best.usedHosts + need) / best.totalHosts) * 100) : 0, ok: false, detail: `Every ${purpose.toLowerCase()} subnet for the hall would go above ${maxPct}% (${ranked.map(s => `${s.cidr} ${s.usedHosts}/${s.totalHosts}`).join(', ')}); ask IPAM for a new prefix` };
}

/* ================================================================== hall grid and pods */
export type CellState = 'free' | 'empty-rack' | 'occupied' | 'retired' | 'held';
export interface GridCell { x: number; y: number; state: CellState; rack?: T.Rack; rowId?: string }
export interface HallGrid { hall: T.Hall; hb?: HallBaseline; cols: number; rows: number; cells: GridCell[][]; rowByY: Map<number, T.Row>; free: number }
export function hallGrid(data: PlannerData, site: SiteBaseline | undefined, hallId: string, excludePlanId?: string): HallGrid | undefined {
  const hall = byId(data, 'halls', hallId); if (!hall) return undefined;
  const racks = groupBy(data, 'racks', 'hallId').get(hall.id) ?? [];
  const rowRecs = groupBy(data, 'rows', 'hallId').get(hall.id) ?? [];
  const rowByY = new Map<number, T.Row>();
  for (const rw of rowRecs) { const y = racks.find(r => r.rowId === rw.id)?.gridY ?? Number(rw.gridPosition); if (Number.isFinite(y)) rowByY.set(y, rw); }
  const cols = Math.max(1, hall.gridCols, ...racks.map(r => r.gridX + 1)), rows = Math.max(1, hall.gridRows, ...racks.map(r => r.gridY + 1));
  const hb = site?.halls.find(h => h.hall.id === hall.id);
  const empty = new Set(hb?.emptyRackIds ?? []);
  const held = new Set(data.capacityReservations.filter(h => h.resourceType === 'Rack' && (h.state === 'Reserved' || h.state === 'Committed') && h.plannerPlanId !== excludePlanId).map(h => h.resourceId));
  const cells: GridCell[][] = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (__, x) => ({ x, y, state: 'free' as CellState, rowId: rowByY.get(y)?.id })));
  for (const r of racks) {
    const c = cells[r.gridY]?.[r.gridX]; if (!c) continue;
    c.rack = r; c.rowId = r.rowId;
    c.state = held.has(r.id) && r.plannerPlanId !== excludePlanId ? 'held' : r.status === 'Retired' ? 'retired' : empty.has(r.id) || (r.plannerPlanId && r.plannerPlanId === excludePlanId) ? 'empty-rack' : 'occupied';
  }
  // A hall that holds fewer positions than its grid (columns, doors, plant) caps the free count.
  const free = cells.flat().filter(c => c.state === 'free' || c.state === 'empty-rack').length;
  return { hall, hb, cols, rows, cells, rowByY, free };
}
export interface PodPosition { hallId: string; gridX: number; gridY: number; rackId?: string; rowId?: string }
export interface PodOption {
  id: string; hall: T.Hall; kind: 'row' | 'pair'; positions: PodPosition[]; gridYs: number[];
  zone?: ZoneBaseline; zoneHeadroomKw?: number; hallHeadroomKw: number; pduHeadroomKw: { A: number; B: number }; freeCircuits: { A: number; B: number };
  containment: T.Row['containment'] | 'New'; newRows: number[];
  fits: boolean; problems: string[]; score: number; perimeterM: number; aisles: number;
}
/** Grid pitch (one rack position plus its share of the aisle), metres. */
export const POSITION_W_M = 0.6, POSITION_D_M = 1.2;
/** Fence length around a set of positions on the grid (cage), metres, with a 1 m clearance all round. */
export function perimeterM(positions: { gridX: number; gridY: number }[]): number {
  if (!positions.length) return 0;
  const xs = positions.map(p => p.gridX), ys = positions.map(p => p.gridY);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * POSITION_W_M + 2;
  const d = (Math.max(...ys) - Math.min(...ys) + 1) * POSITION_D_M + (Math.max(...ys) > Math.min(...ys) ? 1.2 : 0) + 2;
  return r1(2 * (w + d));
}
/** Pod options at a site: contiguous runs in one row, or facing pairs (one contained aisle). */
export function podOptions(data: PlannerData, site: SiteBaseline | undefined, n: number, kwPerRack: number, layout: 'Auto' | 'One row' | 'Facing pair' = 'Auto', excludePlanId?: string, hallId?: string, closeCoupled = false): { options: PodOption[]; bestRun: number; freePositions: number } {
  if (!site || n <= 0) return { options: [], bestRun: 0, freePositions: 0 };
  const options: PodOption[] = []; let bestRun = 0; let freePositions = 0;
  const kw = n * kwPerRack;
  for (const hb of site.halls) {
    if (hallId && hb.hall.id !== hallId) continue;
    const g = hallGrid(data, site, hb.hall.id, excludePlanId); if (!g) continue;
    freePositions += g.free;
    const isFree = (x: number, y: number) => { const c = g.cells[y]?.[x]; return !!c && (c.state === 'free' || c.state === 'empty-rack'); };
    const runs = (y: number) => { const out: [number, number][] = []; let s = -1; for (let x = 0; x <= g.cols; x++) { const f = x < g.cols && isFree(x, y); if (f && s < 0) s = x; if (!f && s >= 0) { out.push([s, x - 1]); s = -1; } } return out; };
    const pos = (x: number, y: number): PodPosition => ({ hallId: hb.hall.id, gridX: x, gridY: y, rackId: g.cells[y][x].rack?.id, rowId: g.cells[y][x].rowId });
    const sides = hallPduSides(data, hb.hall.id, excludePlanId);
    const pduHead = { A: r1(sides.filter(s => s.side === 'A').reduce((a, s) => a + Math.max(0, s.headroomKw), 0)), B: r1(sides.filter(s => s.side === 'B').reduce((a, s) => a + Math.max(0, s.headroomKw), 0)) };
    const circuits = { A: sides.filter(s => s.side === 'A').reduce((a, s) => a + s.freeOutlets, 0), B: sides.filter(s => s.side === 'B').reduce((a, s) => a + s.freeOutlets, 0) };
    const zone = site.cooling.zones.find(z => z.zone.id === hb.hall.coolingZoneId);
    const make = (kind: PodOption['kind'], positions: PodPosition[], gridYs: number[]) => {
      const problems: string[] = [];
      if (hb.headroomKw < kw) problems.push(`${hb.hall.name} has ${hb.headroomKw} kW of design headroom, the pod needs ${kw} kW`);
      // Close-coupled cooling (in-row, rear doors) takes the heat at the rack, so the room zone is not loaded.
      if (!closeCoupled && zone && zone.headroomKw < kw) problems.push(`${zone.zone.name} has ${zone.headroomKw} kW of cooling headroom with one unit lost`);
      if (!closeCoupled && !zone) problems.push('No cooling zone recorded for the hall');
      const rowsHere = gridYs.map(y => g.rowByY.get(y));
      const contain = rowsHere.find(rw => rw)?.containment ?? 'New';
      const newRows = gridYs.filter(y => !g.rowByY.get(y));
      const score = r0(100 - (problems.length ? 60 : 0) - (kind === 'pair' ? 4 : 0) - (newRows.length ? 3 : 0) - Math.max(0, 30 - Math.min(30, (zone?.headroomKw ?? 0) - kw)) * 0.5 - Math.max(0, 20 - Math.min(20, Math.min(pduHead.A, pduHead.B) - kw)) * 0.5);
      options.push({ id: `${hb.hall.id}:${kind}:${gridYs.join('-')}:${positions[0].gridX}`, hall: hb.hall, kind, positions, gridYs, zone, zoneHeadroomKw: zone?.headroomKw, hallHeadroomKw: hb.headroomKw, pduHeadroomKw: pduHead, freeCircuits: circuits, containment: contain, newRows, fits: !problems.length, problems, score: Math.max(1, score), perimeterM: perimeterM(positions), aisles: kind === 'pair' ? 1 : 1 });
    };
    for (let y = 0; y < g.rows; y++) {
      for (const [a, b] of runs(y)) {
        bestRun = Math.max(bestRun, b - a + 1);
        if (layout !== 'Facing pair' && b - a + 1 >= n) make('row', Array.from({ length: n }, (_, i) => pos(a + i, y)), [y]);
      }
      if (layout !== 'One row' && y + 1 < g.rows && n > 1) {
        const half = Math.ceil(n / 2), rest = n - half;
        for (const [a1, b1] of runs(y)) for (const [a2, b2] of runs(y + 1)) {
          const s = Math.max(a1, a2), e = Math.min(b1, b2);
          bestRun = Math.max(bestRun, Math.min(b1 - a1 + 1, b2 - a2 + 1) * 2);
          if (e - s + 1 >= half) make('pair', [...Array.from({ length: half }, (_, i) => pos(s + i, y)), ...Array.from({ length: rest }, (_, i) => pos(s + i, y + 1))], [y, y + 1]);
        }
      }
    }
  }
  options.sort((a, b) => Number(b.fits) - Number(a.fits) || b.score - a.score);
  return { options: options.slice(0, 12), bestRun, freePositions };
}

/* ================================================================== retrofit */
export interface RetrofitRow {
  rack: T.Rack; sel: T.PlannerRetrofitRack; todayKw: number; targetKw: number; deltaKw: number;
  zoneId?: string; liquidReady: boolean; readiness: 'ready' | 'kit' | 'new-cabinet'; readinessWhy: string;
  gpuServers: number; filledKg: number; maxKg: number; floorKgM2: number; floorRating?: number; weightOk: boolean; floorOk: boolean;
  feedsPerSide: number; feedAmps: 32 | 63; feedKwEach: number; existingFeedKw?: number; dcFeeds: boolean;
  services: number; customers: number; critical: number; devices: number;
}
/** Per-rack analysis of a retrofit selection. */
export function retrofitRows(data: PlannerData, sel: T.PlannerRetrofitRack[], gpuShare: number, captureLiquid: boolean): RetrofitRow[] {
  const gpu = itPerRack(data, 'GPU', 1);
  return sel.map((s): RetrofitRow | undefined => {
    const rack = byId(data, 'racks', s.rackId); if (!rack) return undefined;
    const rb = rackBaseline(data, rack.id);
    const floor = byId(data, 'floors', byId(data, 'halls', rack.hallId)?.floorId);
    const todayKw = r1(rack.currentPowerKw || 0); const targetKw = Math.max(0, s.targetKw);
    const gpuServers = Math.floor((targetKw * gpuShare * 1000) / gpu.typicalW);
    const otherKg = Math.round(((targetKw * (1 - gpuShare)) * 1000 / 800) * 30);
    const filledKg = r0(EMPTY_CABINET_KG + gpuServers * gpu.weightKg + otherKg + (captureLiquid ? LIQUID_KIT_KG : 0));
    const floorKgM2 = r0(filledKg / rackFootprintM2(rack));
    const weightOk = filledKg <= rack.maxWeightKg; const floorOk = !floor?.floorLoadingKgSqm || floorKgM2 <= floor.floorLoadingKgSqm;
    const auto: RetrofitRow['readiness'] = rack.liquidCoolingReady && weightOk ? 'ready' : weightOk && (rack.depthMm || 1200) >= 1000 ? 'kit' : 'new-cabinet';
    const readiness = s.readiness ?? auto;
    const why = readiness !== auto ? 'set by the planner' : rack.liquidCoolingReady ? (weightOk ? 'liquid-ready and rated for the filled weight' : 'liquid-ready but not rated for the filled weight') : weightOk ? 'not liquid-ready: manifold and door kit' : `filled ${filledKg} kg is above the ${rack.maxWeightKg} kg rating: new cabinet`;
    const big = acFeedKw(63), small = acFeedKw(32);
    const feedAmps: 32 | 63 = targetKw <= small ? 32 : 63;
    const feedKwEach = feedAmps === 32 ? small : big;
    const dcFeeds = !!rb?.feeds.some(f => f.supply === 'DC');
    const imp = impactOf(data, { rackIds: [rack.id] });
    return { rack, sel: s, todayKw, targetKw, deltaKw: r1(Math.max(0, targetKw - todayKw)), zoneId: rack.coolingZoneId, liquidReady: rack.liquidCoolingReady, readiness, readinessWhy: why, gpuServers, filledKg, maxKg: rack.maxWeightKg, floorKgM2, floorRating: floor?.floorLoadingKgSqm, weightOk, floorOk, feedsPerSide: Math.max(1, Math.ceil(targetKw / feedKwEach)), feedAmps, feedKwEach, existingFeedKw: rb?.feedRatingKw, dcFeeds, services: imp.services.length, customers: imp.customers.length, critical: imp.critical, devices: imp.deviceIds.length };
  }).filter((x): x is RetrofitRow => !!x);
}

/** Free positions at a site that can hold drained racks temporarily (outside the given racks' rows). */
export function swingPositions(data: PlannerData, site: SiteBaseline | undefined, excludeRowIds: Set<string>, excludePlanId?: string): T.Rack[] {
  if (!site) return [];
  const ids = site.halls.flatMap(h => h.emptyRackIds);
  return ids.map(id => byId(data, 'racks', id)).filter((r): r is T.Rack => !!r && !excludeRowIds.has(r.rowId) && (!r.plannerPlanId || r.plannerPlanId === excludePlanId));
}

/** Default retrofit candidates: racks in a hall with their kW, sorted by row and position. */
export function hallRacks(data: PlannerData, hallId: string | undefined): T.Rack[] {
  if (!hallId) return [];
  return (groupBy(data, 'racks', 'hallId').get(hallId) ?? []).filter(r => r.status !== 'Retired').sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
}
