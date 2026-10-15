/**
 * Replace family core — what is replaced, by what, where the new equipment goes and what that
 * does to each rack. Pure functions over the platform data; no React.
 *
 *  - Selection: candidates at the site with the reasons they qualify (end of life, warranty
 *    expired, faulty, age), flagged when another plan or an open change already holds them.
 *  - Mapping: old model and role → new model, ratio (old per new) and what happens to the old
 *    devices. One row per old model and role; per-device rows are derived from it.
 *  - Units and placement: each new unit, the old devices it replaces, the rack and U it goes
 *    into (freed space, or free space when the old one must keep running for a parallel run)
 *    without breaking the rack's power rating.
 *  - Rack rows: per rack, before → after in kW (typical and peak), U, kg and feed loading.
 */
import type * as T from '../p2b/types';
import { byId, groupBy, type PlannerData } from './plannerData';
import { rackBaseline, type RackBaseline } from './site';
import { impactOf } from './impact';
import { CATALOGUE } from './catalogue';

export type ReplaceScope = 'server-refresh' | 'network-refresh' | 'rack-replace';
export const isReplaceScope = (s: T.PlannerScope): s is ReplaceScope => s === 'server-refresh' || s === 'network-refresh' || s === 'rack-replace';
const r1 = (n: number) => Math.round(n * 10) / 10;
const YEAR = 365 * 864e5;
const OPEN_CHANGE: T.ChangeRequest['status'][] = ['Draft', 'Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'];
const GONE = (d: T.Device) => d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed';

/* ================================================================== selection */
export type Reason = 'eol' | 'warranty' | 'faulty' | 'age';
export const REASON_LABEL: Record<Reason, string> = { eol: 'Past end of life', warranty: 'Warranty expired', faulty: 'Faulty', age: 'Older than' };
export type RackReason = 'over-power' | 'old-type' | 'shallow' | 'unmetered' | 'damaged';
export const RACK_REASON_LABEL: Record<RackReason, string> = { 'over-power': 'Draws more than its rating', 'old-type': 'Old rack type', shallow: 'Too shallow for its deepest device', unmetered: 'No metered power strips', damaged: 'Marked damaged' };

/** What the list was filtered on; saved on the plan so reopening the wizard shows the same list. The reasons are quick filters over
    every eligible device at the site (none = the whole list, several = any of them), not a requirement to qualify. */
export interface SelectionCriteria {
  reasons: Reason[]; years: number;
  models?: string[]; rackIds?: string[]; rowIds?: string[]; teams?: string[]; serviceIds?: string[]; text?: string;
  rackReasons?: RackReason[]; rackTypes?: string[]; damagedRackIds?: string[];
}
export const DEFAULT_CRITERIA: SelectionCriteria = { reasons: [], years: 5, rackReasons: [] };
export function readCriteria(plan: T.PlannerPlan): SelectionCriteria {
  const raw = plan.params.selectionCriteria;
  if (typeof raw !== 'string' || !raw) return DEFAULT_CRITERIA;
  try { return { ...DEFAULT_CRITERIA, ...(JSON.parse(raw) as Partial<SelectionCriteria>) }; } catch { return DEFAULT_CRITERIA; }
}
export const CATEGORIES: Record<ReplaceScope, string[]> = { 'server-refresh': ['Server', 'GPU-Node', 'Storage'], 'network-refresh': ['Switch', 'Router', 'Firewall'], 'rack-replace': [] };

/** Why another plan or an open change already holds a device (or its rack). */
export function heldBy(data: PlannerData, plan: Pick<T.PlannerPlan, 'id' | 'plnId'>, d: T.Device): string | undefined {
  if (d.plannerPlanId && d.plannerPlanId !== plan.id) { const p = byId(data, 'plannerPlans', d.plannerPlanId); return `Held by plan ${p?.plnId ?? d.plannerPlanId}`; }
  const note = String(d.notes ?? '');
  if (note.startsWith('Reserved for') && !note.includes(plan.plnId)) return note.split('·')[0].trim();
  // Only a change on the device itself holds it; work elsewhere in its rack is a scheduling clash, checked per wave.
  const chg = data.changeRequests.find(c => OPEN_CHANGE.includes(c.status) && c.plannerPlanId !== plan.id && (c.affectedResourceIds ?? []).includes(d.id));
  return chg ? `In open change ${chg.id} (${chg.status})` : undefined;
}

