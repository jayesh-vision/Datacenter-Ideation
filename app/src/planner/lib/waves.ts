/**
 * Wave engine — shared by server refresh, network refresh, rack replacement and migration.
 *
 * A wave is one change window of work inside a live site: the devices and racks it touches,
 * the services and customers behind them, the method, the rollback and how it is accepted.
 *
 *  - composeWaves(): groups the selection (by rack, then service) into waves. The two members
 *    of a redundant pair are never in the same wave; for network refreshes the A sides go
 *    first, then a soak period, then the B sides. Each wave holds what the crew can do in one
 *    window (devices per hour × window hours); the first wave is a smaller pilot. Dates fall on
 *    change nights with no clash (maintenance windows and open changes on the same equipment).
 *  - validateWaves(): the checks a reviewer makes on any set of waves, including waves edited by
 *    hand: pairs split, side B after side A plus soak, wave inside the crew's capacity, clashes
 *    (also upstream spine/core work during a leaf wave), every selected item in exactly one wave.
 *  - waveImpact(): services, customers, critical SLAs and revenue touched by one wave.
 */
import type * as T from '../p2b/types';
import { byId, groupBy, type PlannerData } from './plannerData';
import { clashes, haPairs, impactOf, nextFreeWindow, type Clash, type Impact } from './impact';

const DAY = 864e5;
const H = 3600e3;

/** A redundant pair (any source). Reasons beyond impact.haPairs: two switches of one model in one rack. */
export interface Pair { a: string; b: string; reason: string }

/** Pairs among the given devices: virtual chassis, peer links, service paths, naming, and same-rack switch pairs. */
export function pairsOf(data: PlannerData, deviceIds: string[]): Pair[] {
  const out: Pair[] = haPairs(data, deviceIds).map(p => ({ ...p }));
  const seen = new Set(out.map(p => [p.a, p.b].sort().join('|')));
  const used = new Set(out.flatMap(p => [p.a, p.b]));
  // Two switches of the same model in the same rack are almost always the two halves of a ToR pair.
  const byRack = new Map<string, T.Device[]>();
  for (const id of deviceIds) { const d = byId(data, 'devices', id); if (d?.rackId && d.category === 'Switch') byRack.set(`${d.rackId}|${d.model}`, [...(byRack.get(`${d.rackId}|${d.model}`) ?? []), d]); }
  for (const list of byRack.values()) {
    const free = list.filter(d => !used.has(d.id)).sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
    for (let i = 0; i + 1 < free.length; i += 2) {
      const k = [free[i].id, free[i + 1].id].sort().join('|'); if (seen.has(k)) continue;
      seen.add(k); out.push({ a: free[i].id, b: free[i + 1].id, reason: 'same rack, same model (assumed ToR pair)' });
    }
  }
  return out;
}

/** Side of each paired device: the first by name is A, its partner B. Unpaired devices are A. */
export function sidesOf(data: PlannerData, deviceIds: string[], pairs: Pair[]): Map<string, 'A' | 'B'> {
  const side = new Map<string, 'A' | 'B'>(deviceIds.map(id => [id, 'A' as const]));
  for (const p of pairs) {
    const [a, b] = [p.a, p.b].sort((x, y) => (byId(data, 'devices', x)?.name ?? x).localeCompare(byId(data, 'devices', y)?.name ?? y));
    if (side.get(a) === 'B') { side.set(b, 'A'); continue; }
    side.set(a, 'A'); side.set(b, 'B');
  }
  return side;
}

/** One unit of work the engine places in a wave (a rack's devices, a device, a rack, a service). */
export interface WaveUnit { key: string; label: string; deviceIds: string[]; rackIds: string[]; serviceIds?: string[]; circuitIds?: string[]; targetRackIds?: string[]; work: number; itKw?: number; side?: 'A' | 'B'; method?: string }

