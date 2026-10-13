/**
 * Migration, consolidation and decommission — read from the source site's own records.
 *
 *  - Inventory: every device, rack, service, circuit, subnet, VLAN, site contract and piece of
 *    plant at the source, each with a disposition (move, retire, dispose, keep, hand back, cease,
 *    re-terminate, release, end). kW and racks are derived from it; nothing is typed by hand.
 *  - Mode: decommission (retire in place) or consolidation into a target site, which must fit
 *    per wave (positions, kW, cooling, leaf ports, IP space) and is reserved on approval.
 *  - How each service moves (lift and shift, replicate and swing, re-platform, retire) drives
 *    its downtime against the cut-over window, the cost lines and the waves.
 *  - Consent per customer, circuits with cease dates and early-termination cost, the IP release
 *    plan, contract notice periods, compliance by mode, a bottom-up cost and a savings case.
 *  - Closure: a checklist computed live and the "Retire site" action.
 */
import type * as T from '../p2b/types';
import type { ScopeCtx, CloseoutCheck } from './scopes/types';
import type { Evaluation, EstimateLine } from './engine';
import type { BomItem } from './outputs';
import { byId, groupBy, type PlannerData } from './plannerData';
import { Allocator, parseCidr, prefixForHosts } from './ipam';
import { pairsOf, validateWaves, composeWaves, phasesFromWaves, type Pair, type WaveCheck, type WaveUnit } from './waves';
import { bench, bv, pnum } from './replaceBench';
import type { RecordChanges, CloseWaveInput } from './replaceClose';
import { clockMs } from '../compat/clock';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 864e5;
const GONE = (d: T.Device) => d.lifecycleState === 'Disposed';
const DATA_BEARING = new Set(['Server', 'GPU-Node', 'Storage']);

export type MigrationMode = 'decommission' | 'consolidation';
export const MODE_LABEL: Record<MigrationMode, string> = { decommission: 'Decommission (retire in place)', consolidation: 'Consolidate into another site' };
export const modeOf = (plan: T.PlannerPlan): MigrationMode => (plan.params.migrationMode === 'consolidation' || plan.params.migrationMode === 'decommission' ? plan.params.migrationMode : plan.peerDataCenterId ? 'consolidation' : 'decommission');

export type Approach = 'Lift and shift' | 'Replicate and swing' | 'Re-platform' | 'Retire';
export const APPROACHES: Approach[] = ['Lift and shift', 'Replicate and swing', 'Re-platform', 'Retire'];
export const APPROACH_TEXT: Record<Approach, string> = {
  'Lift and shift': 'Power down, de-rack, transport and re-rack at the target; the service is down for the move.',
  'Replicate and swing': 'Data replicated to new equipment at the target ahead of time; a short swing in the window. Source kit retired after.',
  'Re-platform': 'Rebuilt on the target platform in advance; traffic moved in the window. Source kit retired after.',
  Retire: 'The service ends at this site; the owner has moved or closed it.',
};

/* ================================================================== inventory */
export type RecordType = T.PlannerDispositionRow['recordType'];
export interface InvItem { key: string; recordType: RecordType; recordId: string; label: string; detail: string; kw: number; u: number; dataBearing: boolean; critical: boolean; status: string; allowed: T.PlannerDisposition[]; def: T.PlannerDisposition; customerRef?: string; rackId?: string }
export interface InvRow extends InvItem { disposition: T.PlannerDisposition; targetRef?: string; waveId?: string; costUsd?: number; notes?: string; fromPlan: boolean }
export const DISPOSITION_LABEL: Record<T.PlannerDisposition, string> = { move: 'Move', retire: 'Retire', dispose: 'Dispose (certified)', keep: 'Keep as spare', 'hand-back': 'Hand back', cease: 'Cease', 're-terminate': 'Re-terminate at target', release: 'Release', end: 'End', renew: 'Renew' };
export const keyOf = (t: RecordType, id: string) => `${t}:${id}`;