/** Why a device is due for replacement, with the dates behind each reason (end of sale / support of its model, warranty end, age). */
export interface Reasons { why: Reason[]; ageYears?: number; eolAt?: number; supportEndAt?: number; warrantyEndAt?: number }
export function reasonsOf(data: PlannerData, d: T.Device, years: number, now: number): Reasons {
  const why: Reason[] = [];
  const am = d.model ? data.assetModels.find(m => m.model === d.model) : undefined;
  const eolAt = am?.eolDate ? new Date(am.eolDate).getTime() : undefined;
  if (eolAt !== undefined && eolAt < now) why.push('eol');
  const w = d.warrantyContractId ? byId(data, 'contracts', d.warrantyContractId) : undefined;
  const warrantyEndAt = d.warrantyEndDate ? new Date(d.warrantyEndDate).getTime() : w ? new Date(w.endDate).getTime() : undefined;
  if ((warrantyEndAt !== undefined && warrantyEndAt < now) || w?.status === 'Expired') why.push('warranty');
  if (d.status === 'Faulty') why.push('faulty');
  const age = d.commissionedDate ? (now - new Date(d.commissionedDate).getTime()) / YEAR : undefined;
  if (age !== undefined && age > years) why.push('age');
  return { why, ageYears: age !== undefined ? r1(age) : undefined, eolAt, supportEndAt: am?.supportEndDate ? new Date(am.supportEndDate).getTime() : undefined, warrantyEndAt };
}
/** Severity for ordering a list: faulty, then past end of life, then out of warranty, then age. */
export const REASON_WEIGHT: Record<Reason, number> = { faulty: 8, eol: 4, warranty: 2, age: 1 };
export const severityOf = (why: Reason[]) => why.reduce((a, r) => a + REASON_WEIGHT[r], 0);

export interface Candidate extends Reasons { d: T.Device; rack?: T.Rack; row?: T.Row; services: T.Service[]; held?: string; role: RoleKey }
/** Every device of the plan type's categories racked at the site, with the reasons it is due for replacement (possibly none). */
export function deviceCandidates(data: PlannerData, plan: T.PlannerPlan, years: number, now: number): Candidate[] {
  const cats = CATEGORIES[plan.scope as ReplaceScope] ?? [];
  const svcBy = new Map<string, T.Service[]>();
  for (const s of data.services) if (s.status !== 'Disabled') for (const id of new Set([s.deviceId, ...(s.pathDeviceIds ?? [])].filter(Boolean) as string[])) svcBy.set(id, [...(svcBy.get(id) ?? []), s]);
  return (groupBy(data, 'devices', 'dataCenterId').get(plan.dataCenterId ?? '') ?? []).filter(d => d.rackId && cats.includes(String(d.category)) && !GONE(d) && d.lifecycleState !== 'Ordered').map(d => {
    const rack = byId(data, 'racks', d.rackId);
    return { d, ...reasonsOf(data, d, years, now), rack, row: byId(data, 'rows', rack?.rowId), services: svcBy.get(d.id) ?? [], held: heldBy(data, plan, d), role: roleOf(d) };
  });
}

export const selectedIds = (plan: T.PlannerPlan) => String(plan.params.affectedIds ?? '').split(',').filter(Boolean);
/** The devices being replaced (server, network) or re-racked (every live device in the selected racks). */
export function oldDevicesOf(data: PlannerData, plan: T.PlannerPlan): T.Device[] {
  const ids = selectedIds(plan);
  if (plan.scope === 'rack-replace') return ids.flatMap(r => (groupBy(data, 'devices', 'rackId').get(r) ?? []).filter(d => !GONE(d)));
  return ids.map(id => byId(data, 'devices', id)).filter((d): d is T.Device => !!d && !GONE(d));
}
export function affectedRackIds(data: PlannerData, plan: T.PlannerPlan): string[] {
  if (plan.scope === 'rack-replace') return selectedIds(plan).filter(id => !!byId(data, 'racks', id));
  return [...new Set(oldDevicesOf(data, plan).map(d => d.rackId!).filter(Boolean))];
}