export interface ComposeInput {
  dataCenterId?: string; excludePlanId?: string;
  units: WaveUnit[]; pairs: Pair[];
  /** Work units one crew completes per hour (devices per hour, racks per hour…). */
  ratePerHour: number; windowHours: number;
  /** First wave is a smaller pilot (a third of a full wave, at least one unit). */
  pilot: boolean;
  /** Earliest start (after the equipment arrives). */
  after: string;
  /** Days between waves; the pilot is followed by a week for lessons learned. */
  gapDays?: number;
  /** Network: A sides first, then this many days of soak, then the B sides. */
  soakDays?: number; sideAware?: boolean;
  method: (w: WaveUnit[]) => string;
  rollback: (w: WaveUnit[], side?: 'A' | 'B') => string;
  acceptance: (w: WaveUnit[]) => string;
  /** Waves already closed or in progress are kept as they are. */
  keep?: T.PlannerWave[];
  /** Most units (racks, devices) in one wave, on top of the crew's capacity. */
  maxUnits?: number;
  /** Earliest start for a wave given every unit up to and including it (equipment arrival). */
  earliestFor?: (unitsSoFar: WaveUnit[]) => string | undefined;
  /** Services belong to the units that carry them (migrations), rather than to every wave that touches their path. */
  servicesFromUnits?: boolean;
}

/** Split units that hold both halves of a pair, so the halves can go in different waves. */
function splitPairs(units: WaveUnit[], pairs: Pair[]): WaveUnit[] {
  const out: WaveUnit[] = [];
  for (const u of units) {
    const set = new Set(u.deviceIds);
    const second = new Set(pairs.filter(p => set.has(p.a) && set.has(p.b)).map(p => p.b));
    if (!second.size) { out.push(u); continue; }
    const share = (ids: string[]) => (u.deviceIds.length ? ids.length / u.deviceIds.length : 0);
    const a = u.deviceIds.filter(d => !second.has(d)); const b = u.deviceIds.filter(d => second.has(d));
    out.push({ ...u, deviceIds: a, work: u.work * share(a), itKw: u.itKw !== undefined ? u.itKw * share(a) : undefined });
    out.push({ ...u, key: `${u.key}#b`, label: `${u.label} (second half of its pairs)`, deviceIds: b, serviceIds: [], circuitIds: [], work: u.work * share(b), itKw: u.itKw !== undefined ? u.itKw * share(b) : undefined });
  }
  return out;
}