/** Everything recorded at the source site. */
export function inventoryOf(data: PlannerData, plan: T.PlannerPlan, mode: MigrationMode): InvItem[] {
  const dc = plan.dataCenterId; if (!dc) return [];
  const out: InvItem[] = [];
  const cons = mode === 'consolidation';
  const services = data.services.filter(s => s.dataCenterId === dc && s.status !== 'Disabled');
  const critDev = new Set(services.filter(s => s.critical).flatMap(s => [s.deviceId, ...(s.pathDeviceIds ?? [])]).filter(Boolean) as string[]);
  for (const d of (groupBy(data, 'devices', 'dataCenterId').get(dc) ?? []).filter(x => !GONE(x))) {
    const live = d.lifecycleState === 'Active' || d.lifecycleState === 'Installed' || d.lifecycleState === 'Maintenance';
    const db = DATA_BEARING.has(String(d.category));
    const def: T.PlannerDisposition = d.lifecycleState === 'Retired' ? 'dispose' : !live ? (cons ? 'move' : 'keep') : cons ? (d.category === 'PDU' || d.category === 'UPS' ? 'retire' : 'move') : db ? 'dispose' : 'retire';
    out.push({ key: keyOf('device', d.id), recordType: 'device', recordId: d.id, label: d.name, detail: `${d.model ?? d.category} · ${d.lifecycleState ?? d.status}${d.rackId ? ` · ${byId(data, 'racks', d.rackId)?.name}` : ' · not racked'}`, kw: live ? (d.powerDrawW ?? 0) / 1000 : 0, u: d.rackId && live ? Math.max(1, d.heightU ?? 1) : 0, dataBearing: db, critical: critDev.has(d.id), status: d.lifecycleState ?? d.status, allowed: ['move', 'retire', 'dispose', 'keep'], def, rackId: d.rackId });
  }
  for (const r of (groupBy(data, 'racks', 'dataCenterId').get(dc) ?? []).filter(x => x.status !== 'Retired')) out.push({ key: keyOf('rack', r.id), recordType: 'rack', recordId: r.id, label: r.name, detail: `${r.heightU} U · ${r.currentPowerKw} kW drawn · ${r.owner}`, kw: 0, u: 0, dataBearing: false, critical: false, status: r.status, allowed: ['retire', 'hand-back', 'move'], def: 'retire' });
  for (const s of services) out.push({ key: keyOf('service', s.id), recordType: 'service', recordId: s.id, label: s.name, detail: `${s.type} · ${byId(data, 'customers', s.customerRef)?.name ?? s.customerRef} · ${s.revenueMonthly.toLocaleString('en-US')} USD a month${s.critical ? ' · critical' : ''}`, kw: 0, u: 0, dataBearing: false, critical: s.critical, status: s.status, allowed: ['move', 'retire'], def: cons ? 'move' : 'retire', customerRef: s.customerRef });
  const circuits = new Map<string, T.Circuit>();
  for (const t of data.circuitTerminations.filter(x => x.dataCenterId === dc)) { const c = byId(data, 'circuits', t.circuitId); if (c && c.status !== 'Decommissioned') circuits.set(c.id, c); }
  for (const c of circuits.values()) out.push({ key: keyOf('circuit', c.id), recordType: 'circuit', recordId: c.id, label: c.cid, detail: `${byId(data, 'providers', c.providerId)?.name ?? c.providerId} · ${(c.monthlyCostUsd ?? 0).toLocaleString('en-US')} USD a month · until ${c.contractEnd?.slice(0, 10) ?? 'no end recorded'}`, kw: 0, u: 0, dataBearing: false, critical: false, status: c.status, allowed: ['cease', 're-terminate'], def: cons ? 're-terminate' : 'cease' });
  for (const s of data.subnets.filter(x => x.dataCenterId === dc && x.status !== 'Container' && x.status !== 'Deprecated')) out.push({ key: keyOf('subnet', s.id), recordType: 'subnet', recordId: s.id, label: s.cidr, detail: `${s.name} · ${s.usedHosts} of ${s.totalHosts} in use`, kw: 0, u: 0, dataBearing: false, critical: false, status: s.status ?? s.state, allowed: ['release', 'move'], def: 'release' });
  for (const v of data.vlans.filter(x => x.dataCenterId === dc && x.status !== 'Unused')) out.push({ key: keyOf('vlan', v.id), recordType: 'vlan', recordId: v.id, label: `VLAN ${v.vlanNumber}`, detail: v.name, kw: 0, u: 0, dataBearing: false, critical: false, status: v.status, allowed: ['release', 'move'], def: 'release' });
  for (const c of data.contracts.filter(x => x.dataCenterId === dc && x.status === 'Active')) out.push({ key: keyOf('contract', c.id), recordType: 'contract', recordId: c.id, label: `${c.type} ${c.ctrId}`, detail: `${byId(data, 'vendors', c.vendorId)?.name ?? c.vendorId} · until ${c.endDate.slice(0, 10)} · ${c.noticeDays ?? '—'} days notice`, kw: 0, u: 0, dataBearing: false, critical: false, status: c.status, allowed: ['end', 'renew'], def: 'end' });
  const zones = new Set((groupBy(data, 'coolingZones', 'dataCenterId').get(dc) ?? []).map(z => z.id));
  const plant = (id: string, label: string, detail: string, def: T.PlannerDisposition) => out.push({ key: keyOf('plant', id), recordType: 'plant', recordId: id, label, detail, kw: 0, u: 0, dataBearing: false, critical: false, status: 'In service', allowed: ['retire', 'dispose', 'hand-back', 'move', 'cease'], def });
  for (const u of groupBy(data, 'upsUnits', 'dataCenterId').get(dc) ?? []) plant(u.id, `UPS ${u.name}`, `${u.capacityKw} kW · batteries are hazardous waste`, 'dispose');
  for (const c of data.cracUnits.filter(x => zones.has(x.coolingZoneId))) plant(c.id, `${c.type} ${c.name}`, `${c.capacityKw} kW${c.type === 'CRAC' ? ' · refrigerant to recover' : ''}`, 'retire');
  for (const g of groupBy(data, 'generators', 'dataCenterId').get(dc) ?? []) plant(g.id, `Generator ${g.name}`, `${g.capacityKw} kW · fuel to remove`, 'retire');
  for (const c of groupBy(data, 'chillers', 'dataCenterId').get(dc) ?? []) plant(c.id, `Chiller ${c.name}`, `${c.capacityKw} kW · refrigerant to recover`, 'retire');
  for (const f of groupBy(data, 'utilityFeeds', 'dataCenterId').get(dc) ?? []) plant(f.id, `Utility feed ${f.name}`, `${f.capacityKw} kW from ${f.provider} · disconnect and final reading`, 'cease');
  return out;
}

/** The inventory with the plan's dispositions (rows saved on the plan win). */
export function inventoryRows(data: PlannerData, plan: T.PlannerPlan): InvRow[] {
  const mode = modeOf(plan);
  const saved = new Map((plan.dispositions ?? []).map(d => [keyOf(d.recordType, d.recordId), d]));
  return inventoryOf(data, plan, mode).map(i => { const s = saved.get(i.key); return { ...i, disposition: s && i.allowed.includes(s.disposition) ? s.disposition : i.def, targetRef: s?.targetRef, waveId: s?.waveId, costUsd: s?.costUsd, notes: s?.notes, fromPlan: !!s }; });
}
export const toDispositions = (rows: InvRow[]): T.PlannerDispositionRow[] => rows.map(r => ({ recordType: r.recordType, recordId: r.recordId, label: r.label, disposition: r.disposition, targetRef: r.targetRef, waveId: r.waveId, costUsd: r.costUsd, notes: r.notes }));

/* ================================================================== analysis */
export interface ServicePlan { service: T.Service; customer?: T.Customer; approach: Approach; downtimeH: number; deviceIds: string[]; critical: boolean }
export interface ConsentRow extends T.PlannerConsent { premium: boolean; firstWave?: string; okForWave: boolean }
export interface CircuitPlan { circuit: T.Circuit; action: 'cease' | 're-terminate'; ceaseDate?: string; monthsLeft: number; penaltyUsd: number; monthlyUsd: number }
export interface ContractPlan { contract: T.Contract; vendor?: T.Vendor; exitDate: string; serveBy?: string; endsBeforeExit: boolean; late: boolean; annualUsd: number; action: T.PlannerDisposition }
export interface PermitNeed { name: string; authority: string; leadWeeks: number; why: string; onPlan: boolean }
export interface TargetFit { waveId: string; waveName: string; cumKw: number; cumRacks: number; positions: number; kwHeadroom: number; coolingHeadroom: number; ok: boolean; issues: string[] }
export interface IpRelease { subnets: T.Subnet[]; vlans: T.VLAN[]; addresses: number; target: { source: string; cidr?: string; parent?: string }[]; warnings: string[] }
export interface MigrationAnalysis {
  ready: boolean; reason?: string; mode: MigrationMode; source?: T.DataCenter; target?: T.DataCenter; distanceKm: number;
  rows: InvRow[]; undecided: InvRow[]; kwLeaving: number; kwMoving: number; racksMoving: number; uMoving: number;
  services: ServicePlan[]; consents: ConsentRow[]; circuits: CircuitPlan[]; contracts: ContractPlan[]; permits: PermitNeed[]; ip: IpRelease; targetFit: TargetFit[];
  pairs: Pair[]; waveCheck: WaveCheck; window: number; rate: number;
  openDecomChanges: T.ChangeRequest[]; bom: Omit<BomItem, 'id' | 'total' | 'partNumber'>[]; savings: EstimateLine[]; exitDate: string;
}

const CACHE = new WeakMap<ScopeCtx, MigrationAnalysis>();
export const migrationOf = (ev: Evaluation): MigrationAnalysis | undefined => (ev.scope.migration as MigrationAnalysis | undefined) ?? (ev.ctx.data ? analyseMigration(ev.ctx) : undefined);
export function analyseMigration(c: ScopeCtx): MigrationAnalysis { const hit = CACHE.get(c); if (hit) return hit; const a = build(c); CACHE.set(c, a); return a; }