/* ================================================================== mapping */
export type RoleKey = 'server' | 'gpu' | 'storage' | 'leaf' | 'spine' | 'core' | 'firewall' | 'other';
export const ROLE_LABEL: Record<RoleKey, string> = { server: 'Server', gpu: 'GPU server', storage: 'Storage array', leaf: 'Leaf / ToR switch', spine: 'Spine switch', core: 'Core router', firewall: 'Firewall', other: 'Other' };
export function roleOf(d: Pick<T.Device, 'category' | 'name'>): RoleKey {
  switch (d.category) {
    case 'Server': return 'server'; case 'GPU-Node': return 'gpu'; case 'Storage': return 'storage'; case 'Router': return 'core'; case 'Firewall': return 'firewall';
    case 'Switch': return /spine/i.test(d.name ?? '') ? 'spine' : /core|agg/i.test(d.name ?? '') ? 'core' : 'leaf';
    default: return 'other';
  }
}
/** Approved catalogue models per role (the mapping offers only these). */
export const ROLE_MODELS: Record<RoleKey, string[]> = {
  server: CATALOGUE.server.options.map(o => o.model), gpu: CATALOGUE['gpu-server'].options.map(o => o.model), storage: CATALOGUE.storage.options.map(o => o.model),
  leaf: CATALOGUE.leaf.options.map(o => o.model), spine: CATALOGUE.spine.options.map(o => o.model), core: CATALOGUE.core.options.map(o => o.model), firewall: CATALOGUE.firewall.options.map(o => o.model), other: [],
};
export const ROLE_KIND: Record<RoleKey, keyof typeof CATALOGUE | undefined> = { server: 'server', gpu: 'gpu-server', storage: 'storage', leaf: 'leaf', spine: 'spine', core: 'core', firewall: 'firewall', other: undefined };
export const mapKey = (oldModel: string, role: string) => `${oldModel}|${role}`;
const DISPOSITION: Record<string, T.PlannerMappingRow['disposition']> = { 'Certified disposal': 'dispose', 'Keep as spares': 'keep', Resell: 'resell' };

export interface MapRow extends T.PlannerMappingRow { roleKey: RoleKey; deviceIds: string[]; am?: T.AssetModel; oldAm?: T.AssetModel; peakKw: number; fromPlan: boolean }
/** Old model and role → new model. Rows saved on the plan win; others get the catalogue default for the role. */
export function effectiveMapping(data: PlannerData, plan: T.PlannerPlan, old: T.Device[], params: { replacementModel?: string; consolidationRatio?: number; oldEquipment?: string }): MapRow[] {
  if (plan.scope === 'rack-replace') return [];
  const groups = new Map<string, T.Device[]>();
  for (const d of old) { const k = mapKey(d.model ?? 'Unknown model', roleOf(d)); groups.set(k, [...(groups.get(k) ?? []), d]); }
  const saved = new Map((plan.mapping ?? []).map(m => [m.id, m]));
  const disp = DISPOSITION[params.oldEquipment ?? ''] ?? 'dispose';
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([key, devs]) => {
    const role = roleOf(devs[0]);
    const s = saved.get(key);
    const pref = params.replacementModel && ROLE_MODELS[role].includes(params.replacementModel) ? params.replacementModel : undefined;
    const newModel = s?.newModel || pref || ROLE_MODELS[role][0] || '';
    const ratio = Math.max(1, s?.ratio ?? (role === 'server' ? params.consolidationRatio ?? 2 : role === 'storage' ? 2 : 1));
    const am = data.assetModels.find(m => m.model === newModel); const oldAm = data.assetModels.find(m => m.model === devs[0].model);
    const units = newModel ? Math.ceil(devs.length / ratio) : 0;
    return {
      id: key, oldModel: devs[0].model ?? 'Unknown model', role: ROLE_LABEL[role], roleKey: role, count: devs.length, newModel, ratio, disposition: s?.disposition ?? disp,
      newUnits: units, newKw: r1((units * (am?.typicalPowerW ?? 0)) / 1000), peakKw: r1((units * (am?.maxPowerW ?? am?.typicalPowerW ?? 0)) / 1000),
      oldKw: r1(devs.reduce((a, d) => a + oldW(d, oldAm), 0) / 1000), deviceIds: devs.map(d => d.id), am, oldAm, fromPlan: !!s,
    };
  });
}
/** Measured draw of an old device, or its model's typical draw when nothing is metered. */
export const oldW = (d: T.Device, am?: T.AssetModel) => d.powerDrawW ?? am?.typicalPowerW ?? 400;
/** The mapping rows to save on the plan (drops the derived fields). */
export const toPlanMapping = (rows: MapRow[]): T.PlannerMappingRow[] => rows.map(({ id, oldModel, role, count, newModel, ratio, disposition, newUnits, newKw, oldKw }) => ({ id, oldModel, role, count, newModel, ratio, disposition, newUnits, newKw, oldKw }));