/** Group units into waves and date them. Returns new waves after the kept ones. */
export function composeWaves(data: PlannerData, q: ComposeInput): T.PlannerWave[] {
  const cap = Math.max(1, q.ratePerHour * q.windowHours);
  const partner = new Map<string, Set<string>>();
  for (const p of q.pairs) { partner.set(p.a, new Set([...(partner.get(p.a) ?? []), p.b])); partner.set(p.b, new Set([...(partner.get(p.b) ?? []), p.a])); }
  const keptIds = new Set((q.keep ?? []).flatMap(w => [...w.deviceIds, ...w.rackIds]));
  const units = splitPairs(q.units, q.pairs).filter(u => u.deviceIds.length + u.rackIds.length + (u.serviceIds?.length ?? 0) > 0 && !u.deviceIds.some(d => keptIds.has(d)));
  const sides: ('A' | 'B' | undefined)[] = q.sideAware ? ['A', 'B'] : [undefined];
  const bins: { units: WaveUnit[]; work: number; devices: Set<string>; side?: 'A' | 'B'; cap: number }[] = [];
  let first = !(q.keep ?? []).length && q.pilot;
  for (const side of sides) {
    const list = units.filter(u => !q.sideAware || (u.side ?? 'A') === side);
    const start = bins.length;
    for (const u of list) {
      const clash = (b: (typeof bins)[number]) => u.deviceIds.some(d => [...(partner.get(d) ?? [])].some(x => b.devices.has(x)));
      let bin = bins.slice(start).find(b => b.work + u.work <= b.cap && (!q.maxUnits || b.units.length < q.maxUnits) && !clash(b));
      if (!bin) {
        const pilotCap = Math.max(u.work, Math.ceil(cap / 3));
        bin = { units: [], work: 0, devices: new Set(), side, cap: first ? pilotCap : cap };
        first = false;
        bins.push(bin);
      }
      bin.units.push(u); bin.work += u.work; u.deviceIds.forEach(d => bin!.devices.add(d));
    }
  }
  // Dates on change nights, clear of clashes, one after another.
  const out: T.PlannerWave[] = [];
  const taken = (q.keep ?? []).map(w => ({ start: w.windowStart, end: w.windowEnd }));
  const lastKept = (q.keep ?? []).map(w => w.windowEnd).sort().pop();
  let cursor = new Date(Math.max(new Date(q.after).getTime(), lastKept ? new Date(lastKept).getTime() + (q.gapDays ?? 2) * DAY : 0)).toISOString();
  let lastSide: 'A' | 'B' | undefined;
  const order0 = (q.keep ?? []).length;
  bins.forEach((b, i) => {
    if (q.sideAware && b.side === 'B' && lastSide === 'A') cursor = new Date(new Date(cursor).getTime() + Math.max(0, (q.soakDays ?? 7) - (q.gapDays ?? 2)) * DAY).toISOString();
    lastSide = b.side;
    const ready = q.earliestFor?.(bins.slice(0, i + 1).flatMap(x => x.units));
    if (ready && ready > cursor) cursor = ready;
    const deviceIds = [...new Set(b.units.flatMap(u => u.deviceIds))]; const rackIds = [...new Set(b.units.flatMap(u => u.rackIds))];
    const hours = Math.max(1, Math.min(q.windowHours, Math.ceil((b.work / Math.max(0.01, q.ratePerHour)) * 2) / 2));
    const win = nextFreeWindow(data, { dataCenterId: q.dataCenterId, deviceIds, rackIds, hours: q.windowHours, after: cursor, excludePlanId: q.excludePlanId, taken });
    taken.push(win);
    const pilot = i === 0 && order0 === 0 && q.pilot;
    const n = order0 + i + 1;
    const services = [...new Set([...b.units.flatMap(u => u.serviceIds ?? []), ...(q.servicesFromUnits ? [] : impactOf(data, { deviceIds, downstream: q.sideAware }).services.map(s => s.service.id))])];
    out.push({
      id: `W-${n}`, name: `${pilot ? 'Pilot wave' : `Wave ${n}`}${b.side ? ` · side ${b.side}` : ''}`, order: n, kind: pilot ? 'pilot' : 'wave',
      deviceIds, rackIds, serviceIds: services, circuitIds: [...new Set(b.units.flatMap(u => u.circuitIds ?? []))], side: b.side,
      method: q.method(b.units), targetRackIds: [...new Set(b.units.flatMap(u => u.targetRackIds ?? []))],
      windowStart: win.start, windowEnd: win.end, crewHours: hours,
      rollback: q.rollback(b.units, b.side), acceptance: q.acceptance(b.units), status: 'Planned',
      itKw: Math.round(b.units.reduce((a, u) => a + (u.itKw ?? 0), 0) * 10) / 10,
    });
    cursor = new Date(new Date(win.end).getTime() + (pilot ? 7 : (q.gapDays ?? 2)) * DAY).toISOString();
  });
  return out;
}

/* ================================================================== checks */
export interface WaveIssue { waveId: string; level: 'bad' | 'warn'; kind: 'pair' | 'order' | 'capacity' | 'clash' | 'upstream' | 'coverage' | 'window' | 'consent'; text: string; clash?: Clash }
export interface WaveCheck { issues: WaveIssue[]; byWave: Map<string, WaveIssue[]>; unassigned: string[]; duplicated: string[]; clashes: Map<string, Clash[]> }

