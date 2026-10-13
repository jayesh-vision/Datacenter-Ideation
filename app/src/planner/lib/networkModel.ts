/**
 * Network uplift model — DCI / WAN capacity between two sites, or a fabric uplift inside one.
 *
 * DCI / WAN (A and Z both required and carried through everything):
 *  - Existing circuits between A and Z (circuits + terminations + providers): capacity, measured
 *    use, monthly cost, contract end and diversity group, and what the plan does with each (keep,
 *    upgrade, cease) with the early-termination cost when ceased before the contract end.
 *  - Demand: services routed over devices at both ends (bandwidth × (1 + growth)^years) and the
 *    measured use of the current A–Z circuits grown at the plan's rate; "needed at year N", and
 *    the planner's own figure as an override that needs a reason.
 *  - Paths: provider, route, shared-risk groups, link type, capacity, distance and latency, end
 *    devices and free ports at the right speed at both ends, charges and term. Checks: survives
 *    one path lost, carrier/route diversity, latency budget, ports, optics reach, encryption.
 *  - Bill from the link type (carrier services monthly plus install, optics per end per path from
 *    the router vendor, line cards only where no free port, cross-connects at colo ends, dark fibre
 *    and DWDM where owned); IP: /31 per path from the sites' transit pools, BGP sessions.
 *  - Schedule always dated (does not depend on kW): carrier order → LOA/CFA → hand-over →
 *    acceptance → cut-over → cease old.
 * Fabric uplift (one site): the current leaves and spines from the devices, target uplink speed and
 * oversubscription, which switches cannot reach the target, and the optics and switches to buy.
 *
 * Pure functions: no React, no engine or outputs calls (types only).
 */
import type * as T from '../p2b/types';
import type { Estimate, EstimateLine, ParamValue, ScheduleItem, Sourced } from './engine';
import { leadWeeksFor } from './engine';
import { orderState } from './plantModel';
import type { BomItem, IpItem, IpPlan } from './outputs';
import { byId, groupBy, type PlannerData } from './plannerData';
import { intToIp, overlap, parseCidr, contains, type Range } from './ipam';
import { clockMs } from '../compat/clock';

type Params = Record<string, Sourced<ParamValue>>;
type Line = Omit<BomItem, 'id' | 'total' | 'partNumber'>;
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const WEEK = 7 * 864e5;
const num = (p: Params, k: string, d: number) => { const v = p[k]?.value; const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d; };
const str = (p: Params, k: string, d: string) => { const v = p[k]?.value; return v === undefined || v === '' ? d : String(v); };
const gb = (g: number) => (g >= 1000 ? `${r1(g / 1000)} Tbps` : `${r1(g)} Gbps`);

export type NetworkKind = 'dci' | 'fabric';
export const NETWORK_KINDS = ['DCI / WAN between two sites', 'Fabric uplift inside one site'] as const;
export const networkKindOf = (plan: T.PlannerPlan): NetworkKind => (String(plan.params.networkKind ?? NETWORK_KINDS[0]).startsWith('Fabric') ? 'fabric' : 'dci');
export const LINK_TYPES: T.PlannerNetworkPath['linkType'][] = ['Leased wavelength', 'Leased IP transit', 'Dark fibre with owned DWDM', 'ZR optics on dark fibre'];
export const PROTECTION = ['1+1 (full demand on one path)', 'Protected share', 'Unprotected'] as const;
const COLO_TYPES = ['retail-colo', 'wholesale-colo', 'carrier-hotel', 'ixp'];
const DCI_SERVICE_TYPES = ['L2VPN', 'L3VPN', 'Leased Line', 'Backup & DR', 'IRV'];
const LIVE_DEV = (d: T.Device) => d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed';

/* ================================================================== ends */
export interface EndInfo { side: 'A' | 'Z'; dc?: T.DataCenter; colo: boolean; routers: T.Device[]; transitPools: T.Subnet[]; regionId?: string }
export function endInfo(data: PlannerData, dcId: string | undefined, side: 'A' | 'Z'): EndInfo {
  const dc = byId(data, 'dataCenters', dcId);
  if (!dc) return { side, colo: false, routers: [], transitPools: [] };
  const devs = (groupBy(data, 'devices', 'dataCenterId').get(dc.id) ?? []).filter(LIVE_DEV);
  const routers = devs.filter(d => d.category === 'Router' || /(^|-)(core|border|edge|dci|wan)(-|\d|$)/i.test(d.name ?? '')).sort((a, b) => (a.category === 'Router' ? -1 : 1) - (b.category === 'Router' ? -1 : 1) || (a.name ?? '').localeCompare(b.name ?? ''));
  const pools = data.subnets.filter(s => s.dataCenterId === dc.id && s.purpose === 'Transit' && s.status !== 'Container' && !s.plannerPlanId).sort((a, b) => (/transit/i.test(b.name) ? 1 : 0) - (/transit/i.test(a.name) ? 1 : 0) || (a.cidr.startsWith('10.') ? -1 : 1));
  return { side, dc, colo: COLO_TYPES.includes(dc.dcTypeKey ?? ''), routers, transitPools: pools, regionId: byId(data, 'campuses', dc.campusId)?.regionId };
}

/* ================================================================== ports */
export interface PortInfo { id: string; name: string; speedGbps: number }
/** Ports on a device at or above a speed that carry nothing: not cabled, not a live interface with traffic, not a circuit termination. */
export function freePorts(data: PlannerData, deviceId: string | undefined, minGbps: number): PortInfo[] {
  if (!deviceId) return [];
  const comps = (groupBy(data, 'deviceComponents', 'deviceId').get(deviceId) ?? []).filter(c => c.kind === 'interface' && c.enabled !== false && !c.mgmtOnly && (c.speedMbps ?? 0) >= minGbps * 1000);
  const cabled = new Set([...(groupBy(data, 'cables', 'aDeviceId').get(deviceId) ?? []).map(c => c.aComponentId), ...(groupBy(data, 'cables', 'bDeviceId').get(deviceId) ?? []).map(c => c.bComponentId)]);
  const ifs = groupBy(data, 'interfaces', 'deviceId').get(deviceId) ?? [];
  const busy = new Set(ifs.filter(i => i.operStatus === 'Up' && (i.utilizationPct ?? 0) > 0).map(i => i.name));
  const termed = new Set(data.circuitTerminations.filter(t => t.deviceId === deviceId && t.interfaceId).map(t => ifs.find(i => i.id === t.interfaceId)?.name).filter(Boolean) as string[]);
  return comps.filter(c => !cabled.has(c.id) && !busy.has(c.name) && !termed.has(c.name)).map(c => ({ id: c.id, name: c.name, speedGbps: (c.speedMbps ?? 0) / 1000 }));
}

/* ================================================================== existing circuits */
export type CircuitAction = 'keep' | 'upgrade' | 'cease' | 'undecided';
export interface ExistingCircuit {
  circuit: T.Circuit; provider?: T.Provider; aTerm?: T.CircuitTermination; zTerm?: T.CircuitTermination;
  /** True when both terminations are recorded at A and Z; false when the far end is not recorded. */
  farEndKnown: boolean;
  capacityGbps: number; measuredGbps?: number; utilisationPct?: number; monthlyUsd: number; contractEnd?: string;
  action: CircuitAction; replacedByPathId?: string; ceaseDate?: string; etcUsd: number; etcNote: string;
}
const ACTION_OF: Partial<Record<T.PlannerDisposition, CircuitAction>> = { keep: 'keep', renew: 'upgrade', cease: 'cease' };
export const DISPOSITION_OF: Record<Exclude<CircuitAction, 'undecided'>, T.PlannerDisposition> = { keep: 'keep', upgrade: 'renew', cease: 'cease' };

