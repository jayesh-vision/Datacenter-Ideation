/**
 * Impact and clash checks — who is affected when equipment is touched, and whether the
 * proposed window collides with other work.
 *
 *  - impactOf(): devices or racks → the services that run on them or route through them,
 *    the customers behind those services (premium, critical SLAs, revenue), circuit
 *    terminations (cross-connects) and, optionally, devices downstream through cables.
 *  - haPairs(): redundant pairs (virtual chassis members, LAG and peer links, and devices
 *    that appear side by side in the same service paths) that must not go down together.
 *  - clashes(): maintenance windows and open change requests at the site that overlap a
 *    window and touch the same devices or racks; nextFreeWindow() proposes a clean slot.
 */
import type * as T from '../p2b/types';
import type * as E from '../p2b/enums';
import { byId, groupBy, type PlannerData } from './plannerData';

export interface ImpactedService { service: T.Service; customer?: T.Customer; via: 'device' | 'rack' | 'path' }
export interface Impact {
  deviceIds: string[]; rackIds: string[];
  /** Devices reached through cables from the selected switches (servers behind a ToR). */
  downstreamDeviceIds: string[];
  services: ImpactedService[]; customers: { customer: T.Customer; services: T.Service[]; revenueMonthly: number; critical: number }[];
  critical: number; revenueMonthly: number; minSla: number | undefined;
  terminations: { termination: T.CircuitTermination; circuit?: T.Circuit }[];
}

/** Everything that depends on the given devices and racks. */
export function impactOf(data: PlannerData, sel: { deviceIds?: string[]; rackIds?: string[]; downstream?: boolean }): Impact {
  const rackIds = new Set(sel.rackIds ?? []);
  const deviceIds = new Set(sel.deviceIds ?? []);
  for (const r of rackIds) for (const d of groupBy(data, 'devices', 'rackId').get(r) ?? []) deviceIds.add(d.id);
  const downstream = new Set<string>();
  if (sel.downstream) {
    for (const id of deviceIds) {
      for (const c of groupBy(data, 'cables', 'aDeviceId').get(id) ?? []) if (!deviceIds.has(c.bDeviceId)) downstream.add(c.bDeviceId);
      for (const c of groupBy(data, 'cables', 'bDeviceId').get(id) ?? []) if (!deviceIds.has(c.aDeviceId)) downstream.add(c.aDeviceId);
    }
  }
  const all = new Set([...deviceIds, ...downstream]);
  const services: ImpactedService[] = [];
  for (const s of data.services) {
    if (s.status === 'Disabled') continue;
    const via: ImpactedService['via'] | undefined = s.deviceId && all.has(s.deviceId) ? 'device' : s.rackId && rackIds.has(s.rackId) ? 'rack' : s.pathDeviceIds?.some(d => all.has(d)) ? 'path' : undefined;
    if (via) services.push({ service: s, customer: byId(data, 'customers', s.customerRef), via });
  }
  const byCust = new Map<string, Impact['customers'][number]>();
  for (const x of services) {
    if (!x.customer) continue;
    const e = byCust.get(x.customer.id) ?? { customer: x.customer, services: [], revenueMonthly: 0, critical: 0 };
    e.services.push(x.service); e.revenueMonthly += x.service.revenueMonthly || 0; if (x.service.critical) e.critical++;
    byCust.set(x.customer.id, e);
  }
  const terminations = data.circuitTerminations.filter(t => t.deviceId && all.has(t.deviceId)).map(t => ({ termination: t, circuit: byId(data, 'circuits', t.circuitId) }));
  const slas = services.map(s => s.service.slaTarget).filter(Boolean);
  return {
    deviceIds: [...deviceIds], rackIds: [...rackIds], downstreamDeviceIds: [...downstream], services, customers: [...byCust.values()].sort((a, b) => b.revenueMonthly - a.revenueMonthly),
    critical: services.filter(s => s.service.critical).length, revenueMonthly: services.reduce((a, s) => a + (s.service.revenueMonthly || 0), 0), minSla: slas.length ? Math.max(...slas) : undefined, terminations,
  };
}

export interface HaPair { a: string; b: string; reason: 'virtual chassis' | 'peer link' | 'service path' | 'naming' }
/** Redundant pairs among the given devices (or all devices at a site). */
export function haPairs(data: PlannerData, deviceIds: string[]): HaPair[] {
  const set = new Set(deviceIds); const out: HaPair[] = []; const seen = new Set<string>();
  const add = (a: string, b: string, reason: HaPair['reason']) => { const k = [a, b].sort().join('|'); if (a === b || seen.has(k)) return; seen.add(k); out.push({ a, b, reason }); };
  // Virtual chassis members.
  const byVc = new Map<string, string[]>();
  for (const id of set) { const d = byId(data, 'devices', id); if (d?.virtualChassisId) byVc.set(d.virtualChassisId, [...(byVc.get(d.virtualChassisId) ?? []), id]); }
  for (const m of byVc.values()) for (let i = 1; i < m.length; i++) add(m[0], m[i], 'virtual chassis');
  // Peer links: a cable between two selected devices of the same category.
  for (const id of set) for (const c of groupBy(data, 'cables', 'aDeviceId').get(id) ?? []) if (set.has(c.bDeviceId) && byId(data, 'devices', id)?.category === byId(data, 'devices', c.bDeviceId)?.category) add(id, c.bDeviceId, 'peer link');
  // Service paths: two selected devices of the same category in one path are the two halves of a pair.
  for (const s of data.services) {
    const inPath = (s.pathDeviceIds ?? []).filter(d => set.has(d));
    for (let i = 0; i < inPath.length; i++) for (let j = i + 1; j < inPath.length; j++) if (byId(data, 'devices', inPath[i])?.category === byId(data, 'devices', inPath[j])?.category) add(inPath[i], inPath[j], 'service path');
  }
  // Naming: same stem ending -01/-02, -a/-b.
  const stem = (n: string) => n.replace(/[-_]?(0?1|0?2|a|b)$/i, '');
  const byStem = new Map<string, string[]>();
  for (const id of set) { const d = byId(data, 'devices', id); if (!d?.name || !/[-_](0?[12]|[ab])$/i.test(d.name)) continue; const k = `${d.category}|${stem(d.name)}`; byStem.set(k, [...(byStem.get(k) ?? []), id]); }
  for (const m of byStem.values()) if (m.length === 2) add(m[0], m[1], 'naming');
  return out;
}