const OPEN_WAVE: T.PlannerWave['status'][] = ['Planned', 'Scheduled', 'In progress'];
/** Devices upstream of the given ones (spines, cores, routers) through cables, or every such device at the site when no cables are recorded. */
export function upstreamOf(data: PlannerData, dataCenterId: string | undefined, deviceIds: string[]): string[] {
  const isUp = (d?: T.Device) => !!d && (d.category === 'Router' || /spine|core|agg/i.test(d.name ?? ''));
  const set = new Set(deviceIds); const out = new Set<string>();
  for (const id of deviceIds) {
    for (const c of groupBy(data, 'cables', 'aDeviceId').get(id) ?? []) if (!set.has(c.bDeviceId) && isUp(byId(data, 'devices', c.bDeviceId))) out.add(c.bDeviceId);
    for (const c of groupBy(data, 'cables', 'bDeviceId').get(id) ?? []) if (!set.has(c.aDeviceId) && isUp(byId(data, 'devices', c.aDeviceId))) out.add(c.aDeviceId);
  }
  if (!out.size && dataCenterId) for (const d of groupBy(data, 'devices', 'dataCenterId').get(dataCenterId) ?? []) if (isUp(d) && !set.has(d.id) && d.lifecycleState === 'Active') out.add(d.id);
  return [...out];
}

export interface ValidateInput {
  dataCenterId?: string; excludePlanId?: string;
  /** Everything that must be in exactly one wave. */
  expected: string[];
  /** How a wave lists its items (device ids for refreshes, rack ids for rack swaps, service ids for migrations). */
  itemsOf: (w: T.PlannerWave) => string[];
  pairs: Pair[]; ratePerHour: number; windowHours: number; workOf?: (w: T.PlannerWave) => number;
  sideAware?: boolean; soakDays?: number;
  /** Network: also flag spine/core work during a leaf wave. */
  upstream?: boolean;
}

export function validateWaves(data: PlannerData, waves: T.PlannerWave[], q: ValidateInput): WaveCheck {
  const issues: WaveIssue[] = []; const cl = new Map<string, Clash[]>();
  const live = waves.filter(w => w.status !== 'Cancelled');
  const owner = new Map<string, string[]>();
  for (const w of live) for (const id of q.itemsOf(w)) owner.set(id, [...(owner.get(id) ?? []), w.id]);
  const unassigned = q.expected.filter(id => !owner.has(id));
  const duplicated = [...owner.entries()].filter(([, ws]) => ws.length > 1).map(([id]) => id);
  if (unassigned.length) issues.push({ waveId: '', level: 'bad', kind: 'coverage', text: `${unassigned.length} item${unassigned.length === 1 ? ' is' : 's are'} in no wave` });
  if (duplicated.length) issues.push({ waveId: '', level: 'bad', kind: 'coverage', text: `${duplicated.length} item${duplicated.length === 1 ? ' is' : 's are'} in more than one wave` });
  const waveOf = new Map<string, T.PlannerWave>();
  for (const w of live) for (const d of w.deviceIds) waveOf.set(d, w);
  const cap = q.ratePerHour * q.windowHours;
  const name = (id: string) => byId(data, 'devices', id)?.name ?? id;
  for (const w of live) {
    const devs = new Set(w.deviceIds);
    for (const p of q.pairs) if (devs.has(p.a) && devs.has(p.b)) issues.push({ waveId: w.id, level: 'bad', kind: 'pair', text: `${name(p.a)} and ${name(p.b)} are a redundant pair (${p.reason}) and go down together` });
    const work = q.workOf ? q.workOf(w) : w.deviceIds.length;
    if (cap > 0 && work > cap + 1e-6) issues.push({ waveId: w.id, level: 'bad', kind: 'capacity', text: `${Math.round(work * 10) / 10} units of work, but one crew does ${Math.round(cap * 10) / 10} in a ${q.windowHours} h window` });
    const hours = (new Date(w.windowEnd).getTime() - new Date(w.windowStart).getTime()) / H;
    if (!(hours > 0)) issues.push({ waveId: w.id, level: 'bad', kind: 'window', text: 'The window has no length' });
    if (OPEN_WAVE.includes(w.status)) {
      const c = clashes(data, { dataCenterId: q.dataCenterId, deviceIds: w.deviceIds, rackIds: w.rackIds, start: w.windowStart, end: w.windowEnd, excludePlanId: q.excludePlanId, excludeChangeIds: w.changeRequestId ? [w.changeRequestId] : undefined }).filter(x => x.id !== w.maintenanceWindowId);
      if (q.upstream) {
        const up = upstreamOf(data, q.dataCenterId, w.deviceIds);
        for (const x of clashes(data, { dataCenterId: q.dataCenterId, deviceIds: up, start: w.windowStart, end: w.windowEnd, excludePlanId: q.excludePlanId })) {
          if (x.overlapTime && x.sharedResources.length && !c.some(y => y.id === x.id)) c.push({ ...x, severity: 'block', title: `${x.title} (upstream ${x.sharedResources.map(name).slice(0, 2).join(', ')})` });
        }
      }
      cl.set(w.id, c);
      for (const x of c) issues.push({ waveId: w.id, level: x.severity === 'block' ? 'bad' : 'warn', kind: x.title.includes('(upstream') ? 'upstream' : 'clash', text: `${x.kind === 'window' ? 'Maintenance window' : 'Change'} ${x.id} ${x.title}${x.overlapTime ? ' overlaps the window' : ' is open'}${x.sharedResources.length ? ` and touches ${x.sharedResources.length} of the same item${x.sharedResources.length === 1 ? '' : 's'}` : ' at the same site'}`, clash: x });
    }
  }
  if (q.sideAware) {
    for (const p of q.pairs) {
      const wa = waveOf.get(p.a), wb = waveOf.get(p.b); if (!wa || !wb || wa === wb) continue;
      const [first, second] = new Date(wa.windowStart) <= new Date(wb.windowStart) ? [wa, wb] : [wb, wa];
      const gap = (new Date(second.windowStart).getTime() - new Date(first.windowEnd).getTime()) / DAY;
      if (gap < (q.soakDays ?? 0)) issues.push({ waveId: second.id, level: 'bad', kind: 'order', text: `${name(p.a)}/${name(p.b)}: the second side starts ${Math.max(0, Math.round(gap * 10) / 10)} days after the first, under the ${q.soakDays} day soak` });
    }
  }
  const byWave = new Map<string, WaveIssue[]>();
  for (const i of issues) byWave.set(i.waveId, [...(byWave.get(i.waveId) ?? []), i]);
  return { issues, byWave, unassigned, duplicated, clashes: cl };
}