export function existingCircuits(data: PlannerData, plan: T.PlannerPlan, a: EndInfo, z: EndInfo, cutover: string, p: Params): ExistingCircuit[] {
  if (!a.dc) return [];
  const terms = groupBy(data, 'circuitTerminations', 'circuitId');
  const out: ExistingCircuit[] = [];
  for (const c of data.circuits) {
    if (c.status === 'Decommissioned' || c.plannerPlanId === plan.id) continue;
    const ts = terms.get(c.id) ?? [];
    const atA = ts.find(t => t.dataCenterId === a.dc!.id); const atZ = z.dc ? ts.find(t => t.dataCenterId === z.dc!.id && t !== atA) : undefined;
    const other = ts.find(t => t !== atA);
    const between = !!atA && !!atZ;
    // A DCI circuit at A whose far end is not recorded may be the one to this site; list it so the planner can decide.
    const unknownFar = !!atA && !atZ && c.purpose === 'DC Interconnect' && (!other || !other.dataCenterId);
    if (!between && !unknownFar) continue;
    const ifc = atA?.interfaceId ? byId(data, 'interfaces', atA.interfaceId) : undefined;
    const cap = (c.commitRateMbps ?? atA?.portSpeedMbps ?? 0) / 1000;
    const portGbps = Math.min(...[atA?.portSpeedMbps ? atA.portSpeedMbps / 1000 : Infinity, ifc?.speedGbps ?? Infinity, cap || Infinity]);
    const measured = ifc && Number.isFinite(portGbps) ? r1((ifc.utilizationPct / 100) * portGbps) : undefined;
    const disp = (plan.dispositions ?? []).find(d => d.recordType === 'circuit' && d.recordId === c.id);
    const replacedBy = (plan.paths ?? []).find(x => x.replacesCircuitId === c.id);
    const action: CircuitAction = disp ? ACTION_OF[disp.disposition] ?? 'undecided' : replacedBy ? 'upgrade' : 'undecided';
    const soak = num(p, 'ceaseSoakDays', 30);
    const ceaseDate = action === 'cease' || action === 'upgrade' ? (disp?.date ?? new Date(new Date(cutover).getTime() + soak * 864e5).toISOString()) : undefined;
    const monthly = c.monthlyCostUsd ?? 0;
    let etcUsd = 0; let etcNote = 'Kept';
    if (ceaseDate) {
      const months = c.contractEnd ? Math.max(0, Math.ceil((new Date(c.contractEnd).getTime() - new Date(ceaseDate).getTime()) / (30.4 * 864e5))) : 0;
      const sameCarrier = action === 'upgrade' && replacedBy?.providerId && replacedBy.providerId === c.providerId;
      if (!c.contractEnd) etcNote = 'Contract end not recorded; early termination not checked';
      else if (!months) etcNote = `Ceased after the contract end (${new Date(c.contractEnd).toISOString().slice(0, 10)}); no early termination charge`;
      else if (sameCarrier) etcNote = `Upgraded with the same carrier: ${months} months left are normally waived when a higher-value contract replaces it (confirm in the order)`;
      else { etcUsd = r0(months * monthly * num(p, 'earlyTerminationPct', 100) / 100); etcNote = `${months} months left before ${new Date(c.contractEnd).toISOString().slice(0, 10)} × ${monthly.toLocaleString('en-US')} USD × ${num(p, 'earlyTerminationPct', 100)}%`; }
    }
    out.push({ circuit: c, provider: byId(data, 'providers', c.providerId), aTerm: atA, zTerm: atZ, farEndKnown: between, capacityGbps: r1(cap), measuredGbps: measured, utilisationPct: ifc?.utilizationPct, monthlyUsd: monthly, contractEnd: c.contractEnd, action, replacedByPathId: replacedBy?.id, ceaseDate, etcUsd, etcNote });
  }
  return out;
}

/* ================================================================== demand */
export interface DemandResult {
  years: number; growthPct: number;
  services: { service: T.Service; gbps: number; atYearN: number; via: 'both ends' | 'end router' }[];
  servicesGbps: number; servicesAtN: number; measuredGbps: number; measuredAtN: number;
  /** Derived need at year N (the larger of services and measured, never their sum: services ride the measured traffic). */
  derivedAtN: number; declaredGbps?: number; designGbps: number; overridden: boolean; reason?: string; basis: string;
}
export function dciDemand(data: PlannerData, plan: T.PlannerPlan, a: EndInfo, z: EndInfo, circuits: ExistingCircuit[], p: Params): DemandResult {
  const years = num(p, 'demandYears', 3); const g = plan.demand.growthPctPerYear;
  const aIds = new Set((groupBy(data, 'devices', 'dataCenterId').get(a.dc?.id ?? '') ?? []).map(d => d.id));
  const zIds = new Set((groupBy(data, 'devices', 'dataCenterId').get(z.dc?.id ?? '') ?? []).map(d => d.id));
  const ends = new Set([...a.routers, ...z.routers].map(d => d.id));
  const services: DemandResult['services'] = [];
  for (const s of data.services) {
    if (s.status === 'Disabled' || !s.pathDeviceIds?.length) continue;
    const both = s.pathDeviceIds.some(d => aIds.has(d)) && s.pathDeviceIds.some(d => zIds.has(d));
    const viaEnd = !both && DCI_SERVICE_TYPES.includes(s.type) && s.pathDeviceIds.some(d => ends.has(d));
    if (!both && !viaEnd) continue;
    const gbps = (s.bandwidthMbps || 0) / 1000;
    services.push({ service: s, gbps: r1(gbps), atYearN: r1(gbps * (1 + (s.growthPct || 0) / 100) ** years), via: both ? 'both ends' : 'end router' });
  }
  const servicesGbps = r1(services.reduce((x, s) => x + s.gbps, 0)); const servicesAtN = r1(services.reduce((x, s) => x + s.atYearN, 0));
  const measuredGbps = r1(circuits.filter(c => c.farEndKnown || c.action !== 'undecided').reduce((x, c) => x + (c.measuredGbps ?? 0), 0));
  const measuredAtN = r1(measuredGbps * (1 + g / 100) ** years);
  const derivedAtN = r1(Math.max(servicesAtN, measuredAtN));
  const declared = typeof p.dciGbpsRequired?.value === 'number' || (typeof p.dciGbpsRequired?.value === 'string' && p.dciGbpsRequired.value !== '') ? num(p, 'dciGbpsRequired', 0) : undefined;
  const reason = str(p, 'demandOverrideReason', '').trim() || undefined;
  const designGbps = declared && declared > 0 ? declared : derivedAtN;
  const overridden = !!declared && Math.abs(declared - derivedAtN) > Math.max(10, derivedAtN * 0.1);
  const basis = `${services.length} service(s) over the A–Z devices (${gb(servicesGbps)} now, ${gb(servicesAtN)} at year ${years}); measured on current A–Z circuits ${gb(measuredGbps)} now, ${gb(measuredAtN)} at year ${years} at ${g}% a year`;
  return { years, growthPct: g, services, servicesGbps, servicesAtN, measuredGbps, measuredAtN, derivedAtN, declaredGbps: declared, designGbps: r1(designGbps), overridden, reason, basis };
}