/* ================================================================== units and placement */
export interface NewUnit {
  id: string; mapId: string; model: string; am?: T.AssetModel; oldIds: string[];
  rackId?: string; startU?: number; heightU: number; typicalKw: number; maxKw: number; weightKg: number;
  /** Addresses and name carried over from the first old device. */
  keepIp4?: string; keepOob?: string; keepHostname?: string;
  /** The old device keeps running while the new one is installed (parallel run, or network rollback). */
  parallel: boolean; placed: boolean; note: string;
}
interface RackState { rb: RackBaseline; used: Set<number>; kwEnd: number; kwPeak: number; limit: number; feedLimit: number }

/**
 * One new unit per `ratio` old devices of a mapping row, placed in the rack of the first old
 * device when it fits (U, power after the swap, and peak during a parallel run), otherwise in
 * another rack of the same row, otherwise the same hall.
 */
export function planUnits(data: PlannerData, plan: T.PlannerPlan, mapping: MapRow[], opts: { parallelAll: boolean; parallelDeviceIds: Set<string>; network: boolean }): NewUnit[] {
  const state = new Map<string, RackState>();
  const st = (rackId: string): RackState | undefined => {
    let s = state.get(rackId); if (s) return s;
    const rb = rackBaseline(data, rackId, { excludePlanId: plan.id }); if (!rb) return undefined;
    s = { rb, used: new Set(rb.usedUnits), kwEnd: rb.drawKw + rb.reservedKw, kwPeak: rb.drawKw + rb.reservedKw, limit: rb.ratingKw, feedLimit: rb.feedRatingKw ?? rb.ratingKw };
    state.set(rackId, s); return s;
  };
  // End state: every old device is gone from its rack (kW); its U is free unless the old one must keep running during the swap.
  const all = mapping.flatMap(m => m.deviceIds.map(id => ({ d: byId(data, 'devices', id)!, m }))).filter(x => x.d);
  const parallelOf = (d: T.Device) => opts.network || opts.parallelAll || opts.parallelDeviceIds.has(d.id);
  for (const { d, m } of all) {
    const s = d.rackId ? st(d.rackId) : undefined; if (!s) continue;
    s.kwEnd -= oldW(d, m.oldAm) / 1000;
    if (!parallelOf(d) && d.position) for (let u = d.position; u < d.position + Math.max(1, d.heightU ?? 1); u++) s.used.delete(u);
  }
  const fitsAt = (s: RackState, start: number, h: number) => { if (start < 1 || start + h - 1 > s.rb.rack.heightU) return false; for (let u = start; u < start + h; u++) if (s.used.has(u)) return false; return true; };
  const firstFree = (s: RackState, h: number, prefer?: number) => { if (prefer && fitsAt(s, prefer, h)) return prefer; for (let u = 1; u + h - 1 <= s.rb.rack.heightU; u++) if (fitsAt(s, u, h)) return u; return undefined; };
  const out: NewUnit[] = [];
  let n = 0;
  for (const m of mapping) {
    if (!m.newModel) continue;
    const devs = m.deviceIds.map(id => byId(data, 'devices', id)!).filter(Boolean).sort((a, b) => (byId(data, 'racks', a.rackId)?.name ?? '').localeCompare(byId(data, 'racks', b.rackId)?.name ?? '') || (a.position ?? 0) - (b.position ?? 0));
    const h = Math.max(1, m.am?.heightU ?? devs[0]?.heightU ?? 1);
    const typ = (m.am?.typicalPowerW ?? 0) / 1000, max = (m.am?.maxPowerW ?? m.am?.typicalPowerW ?? 0) / 1000;
    for (let i = 0; i < devs.length; i += m.ratio) {
      const chunk = devs.slice(i, i + m.ratio); const lead = chunk[0];
      const parallel = chunk.some(parallelOf);
      const home = lead.rackId ? st(lead.rackId) : undefined;
      const rowRacks = home ? (groupBy(data, 'racks', 'rowId').get(home.rb.rack.rowId) ?? []).filter(r => r.id !== home.rb.rack.id && r.status !== 'Retired') : [];
      const hallRacks = home ? (groupBy(data, 'racks', 'hallId').get(home.rb.rack.hallId) ?? []).filter(r => r.rowId !== home.rb.rack.rowId && r.status !== 'Retired' && r.status !== 'Planned') : [];
      // A switch stays in its own rack (its cables end there); servers may move to another rack in the row, then the hall.
      const order = opts.network ? [lead.rackId!].filter(Boolean) : [...new Set([...chunk.map(d => d.rackId!).filter(Boolean), ...rowRacks.map(r => r.id), ...hallRacks.map(r => r.id)])];
      let placed: { s: RackState; u: number } | undefined; let powerShort = false;
      for (const rid of order) {
        const s = st(rid); if (!s) continue;
        const u = firstFree(s, h, rid === lead.rackId && !parallel ? lead.position : undefined); if (!u) continue;
        const powerOk = s.kwEnd + max <= s.limit + 1e-6 && (!parallel || s.kwPeak + max <= s.feedLimit + 1e-6);
        if (!powerOk) { powerShort = true; continue; }
        placed = { s, u }; break;
      }
      const id = `N${++n}`;
      if (placed) { for (let u = placed.u; u < placed.u + h; u++) placed.s.used.add(u); placed.s.kwEnd += max; if (parallel) placed.s.kwPeak += max; }
      const sameRack = placed && placed.s.rb.rack.id === lead.rackId;
      out.push({
        id, mapId: m.id, model: m.newModel, am: m.am, oldIds: chunk.map(d => d.id), rackId: placed?.s.rb.rack.id ?? (opts.network ? lead.rackId : undefined), startU: placed?.u ?? (opts.network ? lead.position : undefined), heightU: h,
        typicalKw: r1(typ), maxKw: r1(max), weightKg: m.am?.weightKg ?? 0, keepIp4: lead.primaryIp4, keepOob: lead.oobIp, keepHostname: opts.network ? lead.hostname ?? lead.name : undefined,
        parallel, placed: !!placed || opts.network,
        note: placed ? (sameRack ? (parallel ? 'free U in the same rack (old one keeps running until cut-over)' : 'in the space the old device frees') : `moved to ${placed.s.rb.rack.name}: ${powerShort ? 'the home rack has no power headroom' : 'no free space in the home rack'}`)
          : opts.network ? 'no free U beside it: swapped in place, the old switch kept cabled on standby for rollback' : powerShort ? 'no rack in the row has the power headroom' : 'no free space in the row or hall',
      });
    }
  }
  return out;
}