const km = (a?: { latitude: number; longitude: number }, b?: { latitude: number; longitude: number }) => {
  if (!a || !b) return 0; const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return r0(2 * R * Math.asin(Math.sqrt(h)));
};
export const approachOf = (plan: T.PlannerPlan, s: T.Service, mode: MigrationMode, disposition: T.PlannerDisposition): Approach => {
  if (disposition === 'retire') return 'Retire';
  const v = plan.params[`approach:${s.id}`];
  if (typeof v === 'string' && (APPROACHES as string[]).includes(v)) return v as Approach;
  return mode === 'decommission' ? 'Retire' : s.critical ? 'Replicate and swing' : 'Lift and shift';
};

function build(c: ScopeCtx): MigrationAnalysis {
  const plan = c.plan; const data = c.data; const P = c.params; const mode = modeOf(plan);
  const empty: MigrationAnalysis = { ready: false, mode, distanceKm: 0, rows: [], undecided: [], kwLeaving: 0, kwMoving: 0, racksMoving: 0, uMoving: 0, services: [], consents: [], circuits: [], contracts: [], permits: [], ip: { subnets: [], vlans: [], addresses: 0, target: [], warnings: [] }, targetFit: [], pairs: [], waveCheck: { issues: [], byWave: new Map(), unassigned: [], duplicated: [], clashes: new Map() }, window: 6, rate: 4, openDecomChanges: [], bom: [], savings: [], exitDate: plan.targetGoLive };
  if (!data?.ready) return { ...empty, reason: 'Platform data still loading' };
  const source = byId(data, 'dataCenters', plan.dataCenterId); if (!source) return { ...empty, ready: true, reason: 'No source site' };
  const target = mode === 'consolidation' ? byId(data, 'dataCenters', plan.peerDataCenterId) : undefined;
  const distanceKm = km(source, target);
  const rows = inventoryRows(data, plan);
  const window = Math.max(1, pnum(P, 'cutoverWindowHours', 6)); const rate = Math.max(0.5, pnum(P, 'crewDevicesPerHour', 4));
  const dev = rows.filter(r => r.recordType === 'device');
  const moving = dev.filter(r => r.disposition === 'move');
  const kwLeaving = r1(dev.reduce((s, r) => s + r.kw, 0)); const kwMoving = r1(moving.reduce((s, r) => s + r.kw, 0));
  const uMoving = moving.reduce((s, r) => s + r.u, 0); const racksMoving = uMoving ? Math.ceil(uMoving / 34) : 0;
  // Services and how each one moves.
  const dispo = new Map(rows.map(r => [r.key, r]));
  const services: ServicePlan[] = rows.filter(r => r.recordType === 'service').map(r => {
    const s = byId(data, 'services', r.recordId)!; const ap = approachOf(plan, s, mode, r.disposition);
    const travel = distanceKm / 60;
    const downtimeH = ap === 'Lift and shift' ? r1(bv(c.benchmarks, 'downtime:liftShiftH') + travel) : ap === 'Replicate and swing' ? bv(c.benchmarks, 'downtime:swingH') : ap === 'Re-platform' ? bv(c.benchmarks, 'downtime:replatformH') : 0;
    return { service: s, customer: byId(data, 'customers', s.customerRef), approach: ap, downtimeH, deviceIds: [s.deviceId, ...(s.pathDeviceIds ?? [])].filter((d): d is string => !!d && byId(data, 'devices', d)?.dataCenterId === source.id), critical: s.critical };
  });
  // Waves on the plan.
  const waves = (plan.waves ?? []).filter(w => w.status !== 'Cancelled');
  const pairs = pairsOf(data, dev.filter(r => r.disposition === 'move').map(r => r.recordId));
  const firstWaveOf = (svcIds: string[]) => waves.filter(w => w.serviceIds.some(s => svcIds.includes(s))).map(w => w.windowStart).sort()[0];
  // Consent per customer.
  const byCust = new Map<string, ServicePlan[]>(); for (const sp of services) byCust.set(sp.service.customerRef, [...(byCust.get(sp.service.customerRef) ?? []), sp]);
  const savedC = new Map((plan.consents ?? []).map(x => [x.customerRef, x]));
  const notice = pnum(P, 'customerNoticeDays', 30);
  const consents: ConsentRow[] = [...byCust.entries()].map(([ref, sps]) => {
    const cu = byId(data, 'customers', ref); const s = savedC.get(ref);
    const row: T.PlannerConsent = s ?? { customerRef: ref, customerName: cu?.name ?? ref, serviceIds: sps.map(x => x.service.id), noticeDays: cu?.premium ? Math.max(90, notice) : notice, status: 'Not sent', accountManager: cu?.accountManager };
    const first = firstWaveOf(sps.map(x => x.service.id));
    const ok = row.status === 'Consented' && !!row.notifiedAt && (!first || new Date(first).getTime() >= new Date(row.notifiedAt).getTime() + row.noticeDays * DAY);
    return { ...row, serviceIds: sps.map(x => x.service.id), premium: !!cu?.premium, firstWave: first, okForWave: ok };
  }).sort((a, b) => a.customerName.localeCompare(b.customerName));
  const lastWave = [...waves].sort((a, b) => b.windowEnd.localeCompare(a.windowEnd))[0];
  const handback = pnum(P, 'handbackWeeks', 6);
  const exitDate = new Date(new Date(lastWave?.windowEnd ?? plan.targetGoLive).getTime() + handback * 7 * DAY).toISOString();
  // Circuits.
  const circuits: CircuitPlan[] = rows.filter(r => r.recordType === 'circuit').map(r => {
    const ck = byId(data, 'circuits', r.recordId)!; const w = waves.find(x => x.circuitIds?.includes(ck.id)) ?? lastWave;
    const cease = r.disposition === 'cease' ? (w?.windowEnd ?? plan.targetGoLive) : undefined;
    const monthsLeft = cease && ck.contractEnd ? Math.max(0, Math.ceil((new Date(ck.contractEnd).getTime() - new Date(cease).getTime()) / (30.4 * DAY))) : 0;
    return { circuit: ck, action: r.disposition === 'cease' ? 'cease' : 're-terminate', ceaseDate: cease, monthsLeft, penaltyUsd: r0(monthsLeft * (ck.monthlyCostUsd ?? 0)), monthlyUsd: ck.monthlyCostUsd ?? 0 };
  });
  // Contracts at the site and their notice.
  const contracts: ContractPlan[] = rows.filter(r => r.recordType === 'contract').map(r => {
    const ct = byId(data, 'contracts', r.recordId)!; const ends = new Date(ct.endDate).getTime() <= new Date(exitDate).getTime();
    const serveBy = ct.noticeDays !== undefined ? new Date(new Date(exitDate).getTime() - ct.noticeDays * DAY).toISOString() : undefined;
    const years = Math.max(1, (new Date(ct.endDate).getTime() - new Date(ct.startDate).getTime()) / (365 * DAY));
    return { contract: ct, vendor: byId(data, 'vendors', ct.vendorId), exitDate, serveBy, endsBeforeExit: ends, late: !ends && !!serveBy && new Date(serveBy).getTime() < clockMs() && r.disposition === 'end', annualUsd: r0(ct.annualValue ?? ct.value / years), action: r.disposition };
  });
  // Compliance by mode, from the plant and equipment actually at the site.
  const plantRows = rows.filter(r => r.recordType === 'plant');
  const has = (re: RegExp) => plantRows.some(r => re.test(r.label));
  const onPlan = (re: RegExp) => plan.permits.some(p => re.test(p.name));
  const permits: PermitNeed[] = [];
  const need = (name: string, authority: string, leadWeeks: number, why: string, re: RegExp) => permits.push({ name, authority, leadWeeks, why, onPlan: onPlan(re) });
  if (dev.some(r => r.dataBearing && r.disposition !== 'move')) need('Data sanitisation certificates', 'Information security', 4, `${dev.filter(r => r.dataBearing && r.disposition !== 'move').length} data-bearing devices leave service`, /sanitis|disposal cert/i);
  if (has(/^UPS/)) need('Battery hazardous waste consignment', 'Environment agency', 4, 'UPS batteries are hazardous waste', /battery/i);
  if (has(/^CRAC|^Chiller/)) need('F-gas refrigerant recovery record', 'Environment agency (certified contractor)', 3, 'Cooling units hold refrigerant', /f-gas|refrigerant/i);
  if (has(/^Utility feed/)) need('Utility disconnection and final meter reading', 'Distribution operator', 8, 'The supply is disconnected when the site is retired', /utility|disconnect/i);
  need('Fire system decommission certificate', 'Fire authority', 4, 'Detection and suppression are taken out of service', /fire/i);
  if (contracts.some(x => x.contract.type === 'Lease') || pnum(P, 'leaseUsdPerM2Year', 0) > 0) need('Landlord notice and handback (schedule of condition)', 'Landlord', Math.max(12, ...contracts.filter(x => x.contract.type === 'Lease').map(x => Math.ceil((x.contract.noticeDays ?? 90) / 7))), 'The space is handed back in the agreed condition', /landlord|handback/i);
  // IP release plan, and target prefixes from real target subnets.
  const subnets = rows.filter(r => r.recordType === 'subnet').map(r => byId(data, 'subnets', r.recordId)!);
  const vlans = rows.filter(r => r.recordType === 'vlan').map(r => byId(data, 'vlans', r.recordId)!);
  const ipTarget: IpRelease['target'] = []; const ipWarn: string[] = [];
  if (target) {
    const alloc = new Allocator(data, { excludePlanId: plan.id });
    for (const s of subnets.filter(x => dispo.get(keyOf('subnet', x.id))?.disposition === 'move' || services.some(sp => sp.approach !== 'Retire'))) {
      if (!s.usedHosts && !services.length) continue;
      const pre = Math.max(parseCidr(s.cidr) ? Number(s.cidr.split('/')[1]) : 24, prefixForHosts(Math.ceil(s.usedHosts * 1.2)));
      const got = alloc.atSite(target.id, pre, `${s.name} at ${target.code}`); ipTarget.push({ source: s.cidr, cidr: got.cidr, parent: got.parent?.cidr });
    }
    ipWarn.push(...alloc.warnings);
  }
  const ip: IpRelease = { subnets, vlans, addresses: data.ipAddresses.filter(i => subnets.some(s => s.id === i.subnetId)).length, target: ipTarget, warnings: ipWarn };
  // Target fit per wave (cumulative).
  const peer = c.peerSite; const targetFit: TargetFit[] = [];
  if (target && peer) {
    const positions = peer.halls.reduce((s, h) => s + h.freePositions, 0);
    let cumKw = 0, cumU = 0;
    for (const w of [...waves].sort((a, b) => a.order - b.order)) {
      const mv = w.deviceIds.map(id => dispo.get(keyOf('device', id))).filter((r): r is InvRow => !!r && r.disposition === 'move');
      cumKw += mv.reduce((s, r) => s + r.kw, 0); cumU += mv.reduce((s, r) => s + r.u, 0);
      const cumRacks = cumU ? Math.ceil(cumU / 34) : 0; const issues: string[] = [];
      if (cumRacks > positions) issues.push(`${cumRacks} racks needed, ${positions} free positions`);
      if (cumKw > peer.headroomItKw) issues.push(`${r1(cumKw)} kW against ${peer.headroomItKw} kW headroom (${peer.binding?.label ?? 'site'})`);
      if (peer.cooling.headroomKw && cumKw > peer.cooling.headroomKw) issues.push(`${r1(cumKw)} kW against ${peer.cooling.headroomKw} kW cooling headroom`);
      if (ipWarn.length) issues.push(ipWarn[0]);
      targetFit.push({ waveId: w.id, waveName: w.name, cumKw: r1(cumKw), cumRacks, positions, kwHeadroom: peer.headroomItKw, coolingHeadroom: peer.cooling.headroomKw, ok: !issues.length, issues });
    }
  }
  const waveCheck = validateWaves(data, waves, { dataCenterId: source.id, excludePlanId: plan.id, expected: [...dev.filter(r => r.disposition === 'move' || (r.status !== 'Retired' && r.kw > 0)).map(r => r.recordId), ...services.map(s => s.service.id)], itemsOf: w => [...w.deviceIds, ...w.serviceIds], pairs, ratePerHour: rate, windowHours: window, workOf: w => w.deviceIds.filter(id => dispo.get(keyOf('device', id))?.disposition === 'move').length + w.deviceIds.length * 0.25 });
  const openDecomChanges = data.changeRequests.filter(x => x.dataCenterId === source.id && x.type === 'Decommission' && ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'].includes(x.status));
  const a: MigrationAnalysis = { ready: true, mode, source, target, distanceKm, rows, undecided: rows.filter(r => !r.disposition), kwLeaving, kwMoving, racksMoving, uMoving, services, consents, circuits, contracts, permits, ip, targetFit, pairs, waveCheck, window, rate, openDecomChanges, bom: [], savings: [], exitDate };
  a.bom = bomLines(c, a); a.savings = savingsLines(c, a);
  return a;
}

/* ================================================================== cost and savings */
function bomLines(c: ScopeCtx, a: MigrationAnalysis): MigrationAnalysis['bom'] {
  const B = (m: string) => bv(c.benchmarks, m); const out: MigrationAnalysis['bom'] = [];
  const waves = (c.plan.waves ?? []).filter(w => w.status !== 'Cancelled');
  const dev = a.rows.filter(r => r.recordType === 'device'); const moving = dev.filter(r => r.disposition === 'move');
  if (moving.length) {
    out.push({ kind: 'move', category: 'Racks and containment', item: 'Move services', spec: 'De-rack, pack, re-rack and re-cable per device', qty: moving.length, unit: 'device', unitCost: B('labour:rerack'), manufacturer: 'NetBuild Corp' });
    if (a.distanceKm) out.push({ kind: 'move', category: 'Racks and containment', item: 'Move services', spec: `Secure transport, ${a.distanceKm} km, per rack-equivalent`, qty: Math.max(1, a.racksMoving), unit: 'rack', unitCost: B('move:transportPerRackKm') * a.distanceKm, manufacturer: 'Logistics partner' });
    out.push({ kind: 'move', category: 'Racks and containment', item: 'Move services', spec: 'Vehicle, escort and transit insurance per wave', qty: Math.max(1, waves.filter(w => w.deviceIds.some(id => moving.some(m => m.recordId === id))).length), unit: 'wave', unitCost: B('move:transportBase'), manufacturer: 'Logistics partner' });
    const emptyAtTarget = a.target ? (c.peerSite?.halls.reduce((s, h) => s + h.emptyRackIds.length, 0) ?? 0) : 0;
    const newRacks = Math.max(0, a.racksMoving - emptyAtTarget);
    if (newRacks) { out.push({ kind: 'rack', category: 'Racks and containment', item: 'Rack', spec: `Target racks beyond the ${emptyAtTarget} empty ones at ${a.target?.code}`, qty: newRacks, unit: 'each', unitCost: 3800, leadItem: 'Racks and containment', manufacturer: 'APC', model: 'NetShelter SX 48U' }); out.push({ kind: 'rack-pdu', category: 'Power', item: 'Rack power strips', spec: 'Metered A and B per new target rack', qty: newRacks * 2, unit: 'each', unitCost: 1400, leadItem: 'PDU', manufacturer: 'Vertiv', model: 'Geist rPDU 3-phase' }); }
  }
  const swing = a.services.filter(s => s.approach === 'Replicate and swing').length;
  if (swing) { out.push({ kind: 'install', category: 'Compute and storage', item: 'Installation and integration', spec: 'Replication licences and bandwidth, two months per service', qty: swing * 2, unit: 'service-month', unitCost: B('move:replicationMonthly'), manufacturer: 'Storage vendor' }); out.push({ kind: 'patch', category: 'Network', item: 'Patch and cross-connects', spec: 'Temporary interconnect between the sites during the swing, two months', qty: 2, unit: 'month', unitCost: B('move:tempCircuitMonthly'), manufacturer: 'Carrier', monthly: true }); }
  const replat = a.services.filter(s => s.approach === 'Re-platform').length;
  if (replat) out.push({ kind: 'install', category: 'Compute and storage', item: 'Installation and integration', spec: 'Re-platform engineering per service', qty: replat, unit: 'service', unitCost: B('move:replatformPerService'), manufacturer: 'Application teams' });
  const dispose = dev.filter(r => r.disposition === 'dispose' || r.disposition === 'retire');
  const drives = dispose.filter(r => r.dataBearing).reduce((s, r) => s + B(`drives:${byId(c.data!, 'devices', r.recordId)?.category ?? 'Server'}`), 0);
  if (drives) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Drives wiped to NIST 800-88 or shredded, certificate per serial', qty: drives, unit: 'drive', unitCost: B('disposal:drive'), manufacturer: 'CBRE Data Center Solutions' });
  if (dispose.length) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Collection and recycling per device, chain of custody', qty: dispose.length, unit: 'device', unitCost: B('disposal:device'), manufacturer: 'CBRE Data Center Solutions' });
  const racks = a.rows.filter(r => r.recordType === 'rack' && r.disposition === 'retire').length;
  if (racks) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Empty racks removed and recycled', qty: racks, unit: 'rack', unitCost: B('disposal:rack'), manufacturer: 'CBRE Data Center Solutions' });
  const plant = a.rows.filter(r => r.recordType === 'plant');
  const ups = plant.filter(r => /^UPS/.test(r.label) && r.disposition !== 'move').length; if (ups) out.push({ kind: 'disposal', category: 'Power', item: 'Certified data disposal', spec: 'UPS battery strings removed as hazardous waste', qty: ups, unit: 'UPS', unitCost: B('decom:upsBattery'), manufacturer: 'Battery recycler' });
  const fgas = plant.filter(r => /^CRAC|^Chiller/.test(r.label) && r.disposition !== 'move').length; if (fgas) out.push({ kind: 'disposal', category: 'Cooling', item: 'Certified data disposal', spec: 'Refrigerant recovered by an F-gas certified contractor', qty: fgas, unit: 'unit', unitCost: B('decom:refrigerant'), manufacturer: 'F-gas contractor' });
  const feeds = plant.filter(r => /^Utility feed/.test(r.label) && r.disposition === 'cease').length; if (feeds) out.push({ kind: 'install', category: 'Power', item: 'Installation and integration', spec: 'Utility disconnection and final meter reading', qty: feeds, unit: 'feed', unitCost: B('decom:utility'), manufacturer: 'Distribution operator' });
  out.push({ kind: 'install', category: 'Fire and security', item: 'Installation and integration', spec: 'Fire detection and suppression decommissioned, agent recovered', qty: 1, unit: 'site', unitCost: B('decom:fireSystem'), manufacturer: 'Fire contractor' });
  const area = siteAreaM2(c, a); if (area) out.push({ kind: 'install', category: 'Racks and containment', item: 'Installation and integration', spec: `Make good and handback, about ${area} m²`, qty: area, unit: 'm²', unitCost: B('decom:makeGood'), manufacturer: 'NetBuild Corp' });
  for (const ck of a.circuits.filter(x => x.penaltyUsd > 0)) out.push({ kind: 'patch', category: 'Network', item: 'Patch and cross-connects', spec: `Early termination of ${ck.circuit.cid}: ${ck.monthsLeft} months left at ${ck.monthlyUsd.toLocaleString('en-US')} USD`, qty: 1, unit: 'circuit', unitCost: ck.penaltyUsd, manufacturer: byId(c.data!, 'providers', ck.circuit.providerId)?.name ?? 'Carrier' });
  const reterm = a.circuits.filter(x => x.action === 're-terminate').length; if (reterm) out.push({ kind: 'patch', category: 'Network', item: 'Patch and cross-connects', spec: `Re-terminate circuits at ${a.target?.code ?? 'the target'} (carrier install)`, qty: reterm, unit: 'circuit', unitCost: B('labour:xconnect-repatch') * 4, manufacturer: 'Carrier' });
  return out;
}
/** White space of the source site: hall areas where recorded, else racks × 2.6 m² × 2.4 support ratio. */
export function siteAreaM2(c: ScopeCtx, a: MigrationAnalysis): number {
  const halls = c.data ? (groupBy(c.data, 'halls', 'dataCenterId').get(a.source?.id ?? '') ?? []) : [];
  const area = halls.reduce((s, h) => s + (h.areaSqm ?? 0), 0);
  return r0(area || (c.site?.racks ?? 0) * 2.6 * 2.4);
}
function savingsLines(c: ScopeCtx, a: MigrationAnalysis): EstimateLine[] {
  const P = c.params; const out: EstimateLine[] = [];
  const tariff = pnum(P, 'tariffUsdPerKwh', c.plan.tariffUsdPerKwh ?? 0.12); const pue = c.site?.pue ?? 1.6;
  const leases = a.contracts.filter(x => x.contract.type === 'Lease' && x.action === 'end');
  if (leases.length) out.push({ category: 'Benefit', item: 'Lease ended', amount: leases.reduce((s, x) => s + x.annualUsd, 0), basis: leases.map(x => `${x.contract.ctrId} ${x.annualUsd.toLocaleString('en-US')} USD a year`).join('; '), source: 'actual' });
  else { const area = siteAreaM2(c, a); const rate = pnum(P, 'leaseUsdPerM2Year', 0); if (rate && area) out.push({ category: 'Benefit', item: 'Space no longer rented', amount: r0(area * rate), basis: `${area} m² × ${rate} USD per m² a year (entered; no lease contract recorded for the site)`, source: 'user' }); }
  const draw = c.site?.itLoadKw ?? a.kwLeaving;
  out.push({ category: 'Benefit', item: 'Energy at the source', amount: r0(draw * pue * 8760 * tariff), basis: `${draw} kW measured × PUE ${pue} × 8,760 h × ${tariff} USD/kWh`, source: 'actual' });
  if (a.mode === 'consolidation' && a.kwMoving) { const tp = c.peerSite?.pue ?? 1.4; out.push({ category: 'Benefit', item: 'Energy at the target for the moved load', amount: -r0(a.kwMoving * tp * 8760 * tariff), basis: `${a.kwMoving} kW × target PUE ${tp} × 8,760 h × ${tariff} USD/kWh`, source: 'benchmark' }); }
  const maint = a.contracts.filter(x => x.contract.type !== 'Lease' && x.action === 'end');
  if (maint.length) out.push({ category: 'Benefit', item: 'Site contracts ended', amount: maint.reduce((s, x) => s + x.annualUsd, 0), basis: maint.map(x => `${x.contract.type} ${x.contract.ctrId}`).join(', '), source: 'actual' });
  const pm = pnum(P, 'siteMaintenanceUsdYear', 0); if (pm) out.push({ category: 'Benefit', item: 'Plant maintenance', amount: pm, basis: 'Entered: plant maintenance at the site per year', source: 'user' });
  const ck = a.circuits.filter(x => x.action === 'cease'); if (ck.length) out.push({ category: 'Benefit', item: 'Circuits ceased', amount: r0(ck.reduce((s, x) => s + x.monthlyUsd, 0) * 12), basis: ck.map(x => `${x.circuit.cid} ${x.monthlyUsd.toLocaleString('en-US')} USD a month`).join('; '), source: 'actual' });
  const fte = pnum(P, 'siteStaffFte', 0); if (fte) { const b = bench(c.benchmarks, 'staffCostFte'); out.push({ category: 'Benefit', item: 'Site staff redeployed', amount: r0(fte * b.value), basis: `${fte} FTE × ${b.value.toLocaleString('en-US')} USD (${b.source})`, source: 'user' }); }
  return out;
}

/* ================================================================== waves */
export function migrationRollback(approach: Approach): string {
  if (approach === 'Replicate and swing') return 'Rollback: swing traffic back to the source copy, which stays live and in sync until the owners accept the target.';
  if (approach === 'Re-platform') return 'Rollback: point traffic back to the source service, which stays running until the owners accept.';
  if (approach === 'Lift and shift') return 'Rollback: if the equipment fails its checks at the target, it is transported back and re-racked in its recorded position; the source rack and its feeds stay live until the wave is accepted.';
  return 'Nothing to roll back: the service has ended at this site.';
}
/** Propose waves: services and their devices by rack, critical ones on their own, the rest of the site retired in a last close-out wave. */
export function proposeMigrationWaves(c: ScopeCtx, a: MigrationAnalysis, now = clockMs()): T.PlannerWave[] {
  const data = c.data; if (!data || !a.ready || !a.source) return c.plan.waves ?? [];
  const keep = (c.plan.waves ?? []).filter(w => w.status === 'Closed' || w.status === 'In progress' || (w.status === 'Scheduled' && !!w.changeRequestId));
  const done = new Set(keep.flatMap(w => [...w.deviceIds, ...w.serviceIds]));
  const dispo = new Map(a.rows.map(r => [r.key, r]));
  const units: WaveUnit[] = []; const placed = new Set<string>();
  for (const sp of [...a.services].sort((x, y) => Number(x.critical) - Number(y.critical) || x.service.name.localeCompare(y.service.name))) {
    if (done.has(sp.service.id)) continue;
    const devs = sp.deviceIds.filter(d => !placed.has(d) && !done.has(d) && dispo.get(keyOf('device', d))); devs.forEach(d => placed.add(d));
    const moves = devs.filter(d => dispo.get(keyOf('device', d))?.disposition === 'move').length;
    units.push({ key: sp.service.id, label: sp.service.name, deviceIds: devs, rackIds: [...new Set(devs.map(d => byId(data, 'devices', d)?.rackId).filter((x): x is string => !!x))], serviceIds: [sp.service.id], work: moves + devs.length * 0.25 + (sp.approach === 'Lift and shift' ? 0 : 0.5), itKw: devs.reduce((s, d) => s + (dispo.get(keyOf('device', d))?.kw ?? 0), 0), method: sp.approach });
  }
  // Remaining live devices without a service (network, PDUs, spares): one or more close-out waves by rack.
  const rest = a.rows.filter(r => r.recordType === 'device' && !placed.has(r.recordId) && !done.has(r.recordId) && (r.disposition === 'move' || (r.status !== 'Retired' && r.kw > 0)));
  const byRack = new Map<string, InvRow[]>(); for (const r of rest) byRack.set(r.rackId ?? '-', [...(byRack.get(r.rackId ?? '-') ?? []), r]);
  for (const [rid, rs] of byRack) units.push({ key: `rest:${rid}`, label: `${byId(data, 'racks', rid)?.name ?? 'Unracked'}: remaining equipment`, deviceIds: rs.map(r => r.recordId), rackIds: rid === '-' ? [] : [rid], work: rs.filter(r => r.disposition === 'move').length + rs.length * 0.25, itKw: rs.reduce((s, r) => s + r.kw, 0), method: a.mode === 'consolidation' ? 'Lift and shift' : 'Retire' });
  const circuits = a.circuits.map(x => x.circuit.id);
  const waves = composeWaves(data, {
    dataCenterId: a.source.id, excludePlanId: c.plan.id, units, pairs: a.pairs, ratePerHour: a.rate, windowHours: a.window, pilot: true, keep, servicesFromUnits: true,
    after: new Date(now + Math.max(14, Math.max(0, ...a.consents.map(x => x.noticeDays))) * DAY).toISOString(), gapDays: 3,
    method: us => [...new Set(us.map(u => u.method))].join(' + '),
    rollback: us => [...new Set(us.map(u => migrationRollback(u.method as Approach)))].join(' '),
    acceptance: us => us.some(u => u.method !== 'Retire') ? 'Service owners confirm the service at the target; monitoring green; source copy kept until sign-off.' : 'Owners confirm the service has ended; equipment powered down and tagged for disposal.',
  });
  if (waves.length) waves[waves.length - 1].circuitIds = circuits;
  return [...keep, ...waves].sort((x, y) => x.order - y.order).map((w, i) => ({ ...w, order: i + 1 }));
}
export function migrationPatch(plan: T.PlannerPlan, a: MigrationAnalysis, waves: T.PlannerWave[]): Partial<T.PlannerPlan> {
  const kw = r0(a.kwLeaving);
  return { waves, designPowerKw: kw, phases: phasesFromWaves(waves, kw), targetGoLive: waves.length ? waves[waves.length - 1].windowEnd : plan.targetGoLive, params: { ...plan.params, racksToMove: a.racksMoving, migrationMode: a.mode } };
}

/* ================================================================== closure */
const CLOSED: T.ChangeRequest['status'][] = ['Implemented', 'Closed'];
/** Close one migration wave: moved equipment and services at the target, retired equipment out of service, circuits ceased. */
export function closeMigrationWave(plan: T.PlannerPlan, waveId: string, data: PlannerData, input: CloseWaveInput): RecordChanges {
  const out: RecordChanges = { creates: [], updates: [], plan: {}, errors: [], warnings: [], summary: [], tasks: [] };
  const upd = (entity: string, id: string, patch: Record<string, unknown>) => out.updates.push({ entity, id, patch: { ...patch, updatedAt: input.at } });
  const w = (plan.waves ?? []).find(x => x.id === waveId);
  if (!w) { out.errors.push(`Wave ${waveId} not found`); return out; }
  if (w.status === 'Closed') { out.errors.push(`${w.name} is already closed`); return out; }
  const atp = w.atpId ? (input.extra?.atps ?? data.atps).find(x => x.id === w.atpId) : undefined;
  if (atp && atp.status !== 'Accepted' && !input.atpAccepted) out.errors.push(`Acceptance test ${atp.id} is ${atp.status}; it must be accepted before the wave closes`);
  const consent = (plan.consents ?? []); const svc = new Set(w.serviceIds);
  const missing = consent.filter(cn => cn.serviceIds.some(s => svc.has(s)) && cn.status !== 'Consented');
  if (missing.length) out.errors.push(`No consent from ${missing.map(m => m.customerName).join(', ')}`);
  if (out.errors.length) return out;
  const rows = new Map(inventoryRows(data, plan).map(r => [r.key, r]));
  const mode = modeOf(plan); const target = plan.peerDataCenterId;
  const certItems: T.DisposalCertificate['items'] = [];
  for (const id of w.deviceIds) {
    const d = byId(data, 'devices', id); const r = rows.get(keyOf('device', id)); if (!d || !r) continue;
    if (r.disposition === 'move' && mode === 'consolidation' && target) upd('devices', id, { dataCenterId: target, rackId: r.targetRef && byId(data, 'racks', r.targetRef) ? r.targetRef : undefined, position: r.targetRef ? d.position : undefined, lifecycleState: r.targetRef ? 'Active' : 'Staged', notes: `Moved from ${byId(data, 'dataCenters', plan.dataCenterId)?.code} under ${plan.plnId} (${w.name})${r.targetRef ? '' : '; waiting for a target rack'}` });
    else if (r.disposition === 'keep') upd('devices', id, { rackId: undefined, position: undefined, dataCenterId: undefined, lifecycleState: 'Staged', notes: `Spare from ${plan.plnId}; to the central depot` });
    else { upd('devices', id, { rackId: undefined, position: undefined, lifecycleState: input.certificateRef || !r.dataBearing ? 'Disposed' : 'Retired', decommissionDate: input.at, status: 'Offline', plannerPlanId: plan.id }); certItems.push({ deviceId: id, serial: d.serial, assetTag: d.assetTag, model: d.model, drives: r.dataBearing ? (d.category === 'Storage' ? 24 : d.category === 'GPU-Node' ? 8 : 4) : 0 }); }
  }
  for (const id of w.serviceIds) { const r = rows.get(keyOf('service', id)); if (!r) continue; if (r.disposition === 'move' && target) upd('services', id, { dataCenterId: target }); else upd('services', id, { status: 'Disabled' }); }
  for (const id of w.circuitIds ?? []) { const r = rows.get(keyOf('circuit', id)); if (!r) continue; if (r.disposition === 'cease') upd('circuits', id, { status: 'Decommissioned', ceaseDate: input.at }); else for (const t of data.circuitTerminations.filter(x => x.circuitId === id && x.dataCenterId === plan.dataCenterId)) upd('circuitTerminations', t.id, { dataCenterId: target, deviceId: undefined, interfaceId: undefined, description: `Re-terminated at ${byId(data, 'dataCenters', target)?.code} under ${plan.plnId}` }); }
  // Racks emptied by the wave are retired.
  const leaving = new Set(w.deviceIds);
  for (const rid of new Set(w.rackIds)) { const left = (groupBy(data, 'devices', 'rackId').get(rid) ?? []).filter(d => !leaving.has(d.id) && d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed'); const r = rows.get(keyOf('rack', rid)); if (!left.length && r && r.disposition !== 'move') upd('racks', rid, { status: 'Retired', currentPowerKw: 0, powerUtilizationPct: 0, usedU: 0, notes: `Emptied and retired under ${plan.plnId} (${w.name})` }); }
  const last = [...(plan.waves ?? [])].filter(x => x.status !== 'Cancelled').sort((x, y) => y.order - x.order)[0]?.id === w.id;
  if (last) {
    for (const r of rows.values()) {
      if (r.recordType === 'subnet' && r.disposition === 'release') upd('subnets', r.recordId, { status: 'Deprecated', state: 'Available', usedHosts: 0, utilizationPct: 0 });
      if (r.recordType === 'vlan' && r.disposition === 'release') upd('vlans', r.recordId, { status: 'Unused' });
      if (r.recordType === 'rack' && r.disposition !== 'move') upd('racks', r.recordId, { status: 'Retired', currentPowerKw: 0, powerUtilizationPct: 0, usedU: 0 });
      if (r.recordType === 'contract' && r.disposition === 'end') upd('contracts', r.recordId, { status: 'Terminated', description: `${byId(data, 'contracts', r.recordId)?.description ?? ''} Notice served under ${plan.plnId}; ends with the site exit.`.trim() });
    }
    out.tasks.push('Record the final meter reading on the plan', 'Hand back the space against the schedule of condition');
  }
  const chg = w.changeRequestId ? byId(data, 'changeRequests', w.changeRequestId) : undefined; if (chg && !CLOSED.includes(chg.status)) upd('changeRequests', chg.id, { status: 'Closed', implementedAt: input.at });
  const mw = w.maintenanceWindowId ? data.maintenanceWindows.find(x => x.id === w.maintenanceWindowId) : undefined; if (mw && mw.status !== 'Completed') upd('maintenanceWindows', mw.id, { status: 'Completed' });
  if (atp && atp.status !== 'Accepted') upd('atps', atp.id, { status: 'Accepted', acceptedAt: input.at, witnessedBy: input.by });
  let certId: string | undefined;
  if (certItems.length) {
    certId = input.idFor?.('disposalCertificates', 'CERT') ?? `CERT-${plan.plnId}-${w.id}`;
    out.creates.push({ entity: 'disposalCertificates', rec: { id: certId, certId, plannerPlanId: plan.id, plannerWaveId: w.id, dataCenterId: plan.dataCenterId, vendorName: 'CBRE Data Center Solutions', method: 'Purge (NIST 800-88)', items: certItems, collectedAt: input.at, issuedAt: input.certificateRef ? input.at : undefined, status: input.certificateRef ? 'Issued' : 'Collected', reference: input.certificateRef, notes: `Chain of custody: sealed and collected at the end of ${w.name}`, createdAt: input.at, updatedAt: input.at, createdBy: input.by, createdById: 'me', customerId: 'CUST-001', isDeleted: false } });
  }
  out.plan = { waves: (plan.waves ?? []).map(x => (x.id === w.id ? { ...x, status: 'Closed' as const, closedAt: input.at, closedBy: input.by, actualDowntimeMin: input.actualDowntimeMin, notes: [x.notes, input.notes].filter(Boolean).join(' · ') || undefined } : x)), artefacts: plan.artefacts ? { ...plan.artefacts, certificateIds: [...(plan.artefacts.certificateIds ?? []), ...(certId ? [certId] : [])] } : plan.artefacts };
  out.summary.push(`${w.deviceIds.length} devices, ${w.serviceIds.length} services${(w.circuitIds ?? []).length ? `, ${(w.circuitIds ?? []).length} circuits` : ''} closed out${last ? '; addresses, racks and contracts released' : ''}`);
  return out;
}

/** Closure checklist of a migration, read live from the platform. */
export function migrationCloseout(plan: T.PlannerPlan, data: PlannerData): CloseoutCheck[] {
  const dc = plan.dataCenterId; const mode = modeOf(plan);
  const waves = (plan.waves ?? []).filter(w => w.status !== 'Cancelled'); const open = waves.filter(w => w.status !== 'Closed');
  const devices = (groupBy(data, 'devices', 'dataCenterId').get(dc ?? '') ?? []).filter(d => d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed' && d.lifecycleState !== 'Staged');
  const racks = (groupBy(data, 'racks', 'dataCenterId').get(dc ?? '') ?? []).filter(r => r.status !== 'Retired');
  const services = data.services.filter(s => s.dataCenterId === dc && s.status !== 'Disabled');
  const circuits = [...new Set(data.circuitTerminations.filter(t => t.dataCenterId === dc).map(t => t.circuitId))].map(id => byId(data, 'circuits', id)).filter((x): x is T.Circuit => !!x && x.status !== 'Decommissioned');
  const subnets = data.subnets.filter(s => s.dataCenterId === dc && s.status !== 'Container' && s.status !== 'Deprecated');
  const vlans = data.vlans.filter(v => v.dataCenterId === dc && v.status !== 'Unused');
  const contracts = data.contracts.filter(c => c.dataCenterId === dc && c.status === 'Active' && new Date(c.endDate).getTime() > clockMs());
  const certs = data.disposalCertificates.filter(c => c.plannerPlanId === plan.id); const pending = certs.filter(c => c.status !== 'Issued');
  const site = byId(data, 'dataCenters', dc);
  return [
    { key: 'waves', label: 'Every wave closed', ok: waves.length > 0 && !open.length, detail: open.length ? `${open.length} of ${waves.length} open: ${open.map(w => w.name).join(', ')}` : `${waves.length} closed` },
    { key: 'devices', label: mode === 'consolidation' ? 'Devices moved or disposed' : 'Devices retired or disposed', ok: !devices.length, detail: devices.length ? `${devices.length} still in service at the site` : 'None left in service' },
    { key: 'racks', label: 'Racks retired', ok: !racks.length, detail: racks.length ? `${racks.length} not retired` : 'All retired' },
    { key: 'services', label: 'Services moved or terminated', ok: !services.length, detail: services.length ? `${services.length} still running at the site` : 'None left' },
    { key: 'circuits', label: 'Circuits ceased or re-terminated', ok: !circuits.length, detail: circuits.length ? circuits.map(c => c.cid).join(', ') : 'None left' },
    { key: 'ip', label: 'Subnets and VLANs released', ok: !subnets.length && !vlans.length, detail: subnets.length || vlans.length ? `${subnets.length} subnets, ${vlans.length} VLANs still in use` : 'Released' },
    { key: 'contracts', label: 'Site contracts ended', ok: !contracts.length, detail: contracts.length ? contracts.map(c => `${c.type} ${c.ctrId}`).join(', ') : 'None active' },
    { key: 'certificates', label: 'Disposal certificates issued', ok: !pending.length, detail: !certs.length ? 'No certificates (nothing disposed)' : pending.length ? `${pending.length} of ${certs.length} waiting` : `${certs.length} issued` },
    { key: 'meter', label: 'Final meter reading recorded', ok: !!plan.params.finalMeterReadingKwh, detail: plan.params.finalMeterReadingKwh ? `${plan.params.finalMeterReadingKwh} kWh` : 'Not recorded' },
    { key: 'site', label: 'Site retired', ok: site?.status === 'Retired', detail: site ? `${site.code} is ${site.status}` : 'Site not found' },
  ];
}
/** The "Retire site" action: allowed only when every other check is green. */
export function retireSite(plan: T.PlannerPlan, data: PlannerData, at: string): RecordChanges {
  const checks = migrationCloseout(plan, data).filter(c => c.key !== 'site');
  const out: RecordChanges = { creates: [], updates: [], plan: {}, errors: checks.filter(c => !c.ok).map(c => `${c.label}: ${c.detail}`), warnings: [], summary: [], tasks: [] };
  if (out.errors.length || !plan.dataCenterId) return out;
  out.updates.push({ entity: 'dataCenters', id: plan.dataCenterId, patch: { status: 'Retired', updatedAt: at } });
  for (const r of (groupBy(data, 'racks', 'dataCenterId').get(plan.dataCenterId) ?? []).filter(x => x.status !== 'Retired')) out.updates.push({ entity: 'racks', id: r.id, patch: { status: 'Retired', updatedAt: at } });
  out.summary.push(`${byId(data, 'dataCenters', plan.dataCenterId)?.code} retired`);
  return out;
}