/* ================================================================== paths */
export interface Optic { model: string; reachKm: number; unitUsd: number; coherent: boolean }
function opticFor(linkType: T.PlannerNetworkPath['linkType'], gbps: number): Optic {
  if (linkType === 'ZR optics on dark fibre') return gbps > 400 ? { model: '800G ZR (coherent, OSFP)', reachKm: 120, unitUsd: 11000, coherent: true } : { model: '400G ZR (coherent, QSFP-DD)', reachKm: 120, unitUsd: 6500, coherent: true };
  // Leased services and owned DWDM: grey client optics to the carrier demarc or the transponder.
  if (gbps > 400) return { model: '800G 2×FR4 (OSFP)', reachKm: 2, unitUsd: 3200, coherent: false };
  if (gbps > 100) return { model: '400G FR4 (QSFP-DD)', reachKm: 2, unitUsd: 1800, coherent: false };
  if (gbps > 10) return { model: '100G LR4 (QSFP28)', reachKm: 10, unitUsd: 900, coherent: false };
  return { model: '10G LR (SFP+)', reachKm: 10, unitUsd: 120, coherent: false };
}
const LINE_CARD: Record<string, { model: string; usd: number; vendor: string }> = {
  MX480: { model: 'MPC10E-10C (400GE QSFP-DD)', usd: 95000, vendor: 'Juniper Networks' },
  'ASR 9006': { model: 'A9K-4HG-FLEX-SE (4 × 400GE)', usd: 120000, vendor: 'Cisco Systems' },
};
const VENDOR_OF: Record<string, string> = { Juniper: 'Juniper Networks', Cisco: 'Cisco Systems', Arista: 'Arista Networks' };
export const vendorOfDevice = (d?: T.Device) => (d?.manufacturer ? VENDOR_OF[d.manufacturer] ?? d.manufacturer : 'To tender');