/* ================================================================== clashes */
const OPEN_CHANGE: E.ChangeStatus[] = ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];
const LIVE_WINDOW: E.MaintenanceStatus[] = ['Scheduled', 'In Progress'];
export interface Clash { kind: 'window' | 'change'; id: string; title: string; start?: string; end?: string; overlapTime: boolean; sharedResources: string[]; severity: 'block' | 'warn' }
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Work that collides with a window at a site. Shared devices or racks in an overlapping window
 * block; another window at the same site at the same time, or an open change on the same
 * resources at any time, warns.
 */
export function clashes(data: PlannerData, q: { dataCenterId?: string; deviceIds?: string[]; rackIds?: string[]; start: string; end: string; excludeChangeIds?: string[]; excludePlanId?: string }): Clash[] {
  const out: Clash[] = [];
  const t0 = new Date(q.start).getTime(), t1 = new Date(q.end).getTime();
  const res = new Set([...(q.deviceIds ?? []), ...(q.rackIds ?? [])]);
  for (const r of q.rackIds ?? []) for (const d of groupBy(data, 'devices', 'rackId').get(r) ?? []) res.add(d.id);
  const skip = new Set(q.excludeChangeIds ?? []);
  for (const w of data.maintenanceWindows) {
    if (!LIVE_WINDOW.includes(w.status) || (q.dataCenterId && w.dataCenterId !== q.dataCenterId) || (q.excludePlanId && w.plannerPlanId === q.excludePlanId) || (w.changeRequestId && skip.has(w.changeRequestId))) continue;
    const time = overlaps(t0, t1, new Date(w.scheduledStart).getTime(), new Date(w.scheduledEnd).getTime());
    const shared = (w.affectedDeviceIds ?? []).filter(d => res.has(d));
    if (time) out.push({ kind: 'window', id: w.id, title: w.title, start: w.scheduledStart, end: w.scheduledEnd, overlapTime: true, sharedResources: shared, severity: shared.length ? 'block' : 'warn' });
  }
  for (const c of data.changeRequests) {
    if (!OPEN_CHANGE.includes(c.status) || skip.has(c.id) || (q.excludePlanId && c.plannerPlanId === q.excludePlanId)) continue;
    if (q.dataCenterId && c.dataCenterId && c.dataCenterId !== q.dataCenterId) continue;
    const shared = (c.affectedResourceIds ?? []).filter(id => res.has(id));
    const time = c.scheduledStart ? overlaps(t0, t1, new Date(c.scheduledStart).getTime(), new Date(c.scheduledEnd ?? c.scheduledStart).getTime() + 1) : false;
    if (shared.length) out.push({ kind: 'change', id: c.id, title: c.title, start: c.scheduledStart, end: c.scheduledEnd, overlapTime: time, sharedResources: shared, severity: time ? 'block' : 'warn' });
  }
  return out;
}

/** Default change windows: Tuesday to Thursday and Saturday nights, 22:00 to the given length (UTC). */
export const CHANGE_NIGHTS = [2, 3, 4, 6];
/** First window of `hours` after `after` on a change night with no blocking clash. */
export function nextFreeWindow(data: PlannerData, q: { dataCenterId?: string; deviceIds?: string[]; rackIds?: string[]; hours: number; after: string; nights?: number[]; excludePlanId?: string; taken?: { start: string; end: string }[] }): { start: string; end: string } {
  const nights = q.nights ?? CHANGE_NIGHTS;
  const d = new Date(q.after); d.setUTCHours(22, 0, 0, 0); if (d.getTime() < new Date(q.after).getTime()) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 400; i++) {
    if (nights.includes(d.getUTCDay())) {
      const start = d.toISOString(); const end = new Date(d.getTime() + q.hours * 3600e3).toISOString();
      const takenClash = (q.taken ?? []).some(t => overlaps(new Date(start).getTime(), new Date(end).getTime(), new Date(t.start).getTime(), new Date(t.end).getTime()));
      if (!takenClash && !clashes(data, { ...q, start, end }).some(c => c.severity === 'block' || (c.kind === 'window' && c.overlapTime))) return { start, end };
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { start: d.toISOString(), end: new Date(d.getTime() + q.hours * 3600e3).toISOString() };
}