/** Services, customers, critical SLAs and revenue touched by one wave. Switches count what hangs off them through cables. */
export function waveImpact(data: PlannerData, w: T.PlannerWave, downstream = false): Impact {
  return impactOf(data, { deviceIds: w.deviceIds, rackIds: w.rackIds, downstream });
}

/** Phases that mirror the waves (the generic schedule and capacity views read phases). Shares sum to `totalKw`. */
export function phasesFromWaves(waves: T.PlannerWave[], totalKw: number): T.PlannerPhase[] {
  const live = [...waves].filter(w => w.status !== 'Cancelled').sort((a, b) => a.order - b.order);
  if (!live.length) return [];
  const weights = live.map(w => Math.max(0.001, w.itKw ?? w.deviceIds.length + w.rackIds.length));
  const sum = weights.reduce((a, x) => a + x, 0);
  let left = Math.round(totalKw);
  return live.map((w, i) => {
    const kw = i === live.length - 1 ? left : Math.round((totalKw * weights[i]) / sum);
    left -= kw;
    return { id: w.id, name: w.name, goLive: w.windowEnd, itKw: kw, halls: 0, racks: w.rackIds.length, status: w.status === 'Closed' ? 'Live' : w.status === 'In progress' ? 'In delivery' : w.status === 'Scheduled' ? 'Approved' : 'Planned' };
  });
}

export const WAVE_STATUS_TONE: Record<T.PlannerWave['status'], 'neutral' | 'info' | 'warning' | 'success' | 'error'> = { Planned: 'neutral', Scheduled: 'info', 'In progress': 'warning', Closed: 'success', 'Rolled back': 'error', Cancelled: 'neutral' };