const toRad = (x: number) => (x * Math.PI) / 180;
function greatCircleKm(a?: T.DataCenter, z?: T.DataCenter): number | undefined {
  if (a?.latitude === undefined || a?.longitude === undefined || z?.latitude === undefined || z?.longitude === undefined) return undefined;
  const dLat = toRad(z.latitude - a.latitude), dLon = toRad(z.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(z.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
/** Fibre routes run about 30% longer than the great circle. */
export const ROUTE_FACTOR = 1.3;
/** Light in fibre: about 5 µs per km one way. */
export const MS_PER_KM = 0.005;

export interface PortCheck { deviceId?: string; device?: T.Device; port?: string; ok: boolean; free: number; lineCard: boolean; detail: string }
export interface PathResult {
  path: T.PlannerNetworkPath; provider?: T.Provider; distanceKm: number; distanceSource: string; latencyMsRtt: number; latencySource: string;
  subsea: boolean; reachClass: 'metro' | 'regional' | 'long-haul' | 'subsea';
  a: PortCheck; z: PortCheck; optic: Optic; spanKm: number; reachOk: boolean; reachNote: string; encryptionOk: boolean; problems: string[];
}
function portCheck(data: PlannerData, end: EndInfo, deviceId: string | undefined, portName: string | undefined, gbps: number, usedBy: Map<string, number>): PortCheck {
  if (!end.dc) return { ok: false, free: 0, lineCard: false, detail: `${end.side} end not set` };
  if (!deviceId) return { ok: false, free: 0, lineCard: false, detail: `No ${end.side}-end device picked` };
  const device = byId(data, 'devices', deviceId);
  if (!device || device.dataCenterId !== end.dc.id) return { deviceId, ok: false, free: 0, lineCard: false, detail: `${deviceId} is not a device at ${end.dc.name}` };
  const free = freePorts(data, deviceId, gbps); const used = usedBy.get(deviceId) ?? 0; usedBy.set(deviceId, used + 1);
  const left = free.length - used;
  if (portName) { const p = free.find(x => x.name === portName); if (p) return { deviceId, device, port: portName, ok: true, free: left, lineCard: false, detail: `${device.name} ${portName} (${p.speedGbps}G, free)` }; }
  if (left > 0) return { deviceId, device, port: free[used]?.name, ok: true, free: left, lineCard: false, detail: `${device.name}: ${left} free port(s) at ${gbps}G or more${portName ? `; ${portName} is not free, ${free[used]?.name} proposed` : ''}` };
  const card = device.model ? LINE_CARD[device.model] : undefined;
  return { deviceId, device, ok: true, free: 0, lineCard: true, detail: `${device.name}: no free ${gbps}G port; a line card is in the bill (${card?.model ?? 'line card to tender'})` };
}
export function analysePaths(data: PlannerData, plan: T.PlannerPlan, a: EndInfo, z: EndInfo, p: Params): PathResult[] {
  const gc = greatCircleKm(a.dc, z.dc);
  const subsea = !!a.regionId && !!z.regionId && a.regionId !== z.regionId;
  const usedA = new Map<string, number>(), usedZ = new Map<string, number>();
  const demarc = num(p, 'demarcSpanKm', 0.5);
  return (plan.paths ?? []).map(path => {
    const problems: string[] = [];
    const provider = byId(data, 'providers', path.providerId) ?? data.providers.find(x => x.name === path.providerName);
    const distanceKm = r0(path.distanceKm ?? (gc ? gc * ROUTE_FACTOR : 0));
    const distanceSource = path.distanceKm ? 'carrier route length (entered)' : gc ? `great circle ${r0(gc)} km × ${ROUTE_FACTOR} route factor (estimate)` : 'no coordinates; enter the route length';
    const latencyMsRtt = r1(path.latencyMs ?? 2 * distanceKm * MS_PER_KM + 0.5);
    const latencySource = path.latencyMs ? 'carrier quote (entered)' : `estimated: 2 × ${distanceKm} km × 5 µs/km + 0.5 ms equipment`;
    const reachClass: PathResult['reachClass'] = subsea ? 'subsea' : distanceKm >= 1000 ? 'long-haul' : distanceKm >= 100 ? 'regional' : 'metro';
    const aP = portCheck(data, a, path.aDeviceId, path.aPortName, path.capacityGbps, usedA);
    const zP = portCheck(data, z, path.zDeviceId, path.zPortName, path.capacityGbps, usedZ);
    const optic = opticFor(path.linkType, path.capacityGbps);
    let spanKm = demarc; let reachOk = true; let reachNote = `${optic.model} to the ${path.linkType === 'Dark fibre with owned DWDM' ? 'DWDM transponder' : 'carrier demarc'} (${demarc} km in-building, ${optic.reachKm} km reach)`;
    if (path.linkType === 'ZR optics on dark fibre') { spanKm = distanceKm; reachOk = !subsea && distanceKm <= optic.reachKm; reachNote = `${optic.model}: ${optic.reachKm} km unamplified against a ${distanceKm} km span${reachOk ? '' : '; use owned DWDM with amplifiers or lease a wave'}`; }
    if (path.linkType === 'Dark fibre with owned DWDM' && subsea) { reachOk = false; reachNote = 'Dark fibre cannot be bought across an ocean; lease a wavelength or spectrum'; }
    if (path.linkType === 'Dark fibre with owned DWDM' && !subsea && distanceKm > 4000) { reachOk = false; reachNote = `${distanceKm} km is beyond a terrestrial DWDM design without regeneration`; }
    if (!reachOk) problems.push(reachNote);
    const encReq = p.encryptionRequired?.value !== false;
    const encryptionOk = !encReq || (!!path.encryption && path.encryption !== 'None');
    if (!provider && path.linkType !== 'ZR optics on dark fibre') problems.push('No provider');
    if (path.capacityGbps <= 0) problems.push('No capacity');
    if (!aP.ok) problems.push(aP.detail); if (!zP.ok) problems.push(zP.detail);
    return { path, provider, distanceKm, distanceSource, latencyMsRtt, latencySource, subsea, reachClass, a: aP, z: zP, optic, spanKm, reachOk, reachNote, encryptionOk, problems };
  });
}

/* ================================================================== diversity and survivability */
export interface DiversityResult { ok: boolean; shared: string[]; waived: boolean; detail: string }
export function diversity(paths: PathResult[], p: Params): DiversityResult {
  const shared: string[] = [];
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
    const x = paths[i], y = paths[j];
    const px = x.provider?.id ?? x.path.providerName, py = y.provider?.id ?? y.path.providerName;
    if (px && py && px === py) shared.push(`${x.path.name} and ${y.path.name} both use ${x.provider?.name ?? x.path.providerName}`);
    if (x.path.routeId && x.path.routeId === y.path.routeId) shared.push(`${x.path.name} and ${y.path.name} share route ${x.path.routeId}`);
    const srg = x.path.sharedRiskGroups.filter(g => y.path.sharedRiskGroups.map(s => s.toLowerCase()).includes(g.toLowerCase()));
    if (srg.length) shared.push(`${x.path.name} and ${y.path.name} share ${srg.join(', ')}`);
  }
  const waiver = str(p, 'diversityWaiver', '').trim();
  const noRisk = paths.filter(x => !x.path.sharedRiskGroups.length && !x.path.routeId).map(x => x.path.name);
  const detail = shared.length ? shared.join('; ') : paths.length < 2 ? 'Only one path' : `${paths.length} paths on different carriers and routes${noRisk.length ? `; ${noRisk.join(', ')} ha${noRisk.length === 1 ? 's' : 've'} no route or shared-risk groups recorded (declared diverse)` : ''}`;
  return { ok: paths.length >= 2 && !shared.length, shared, waived: !!waiver && shared.length > 0, detail: waiver && shared.length ? `${detail}. Waived: ${waiver}` : detail };
}
export interface Survivability { protectedGbps: number; worstLossGbps: number; remainingGbps: number; ok: boolean; mode: string; detail: string }
export function survivability(paths: PathResult[], kept: ExistingCircuit[], designGbps: number, p: Params): Survivability {
  const mode = str(p, 'protection', PROTECTION[0]);
  const share = mode.startsWith('1+1') ? 100 : mode === 'Unprotected' ? 0 : num(p, 'protectedSharePct', 100);
  const protectedGbps = r1((designGbps * share) / 100);
  const caps = [...paths.map(x => x.path.capacityGbps), ...kept.map(c => c.capacityGbps)];
  const total = caps.reduce((a, x) => a + x, 0); const worst = caps.length ? Math.max(...caps) : 0;
  const remaining = r1(total - worst);
  return { protectedGbps, worstLossGbps: worst, remainingGbps: remaining, ok: share === 0 ? true : remaining >= protectedGbps, mode, detail: share === 0 ? 'Unprotected by choice: a path failure drops traffic above the remaining capacity' : `With the largest path (${gb(worst)}) lost, ${gb(remaining)} remains for ${gb(protectedGbps)} protected (${share}% of ${gb(designGbps)}): (paths − 1) × capacity ≥ protected demand` };
}

/* ================================================================== IP */
export interface PathIp { pathId: string; end: 'link' | 'A' | 'Z'; dataCenterId?: string; poolId?: string; poolCidr?: string; cidr?: string; aAddr?: string; zAddr?: string; v6?: string; bgp: { localAsn: number; peerAsn: number; kind: string } }
export interface DciIp { items: PathIp[]; warnings: string[] }
/** /31 per path from the transit pools (alternating A and Z pools for transparent links; each end's own pool for leased IP), clear of every subnet already in the pool and of other plans. */
export function allocateDciIp(data: PlannerData, plan: T.PlannerPlan, a: EndInfo, z: EndInfo, paths: PathResult[], p: Params): DciIp {
  const warnings: string[] = []; const items: PathIp[] = [];
  const taken: Range[] = data.subnets.filter(s => s.plannerPlanId !== plan.id && s.status !== 'Container').map(s => parseCidr(s.cidr)).filter((r): r is Range => !!r);
  for (const other of data.plannerPlans) if (other.id !== plan.id && other.ipAllocation && ['Approved', 'Executing', 'In review'].includes(other.status)) for (const it of other.ipAllocation.items) { const r = parseCidr(it.cidr); if (r) taken.push(r); }
  const mine: Range[] = [];
  const carve = (end: EndInfo, label: string): { cidr?: string; pool?: T.Subnet; range?: Range } => {
    for (const pool of end.transitPools) {
      const pr = parseCidr(pool.cidr); if (!pr) continue;
      const inside = taken.filter(t => contains(pr, t) && (t.end - t.start) < (pr.end - pr.start));
      for (let s = pr.start; s + 1 <= pr.end; s += 2) {
        const r: Range = { start: s, end: s + 1, cidr: `${intToIp(s)}/31` };
        if (inside.some(t => overlap(t, r)) || mine.some(t => overlap(t, r))) continue;
        mine.push(r); return { cidr: r.cidr, pool, range: r };
      }
    }
    warnings.push(end.dc ? `${end.dc.name} has ${end.transitPools.length ? 'no free /31 in its transit pool' : 'no transit pool in IPAM'} for ${label}` : `${end.side} end not set for ${label}`);
    return {};
  };
  const orgAsn = num(p, 'orgAsn', 64600);
  const rule = str(p, 'dciP2pPool', 'Alternate A and Z');
  const v6Pool = (end: EndInfo) => data.subnets.some(s => s.dataCenterId === end.dc?.id && s.cidr.includes(':'));
  paths.forEach((x, i) => {
    const path = x.path;
    if (path.linkType === 'Leased IP transit') {
      for (const end of [a, z]) {
        const got = carve(end, `${path.name} ${end.side} end`);
        items.push({ pathId: path.id, end: end.side, dataCenterId: end.dc?.id, poolId: got.pool?.id, poolCidr: got.pool?.cidr, cidr: got.cidr, aAddr: got.range ? intToIp(got.range.start) : undefined, zAddr: got.range ? intToIp(got.range.end) : undefined, bgp: { localAsn: orgAsn, peerAsn: x.provider?.asn ?? 0, kind: `eBGP to ${x.provider?.name ?? 'the carrier'}${x.provider?.asn ? ` (AS${x.provider.asn})` : ' (ASN not recorded)'}` } });
      }
    } else {
      const end = rule === 'A end' ? a : rule === 'Z end' ? z : i % 2 === 0 ? a : z;
      const got = carve(end, path.name);
      items.push({ pathId: path.id, end: 'link', dataCenterId: end.dc?.id, poolId: got.pool?.id, poolCidr: got.pool?.cidr, cidr: got.cidr, aAddr: got.range ? intToIp(got.range.start) : undefined, zAddr: got.range ? intToIp(got.range.end) : undefined, bgp: { localAsn: orgAsn, peerAsn: orgAsn, kind: `iBGP between ${a.dc?.code ?? 'A'} and ${z.dc?.code ?? 'Z'} over ${path.name}` } });
    }
  });
  if (!v6Pool(a) || !v6Pool(z)) warnings.push('No IPv6 transit pool in IPAM at both ends; the /127 per path is not allocated');
  return { items, warnings: [...new Set(warnings)] };
}
export function dciIpPlan(ip: DciIp, a: EndInfo, z: EndInfo, paths: PathResult[], p: Params): IpPlan {
  const items: IpItem[] = ip.items.filter(i => i.cidr).map((i, k) => {
    const path = paths.find(x => x.path.id === i.pathId)?.path;
    const at = i.dataCenterId === a.dc?.id ? a.dc?.code : z.dc?.code;
    return { id: `IP${k + 1}`, scope: `${path?.name ?? i.pathId}${i.end === 'link' ? '' : ` · ${i.end} end`}`, purpose: 'Transit', name: `${path?.name ?? i.pathId} ${i.end === 'link' ? 'A–Z link' : `${i.end}-end hand-off`}`, cidr: i.cidr!, prefix: 31, hosts: 2, notes: `From ${at} transit pool ${i.poolCidr}; ${i.end === 'link' ? `${a.dc?.code} ${i.aAddr}, ${z.dc?.code} ${i.zAddr}` : `router ${i.aAddr}, carrier ${i.zAddr}`}; ${i.bgp.kind}` };
  });
  const asnSet = new Map<string, string>();
  asnSet.set('Organisation (local, both ends)', `AS${num(p, 'orgAsn', 64600)}`);
  for (const x of paths) if (x.path.linkType === 'Leased IP transit' && x.provider) asnSet.set(`${x.provider.name} (peer, ${x.path.name})`, x.provider.asn ? `AS${x.provider.asn}` : 'not recorded');
  return { aggregate: [a.transitPools[0]?.cidr, z.transitPools[0]?.cidr].filter(Boolean).join(' and ') || '—', items, vlans: [], asns: [...asnSet.entries()].map(([role, asn]) => ({ role, asn })), usedAddresses: items.length * 2, totalAddresses: [...a.transitPools, ...z.transitPools].slice(0, 2).reduce((s, x) => { const r = parseCidr(x.cidr); return s + (r ? r.end - r.start + 1 : 0); }, 0) };
}

/* ================================================================== fabric */
const FABRIC_MODELS: Record<string, { uplinkGbps: number; downPorts: number; downGbps: number; spinePorts?: number }> = {
  '7050X3-48YC8': { uplinkGbps: 100, downPorts: 48, downGbps: 25 }, 'QFX5120-48Y': { uplinkGbps: 100, downPorts: 48, downGbps: 25 }, 'QFX5100-48S': { uplinkGbps: 40, downPorts: 48, downGbps: 10 },
  'Nexus 3172PQ': { uplinkGbps: 40, downPorts: 48, downGbps: 10 }, 'Catalyst 9300-48P': { uplinkGbps: 25, downPorts: 48, downGbps: 1 }, 'Nexus 9336C-FX2': { uplinkGbps: 100, downPorts: 36, downGbps: 100, spinePorts: 36 },
};
export interface FabricResult {
  leaves: T.Device[]; spines: T.Device[]; targetGbps: number; uplinksPerLeaf: number; targetOversub: number;
  currentUplinkGbps: number; currentUplinks: number; downlinkGbps: number; oversubNow: number; oversubAfter: number;
  leavesToReplace: T.Device[]; spinesToReplace: T.Device[]; spinesNeeded: number; spinePortsAfter: number; uplinkPortsNeeded: number; ok: boolean; notes: string[];
}
export function analyseFabric(data: PlannerData, plan: T.PlannerPlan, p: Params): FabricResult | undefined {
  if (!plan.dataCenterId) return undefined;
  const devs = (groupBy(data, 'devices', 'dataCenterId').get(plan.dataCenterId) ?? []).filter(d => LIVE_DEV(d) && d.category === 'Switch' && !!d.rackId);
  const leaves = devs.filter(d => /leaf|tor/i.test(d.name ?? ''));
  const spines = devs.filter(d => /spine/i.test(d.name ?? ''));
  const targetGbps = num(p, 'fabricTargetGbps', 400); const uplinksPerLeaf = num(p, 'fabricUplinksPerLeaf', 4); const targetOversub = num(p, 'fabricTargetOversub', 3);
  const spec = (d: T.Device) => FABRIC_MODELS[d.model ?? ''];
  const notes: string[] = [];
  const unknown = leaves.filter(l => !spec(l)); if (unknown.length) notes.push(`${unknown.length} leaf model(s) not in the fabric table; treated as needing replacement`);
  const ups = leaves.map(l => { const ifs = (groupBy(data, 'interfaces', 'deviceId').get(l.id) ?? []).filter(i => i.speedGbps >= 40); return { n: ifs.length || 2, g: ifs.length ? Math.max(...ifs.map(i => i.speedGbps)) : spec(l)?.uplinkGbps ?? 0 }; });
  const currentUplinks = ups.length ? r0(ups.reduce((a, x) => a + x.n, 0) / ups.length) : 0;
  const currentUplinkGbps = ups.length ? Math.max(...ups.map(x => x.g)) : 0;
  const downlinkGbps = leaves.length ? r0(leaves.reduce((a, l) => a + (spec(l)?.downPorts ?? 48) * (spec(l)?.downGbps ?? 25), 0) / leaves.length) : 0;
  const oversubNow = currentUplinks && currentUplinkGbps ? r1(downlinkGbps / (currentUplinks * currentUplinkGbps)) : 0;
  const oversubAfter = r1(downlinkGbps / Math.max(1, uplinksPerLeaf * targetGbps));
  const leavesToReplace = leaves.filter(l => (spec(l)?.uplinkGbps ?? 0) < targetGbps);
  const spinesToReplace = spines.filter(s => (spec(s)?.uplinkGbps ?? 0) < targetGbps);
  const uplinkPortsNeeded = leaves.length * uplinksPerLeaf;
  const NEW_SPINE_PORTS = 32;
  const keptSpinePorts = spines.filter(s => !spinesToReplace.includes(s)).reduce((a, s) => a + (spec(s)?.spinePorts ?? spec(s)?.downPorts ?? 32), 0);
  const spinesNeeded = Math.max(spinesToReplace.length ? 2 : 0, Math.ceil(Math.max(0, uplinkPortsNeeded - keptSpinePorts) / NEW_SPINE_PORTS));
  const spinePortsAfter = keptSpinePorts + spinesNeeded * NEW_SPINE_PORTS;
  return { leaves, spines, targetGbps, uplinksPerLeaf, targetOversub, currentUplinkGbps, currentUplinks, downlinkGbps, oversubNow, oversubAfter, leavesToReplace, spinesToReplace, spinesNeeded, spinePortsAfter, uplinkPortsNeeded, ok: oversubAfter <= targetOversub && spinePortsAfter >= uplinkPortsNeeded, notes };
}

/* ================================================================== analysis */
export interface NetworkAnalysis {
  ready: boolean; reason?: string; kind: NetworkKind;
  a: EndInfo; z: EndInfo; cutover: string; ceaseBy?: string;
  circuits: ExistingCircuit[]; demand?: DemandResult; paths: PathResult[]; diversity?: DiversityResult; survivability?: Survivability;
  capacityGbps: number; keptGbps: number; ip?: DciIp; fabric?: FabricResult;
  bill: Line[]; newMonthlyUsd: number; ceasedMonthlyUsd: number; etcUsd: number;
}
export function analyseNetwork(c: { plan: T.PlannerPlan; params: Params; benchmarks: T.PlannerBenchmark[]; data?: PlannerData }): NetworkAnalysis {
  const { plan, params: p } = c; const kind = networkKindOf(plan);
  const empty: NetworkAnalysis = { ready: false, kind, a: { side: 'A', colo: false, routers: [], transitPools: [] }, z: { side: 'Z', colo: false, routers: [], transitPools: [] }, cutover: cutoverOf(plan), circuits: [], paths: [], capacityGbps: 0, keptGbps: 0, bill: [], newMonthlyUsd: 0, ceasedMonthlyUsd: 0, etcUsd: 0 };
  if (!c.data?.ready) return { ...empty, reason: 'Platform data still loading' };
  const data = c.data;
  const a = endInfo(data, plan.dataCenterId, 'A'); const z = endInfo(data, kind === 'dci' ? plan.peerDataCenterId : undefined, 'Z');
  const cutover = cutoverOf(plan);
  if (kind === 'fabric') {
    const fabric = analyseFabric(data, plan, p);
    const an: NetworkAnalysis = { ...empty, ready: !!fabric, reason: fabric ? undefined : 'Pick the site', a, z, cutover, fabric };
    an.bill = fabric ? fabricBill(fabric, plan, a) : [];
    return an;
  }
  const circuits = existingCircuits(data, plan, a, z, cutover, p);
  const paths = analysePaths(data, plan, a, z, p);
  const kept = circuits.filter(x => x.action === 'keep' && x.farEndKnown);
  const demand = dciDemand(data, plan, a, z, circuits, p);
  const an: NetworkAnalysis = {
    ...empty, ready: !!a.dc && !!z.dc, reason: !a.dc || !z.dc ? 'Pick both ends' : undefined, a, z, cutover,
    ceaseBy: circuits.map(x => x.ceaseDate).filter(Boolean).sort()[0],
    circuits, demand, paths, diversity: diversity(paths, p), survivability: survivability(paths, kept, demand.designGbps, p),
    capacityGbps: paths.reduce((s, x) => s + x.path.capacityGbps, 0), keptGbps: kept.reduce((s, x) => s + x.capacityGbps, 0),
  };
  an.ip = allocateDciIp(data, plan, a, z, paths, p);
  an.bill = dciBill(an, plan, p);
  an.newMonthlyUsd = r0(an.bill.filter(l => l.monthly).reduce((s, l) => s + l.unitCost * (l.unit === 'month' ? 1 : l.qty), 0));
  an.ceasedMonthlyUsd = r0(circuits.filter(x => x.action === 'cease' || x.action === 'upgrade').reduce((s, x) => s + x.monthlyUsd, 0));
  an.etcUsd = circuits.reduce((s, x) => s + x.etcUsd, 0);
  return an;
}
export function cutoverOf(plan: T.PlannerPlan): string {
  const ph = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop();
  return ph?.goLive ?? plan.targetGoLive;
}

/* ================================================================== bill */
function dciBill(an: NetworkAnalysis, plan: T.PlannerPlan, p: Params): Line[] {
  const out: Line[] = [];
  const handover = new Date(new Date(an.cutover).getTime() - 3 * WEEK).toISOString();
  const phaseId = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop()?.id;
  const xcNrc = num(p, 'crossConnectNrcUsd', 500), xcMrc = num(p, 'crossConnectMrcUsd', 300);
  const cards = new Set<string>();
  for (const x of an.paths) {
    const path = x.path; const provName = x.provider?.name ?? path.providerName ?? 'Carrier';
    const leased = path.linkType === 'Leased wavelength' || path.linkType === 'Leased IP transit';
    const lead = leased ? `Carrier wave (${x.reachClass === 'subsea' ? 'subsea' : x.reachClass === 'long-haul' ? 'long-haul' : x.reachClass})` : 'Dark fibre (IRU)';
    const term = Math.max(1, path.termMonths || 36);
    const service = leased ? `${path.linkType === 'Leased IP transit' ? 'IP transit' : 'Wavelength'} ${path.capacityGbps}G` : `Dark fibre pair, ${x.distanceKm} km`;
    if (path.installUsd > 0) out.push({ kind: 'dci', category: 'Network', item: `${leased ? 'Carrier installation' : 'Dark fibre installation'} · ${path.name}`, spec: `${provName} ${service}, ${an.a.dc?.code}–${an.z.dc?.code}${path.routeId ? `, route ${path.routeId}` : ''} (one-off charge)`, qty: 1, unit: 'path', unitCost: path.installUsd, leadItem: lead, manufacturer: provName, phaseId, needBy: handover, siteRef: `${an.a.dc?.code}–${an.z.dc?.code}` });
    if (path.monthlyUsd > 0) out.push({ kind: 'dci', category: 'Network', item: `${leased ? 'Carrier service' : 'Dark fibre lease'} · ${path.name}`, spec: `${provName} ${service}, ${path.monthlyUsd.toLocaleString('en-US')} USD a month for ${term} months (commitment, not CapEx)`, qty: term, unit: 'month', unitCost: path.monthlyUsd, leadItem: lead, manufacturer: provName, phaseId, needBy: handover, siteRef: `${an.a.dc?.code}–${an.z.dc?.code}`, monthly: true });
    for (const [end, pc] of [[an.a, x.a], [an.z, x.z]] as const) {
      const vendor = vendorOfDevice(pc.device);
      if (path.linkType === 'Dark fibre with owned DWDM') {
        out.push({ kind: 'dci', category: 'Network', item: `DWDM terminal and coherent transponder · ${end.side} end`, spec: `${path.capacityGbps}G transponder, mux and amplifier at ${end.dc?.code} for ${path.name}`, qty: 1, unit: 'terminal', unitCost: 180000, leadItem: 'DWDM terminal', manufacturer: 'Ciena or Nokia (to tender)', phaseId, needBy: handover, siteRef: end.dc?.code });
      }
      out.push({ kind: 'optics', category: 'Network', item: `Optics · ${path.name} · ${end.side} end`, spec: `${x.optic.model} in ${pc.device?.name ?? 'the end router'}${pc.port ? ` ${pc.port}` : ''}, ${x.optic.coherent ? `${x.optic.reachKm} km coherent` : `${x.optic.reachKm} km client`}`, qty: 1, unit: 'each', unitCost: x.optic.unitUsd, leadItem: x.optic.coherent ? 'Coherent optics (ZR)' : 'Optics (400G)', manufacturer: vendor, model: x.optic.model, phaseId, needBy: handover, siteRef: end.dc?.code });
      if (path.linkType === 'Dark fibre with owned DWDM') out.push({ kind: 'optics', category: 'Network', item: `Client optics to the transponder · ${path.name} · ${end.side} end`, spec: `${x.optic.model}`, qty: 1, unit: 'each', unitCost: x.optic.unitUsd, leadItem: 'Optics (400G)', manufacturer: vendor, phaseId, needBy: handover, siteRef: end.dc?.code });
      if (pc.lineCard && pc.deviceId && !cards.has(pc.deviceId)) {
        cards.add(pc.deviceId); const card = pc.device?.model ? LINE_CARD[pc.device.model] : undefined;
        out.push({ kind: 'optics', category: 'Network', item: `Router line card · ${end.side} end`, spec: `${card?.model ?? `${path.capacityGbps}GE line card`} for ${pc.device?.name ?? pc.deviceId} (no free ${path.capacityGbps}G port)`, qty: 1, unit: 'each', unitCost: card?.usd ?? 100000, leadItem: 'Router line card', manufacturer: card?.vendor ?? vendor, model: card?.model, phaseId, needBy: handover, siteRef: end.dc?.code });
      }
      if (end.colo) {
        out.push({ kind: 'patch', category: 'Cabling', item: `Cross-connect · ${path.name} · ${end.side} end`, spec: `Single-mode cross-connect from our cage to ${provName} in the ${end.dc?.code} meet-me room (LOA/CFA, one-off)`, qty: 1, unit: 'each', unitCost: xcNrc, leadItem: 'Cross-connect', manufacturer: 'Colocation provider', phaseId, needBy: handover, siteRef: end.dc?.code });
        out.push({ kind: 'patch', category: 'Cabling', item: `Cross-connect rental · ${path.name} · ${end.side} end`, spec: `${xcMrc} USD a month for ${term} months`, qty: term, unit: 'month', unitCost: xcMrc, leadItem: 'Cross-connect', manufacturer: 'Colocation provider', phaseId, needBy: handover, siteRef: end.dc?.code, monthly: true });
      } else out.push({ kind: 'patch', category: 'Cabling', item: `Fibre patch to the meet-me room · ${path.name} · ${end.side} end`, spec: `Internal single-mode run from the router to the ${provName} demarc at ${end.dc?.code}`, qty: 1, unit: 'each', unitCost: 350, leadItem: 'Cross-connect', manufacturer: 'NetBuild Corp', phaseId, needBy: handover, siteRef: end.dc?.code });
    }
    if (path.linkType === 'Dark fibre with owned DWDM') { const amps = Math.max(0, Math.ceil(x.distanceKm / 80) - 1); if (amps) out.push({ kind: 'dci', category: 'Network', item: `In-line amplifier sites · ${path.name}`, spec: `${amps} amplifier hut(s) every 80 km over ${x.distanceKm} km (site leases separate)`, qty: amps, unit: 'site', unitCost: 60000, leadItem: 'DWDM terminal', manufacturer: 'Ciena or Nokia (to tender)', phaseId, needBy: handover }); }
  }
  return out;
}
function fabricBill(f: FabricResult, plan: T.PlannerPlan, a: EndInfo): Line[] {
  const out: Line[] = [];
  const need = new Date(new Date(cutoverOf(plan)).getTime() - 2 * WEEK).toISOString();
  const phaseId = [...plan.phases].sort((x, y) => x.goLive.localeCompare(y.goLive)).pop()?.id;
  const speed = f.targetGbps >= 800 ? '800G' : f.targetGbps >= 400 ? '400G' : '100G';
  if (f.leavesToReplace.length) out.push({ kind: 'leaf', category: 'Network', item: 'Leaf switch (replacement)', spec: `${speed}-uplink leaf replacing ${f.leavesToReplace.length} switch(es) whose uplinks stop at ${Math.max(...f.leavesToReplace.map(l => FABRIC_MODELS[l.model ?? '']?.uplinkGbps ?? 0))}G (model to tender, e.g. Arista 7060X5 or Juniper QFX5130)`, qty: f.leavesToReplace.length, unit: 'each', unitCost: f.targetGbps >= 400 ? 45000 : 30000, leadItem: 'Spine / leaf switches', manufacturer: 'To tender', phaseId, needBy: need, siteRef: a.dc?.code });
  if (f.spinesNeeded) out.push({ kind: 'spine', category: 'Network', item: 'Spine switch', spec: `32 × ${speed}, ${f.spinesToReplace.length ? `replacing ${f.spinesToReplace.length} spine(s)` : 'added for uplink ports'}`, qty: f.spinesNeeded, unit: 'each', unitCost: f.targetGbps >= 400 ? 95000 : 52000, leadItem: 'Spine / leaf switches', manufacturer: 'To tender', phaseId, needBy: need, siteRef: a.dc?.code });
  out.push({ kind: 'optics', category: 'Network', item: 'Optics', spec: `${speed} DR4 transceivers, both ends of ${f.uplinkPortsNeeded} leaf uplinks`, qty: f.uplinkPortsNeeded * 2, unit: 'each', unitCost: f.targetGbps >= 400 ? 1200 : 600, leadItem: 'Optics (400G)', manufacturer: 'Switch vendor', phaseId, needBy: need, siteRef: a.dc?.code });
  out.push({ kind: 'fibre', category: 'Cabling', item: 'Fibre trunk', spec: 'MPO-12 single-mode, leaf to spine', qty: f.leaves.length * 2, unit: 'each', unitCost: 1500, leadItem: 'Fibre trunks', manufacturer: 'NetBuild Corp', phaseId, needBy: need, siteRef: a.dc?.code });
  out.push({ kind: 'install', category: 'Network', item: 'Fabric migration services', spec: `Re-cable and cut over ${f.leaves.length} leaves in change windows`, qty: f.leaves.length, unit: 'leaf', unitCost: 900, manufacturer: 'NetBuild Corp', phaseId, needBy: need, siteRef: a.dc?.code });
  return out;
}

/* ================================================================== estimate */
export function networkEstimate(an: NetworkAnalysis, p: Params, generic: Estimate): Estimate {
  const oneOff = an.bill.filter(l => !l.monthly);
  const billTotal = oneOff.reduce((s, l) => s + r0(l.qty) * l.unitCost, 0);
  const contPct = num(p, 'costContingencyPct', 10);
  const capex: EstimateLine[] = [];
  const groups = new Map<string, number>();
  for (const l of oneOff) { const k = l.item.split(' · ')[0]; groups.set(k, (groups.get(k) ?? 0) + r0(l.qty) * l.unitCost); }
  for (const [item, amount] of groups) capex.push({ category: 'CapEx', item, amount, basis: 'bill of materials (one-off lines)', source: 'benchmark' });
  const contingency = r0((billTotal * contPct) / 100);
  if (contingency) capex.push({ category: 'CapEx', item: 'Services and contingency (risk allowance)', amount: contingency, basis: `${contPct}% of the one-off lines`, source: p.costContingencyPct?.source ?? 'template' });
  for (const c of an.circuits.filter(x => x.etcUsd > 0)) capex.push({ category: 'One-off cost', item: `Early termination · ${c.circuit.cid}`, amount: c.etcUsd, basis: c.etcNote, source: 'actual' });
  const capexTotal = billTotal + contingency + an.etcUsd;
  const newMonthly = an.newMonthlyUsd;
  const ceased = an.circuits.filter(x => x.action === 'cease' || x.action === 'upgrade');
  const opex: EstimateLine[] = [];
  for (const l of an.bill.filter(x => x.monthly)) opex.push({ category: 'OpEx', item: l.item, amount: r0(l.unitCost), basis: l.spec, source: 'user' });
  for (const c of ceased) opex.push({ category: 'OpEx', item: `Ceased · ${c.circuit.cid}`, amount: -r0(c.monthlyUsd), basis: `${c.provider?.name ?? 'carrier'} ${c.capacityGbps}G ${c.action === 'upgrade' ? 'upgraded' : 'ceased'} from ${c.ceaseDate?.slice(0, 10)}`, source: 'actual' });
  if (an.fabric) opex.push({ category: 'OpEx', item: 'Support on new switches', amount: r0(an.bill.filter(l => l.kind === 'leaf' || l.kind === 'spine').reduce((s, l) => s + l.qty * l.unitCost, 0) * 0.12 / 12), basis: '12% a year of switch list price', source: 'benchmark' });
  const opexMonthly = opex.reduce((s, l) => s + l.amount, 0);
  const benefitLines: EstimateLine[] = [];
  if (opexMonthly < 0) benefitLines.push({ category: 'Benefit', item: 'Circuit charges saved', amount: r0(-opexMonthly * 12), basis: `${(-opexMonthly).toLocaleString('en-US')} USD a month less than today`, source: 'actual' });
  return {
    ...generic, capex, capexTotal: r0(capexTotal), capexPerKw: 0, capexPerRack: 0, opex, opexMonthly: r0(opexMonthly), opexAnnual: r0(opexMonthly * 12), energyMwhYear: 0,
    revenueAnnual: 0, energyRecoveredAnnual: 0, marginAnnual: r0(-opexMonthly * 12), paybackMonths: null,
    paybackBasis: an.kind === 'dci' ? `OpEx is the change in monthly charges: ${newMonthly.toLocaleString('en-US')} USD new less ${an.ceasedMonthlyUsd.toLocaleString('en-US')} USD ceased` : 'Fabric uplift: capacity, not payback', plantCapexTotal: 0, costPerKwMonth: 0, benchmarkBand: undefined,
    benefitLines, benefitAnnual: benefitLines.reduce((s, l) => s + l.amount, 0), basis: 'bottom-up', contingencyUsd: contingency,
  };
}

/* ================================================================== schedule */
export function networkSchedule(an: NetworkAnalysis, plan: T.PlannerPlan, p: Params, benchmarks: T.PlannerBenchmark[], data: PlannerData | undefined, now = clockMs()): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const bufferPct = num(p, 'contingencyPct', 15);
  const phase = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)).pop();
  const phaseName = phase?.name ?? 'Cut-over'; const phaseId = phase?.id;
  const byLead = new Map<string, Line[]>();
  for (const l of an.bill.filter(x => x.leadItem && !x.monthly)) byLead.set(l.leadItem!, [...(byLead.get(l.leadItem!) ?? []), l]);
  // Monthly-only carrier lines (no install charge) still need ordering.
  for (const l of an.bill.filter(x => x.leadItem && x.monthly && !byLead.has(x.leadItem!))) byLead.set(l.leadItem!, [l]);
  let carrierOrder: number | undefined;
  for (const [lead, ls] of byLead) {
    const lt = leadWeeksFor(lead, benchmarks, bufferPct);
    const needBy = new Date(ls[0].needBy ?? an.cutover).getTime();
    const orderBy = needBy - (lt.leadWeeks + lt.bufferWeeks) * WEEK;
    if (/^Carrier|Dark fibre/.test(lead)) carrierOrder = Math.min(carrierOrder ?? Infinity, orderBy);
    const os = orderState(plan, data, phaseId, orderBy, now);
    items.push({ item: `${lead}: ${[...new Set(ls.map(l => l.item.replace(/ · [AZ] end$/, '')))].join(', ')}`, leadWeeks: lt.leadWeeks, bufferWeeks: lt.bufferWeeks, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), late: os.late, status: os.status, poId: os.poId, phase: phaseName, phaseId, kind: 'equipment', source: 'procure', note: `${lt.leadWeeks} weeks (${lt.source}) + ${lt.bufferWeeks} weeks buffer; ${os.note}` });
  }
  const gate = (item: string, at: number, note?: string) => items.push({ item, leadWeeks: 0, needBy: new Date(at).toISOString(), orderBy: new Date(at).toISOString(), late: false, phase: phaseName, phaseId, kind: 'gate', status: 'gate', note });
  const cut = new Date(an.cutover).getTime();
  if (an.kind === 'dci') {
    if (carrierOrder !== undefined) { gate('Carrier orders placed', carrierOrder); gate('LOA/CFA issued for the cross-connects', carrierOrder + 2 * WEEK, 'Letter of authority from the carrier to the colocation provider'); }
    gate('Circuits handed over by the carriers', cut - 3 * WEEK);
    gate('Acceptance tests passed (BER 24 h, throughput, latency, failover)', cut - 1 * WEEK);
    gate('Traffic cut over', cut, 'In a change window');
    if (an.ceaseBy) gate('Old circuits ceased', new Date(an.ceaseBy).getTime(), 'After a soak period; notice sent per contract');
  } else {
    gate('Design and cut-over plan approved', cut - 8 * WEEK);
    gate('Switches and optics delivered', cut - 2 * WEEK);
    gate('Fabric acceptance (throughput, failover, ECMP)', cut - 1 * WEEK);
    gate('Fabric cut over', cut);
  }
  for (const pm of plan.permits) { const needBy = new Date(pm.neededBefore).getTime(); const orderBy = needBy - pm.leadWeeks * WEEK; items.push({ item: `Permit · ${pm.name}`, leadWeeks: pm.leadWeeks, needBy: pm.neededBefore, orderBy: new Date(orderBy).toISOString(), late: plan.status !== 'Completed' && pm.status === 'Not started' && orderBy < now, phase: phaseName, phaseId, kind: 'permit', status: 'permit' }); }
  return items.sort((x, y) => x.orderBy.localeCompare(y.orderBy));
}

/* ================================================================== acceptance */
export const DCI_ATP_STEPS = (latencyMs: number) => [
  { description: 'Bit error rate over 24 hours', method: 'RFC 2544 / ITU-T Y.1564 test set end to end', expected: 'No errored seconds; BER below 1e-12' },
  { description: 'Throughput at line rate', method: 'Y.1564 service test at 100% of committed rate', expected: 'Full rate with no loss' },
  { description: 'Round-trip latency and jitter', method: 'Ping and test set over 1 hour', expected: `RTT at or below ${latencyMs} ms; jitter within the carrier SLA` },
  { description: 'Optical power budget', method: 'Read optic Rx/Tx at both ends', expected: 'Within the optic and line-system margins' },
  { description: 'Encryption up', method: 'Check MACsec or optical encryption sessions', expected: 'Sessions established with the agreed cipher' },
  { description: 'Failover', method: 'Shut the path; watch BGP and traffic move to the other path', expected: 'Traffic on the remaining paths within the convergence target; no loss of protected traffic' },
];