/* ================================================================== racks after the swap */
export interface RackRow {
  rack: T.Rack; rb?: RackBaseline; out: T.Device[]; inn: NewUnit[];
  kwBefore: number; kwAfter: number; kwPeakAfter: number; kwOverlap: number; ratingKw: number; feedRatingKw?: number; feedPctAfter?: number;
  uBefore: number; uAfter: number; heightU: number; kgBefore: number; kgAfter: number; maxKg: number;
  overToday: boolean;
  /** Problems after the swap; `warn` when the rack is over its rating today and the plan lowers its load. */
  issues: string[]; level: 'ok' | 'warn' | 'bad'; ok: boolean;
}
/** Every rack that loses or gains equipment: before → after for power (typical and peak), U, weight and feed loading. */
export function rackRows(data: PlannerData, plan: T.PlannerPlan, old: T.Device[], units: NewUnit[]): RackRow[] {
  const ids = [...new Set([...old.map(d => d.rackId!), ...units.map(u => u.rackId!)].filter(Boolean))];
  const amOf = (d: T.Device) => data.assetModels.find(m => m.model === d.model);
  return ids.map(id => byId(data, 'racks', id)).filter((r): r is T.Rack => !!r).map(rack => {
    const rb = rackBaseline(data, rack.id, { excludePlanId: plan.id });
    const out = old.filter(d => d.rackId === rack.id); const inn = units.filter(u => u.rackId === rack.id);
    const kwBefore = rb?.drawKw ?? rack.currentPowerKw;
    const oldKw = out.reduce((a, d) => a + oldW(d, amOf(d)), 0) / 1000;
    const kwAfter = r1(kwBefore - oldKw + inn.reduce((a, u) => a + u.typicalKw, 0));
    const kwPeakAfter = r1(kwBefore - oldKw + inn.reduce((a, u) => a + u.maxKw, 0));
    const kwOverlap = r1(kwBefore + inn.filter(u => u.parallel).reduce((a, u) => a + u.maxKw, 0));
    const ratingKw = rb?.ratingKw ?? rack.maxPowerKw;
    const uBefore = rb?.usedUnits.size ?? rack.usedU;
    const uAfter = uBefore - out.reduce((a, d) => a + Math.max(1, d.heightU ?? 1), 0) + inn.reduce((a, u) => a + u.heightU, 0);
    const kgBefore = rb?.weightKg ?? rack.currentWeightKg;
    const kgAfter = r1(kgBefore - out.reduce((a, d) => a + (d.weightKg ?? amOf(d)?.weightKg ?? 0), 0) + inn.reduce((a, u) => a + u.weightKg, 0));
    const issues: string[] = [];
    const overToday = kwBefore > ratingKw + 1e-6;
    // A rack already over its rating that this plan only relieves is a warning; anything the plan makes worse is a failure.
    const relieves = overToday && kwPeakAfter <= kwBefore + 1e-6 && !inn.some(u => u.parallel);
    if (kwAfter > rack.maxPowerKw + 1e-6) issues.push(`${kwAfter} kW after the swap is over the rack rating of ${rack.maxPowerKw} kW${overToday ? ` (already ${r1(kwBefore)} kW today${relieves ? '; this plan lowers it' : ''})` : ''}`);
    if (rb?.feedRatingKw && kwPeakAfter > rb.feedRatingKw + 1e-6) issues.push(`${kwPeakAfter} kW at peak is over 80% of one feed (${rb.feedRatingKw} kW)`);
    if (rb?.feedRatingKw && kwOverlap > rb.feedRatingKw + 1e-6 && kwOverlap > kwBefore + 1e-6) issues.push(`${kwOverlap} kW while old and new run side by side is over 80% of one feed (${rb.feedRatingKw} kW)`);
    if (uAfter > rack.heightU) issues.push(`${uAfter} U used of ${rack.heightU}`);
    if (rack.maxWeightKg && kgAfter > rack.maxWeightKg) issues.push(`${kgAfter} kg over the ${rack.maxWeightKg} kg limit`);
    if (inn.some(u => !u.placed)) issues.push(`${inn.filter(u => !u.placed).length} new unit(s) have no position`);
    const powerOnly = issues.every(i => /kW/.test(i));
    const level: RackRow['level'] = !issues.length ? 'ok' : relieves && powerOnly ? 'warn' : 'bad';
    return { rack, rb, out, inn, kwBefore: r1(kwBefore), kwAfter, kwPeakAfter, kwOverlap, ratingKw: r1(ratingKw), feedRatingKw: rb?.feedRatingKw, feedPctAfter: rb?.feedRatingKw ? Math.round((kwPeakAfter / (rb.feedRatingKw / 0.8)) * 100) : undefined, uBefore, uAfter, heightU: rack.heightU, kgBefore: r1(kgBefore), kgAfter, maxKg: rack.maxWeightKg, overToday, issues, level, ok: level !== 'bad' };
  });
}

/** Devices whose services are critical (they need a parallel run and a rollback). */
export function criticalDevices(data: PlannerData, deviceIds: string[], downstream = false): { ids: Set<string>; services: T.Service[] } {
  const imp = impactOf(data, { deviceIds, downstream });
  const set = new Set(deviceIds); const ids = new Set<string>(); const services: T.Service[] = [];
  for (const s of imp.services) if (s.service.critical) { services.push(s.service); for (const d of [s.service.deviceId, ...(s.service.pathDeviceIds ?? [])]) if (d && set.has(d)) ids.add(d); }
  // A switch with critical services downstream is critical itself.
  if (downstream && services.length) for (const id of deviceIds) if (!ids.has(id)) { const sub = impactOf(data, { deviceIds: [id], downstream: true }); if (sub.services.some(s => s.service.critical)) ids.add(id); }
  return { ids, services };
}
