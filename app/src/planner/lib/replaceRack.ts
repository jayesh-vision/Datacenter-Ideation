/**
 * Rack replacement — which racks qualify, whether the new rack fits, what the power and outlets
 * look like after the swap, how each rack is swapped and who has to agree.
 */
import type * as T from '../p2b/types';
import { byId, groupBy, type PlannerData } from './plannerData';
import { feedKw, rackBaseline, type RackBaseline } from './site';
import { impactOf } from './impact';
import type { RackReason, SelectionCriteria } from './replaceCore';
import { SWAP_METHODS, SWAP_TEXT, type SwapMethodName } from './replaceText';

const r1 = (n: number) => Math.round(n * 10) / 10;
const GONE = (d: T.Device) => d.lifecycleState === 'Retired' || d.lifecycleState === 'Disposed';

/** Approximate chassis depth by model (vendor datasheets), for the "too shallow" check. */
export const DEVICE_DEPTH_MM: Record<string, number> = {
  'PowerEdge R740': 715, 'PowerEdge R760': 772, 'ProLiant DL380 Gen10': 730, 'ProLiant DL380 Gen11': 745, 'PowerEdge XE9680': 1008, 'DGX H100': 897, 'SYS-821GE GPU SuperServer': 900,
  'FlashArray //X70': 740, 'AFF A400': 640, 'Nexus 3172PQ': 500, 'QFX5100-48S': 520, '7050X3-48YC8': 520, 'QFX5120-48Y': 420, 'Nexus 9336C-FX2': 570, 'Catalyst 9300-48P': 450,
  'ASR 9006': 760, 'MX480': 790, 'PA-5450': 680, 'BIG-IP i7800': 660, 'OM2248 Console Server': 300, 'SuperBlade Chassis': 920,
};
/** Rack height in mm from its U count (44.45 mm per U plus top and base). */
export const rackHeightMm = (u: number) => Math.round(u * 44.45 + 125);
/** Clearance kept behind the deepest device for cables and power strips. */
export const CABLE_CLEARANCE_MM = 150;
const METERED = /geist|metered|switched|rpdu/i;

export interface RackCandidate { rack: T.Rack; rb?: RackBaseline; type?: T.RackType; row?: T.Row; devices: T.Device[]; reasons: RackReason[]; deepestMm: number; deepestModel?: string; usableDepthMm: number; metered: boolean; held?: string }
/** Every rack at the site with the reasons it qualifies for replacement. */
export function rackCandidates(data: PlannerData, plan: T.PlannerPlan, crit: SelectionCriteria): RackCandidate[] {
  return (groupBy(data, 'racks', 'dataCenterId').get(plan.dataCenterId ?? '') ?? []).filter(r => r.status !== 'Retired' && r.status !== 'Planned').map(rack => {
    const rb = rackBaseline(data, rack.id, { excludePlanId: plan.id });
    const devices = (groupBy(data, 'devices', 'rackId').get(rack.id) ?? []).filter(d => !GONE(d));
    const type = byId(data, 'rackTypes', rack.rackTypeId);
    const deep = devices.reduce((a, d) => { const mm = DEVICE_DEPTH_MM[d.model ?? ''] ?? 0; return mm > a.mm ? { mm, model: d.model } : a; }, { mm: 0, model: undefined as string | undefined });
    const usable = rack.mountingDepthMm ?? (rack.outerDepthMm ?? rack.depthMm) - 100;
    const metered = devices.some(d => d.category === 'PDU' && METERED.test(`${d.model} ${d.name}`));
    const reasons: RackReason[] = [];
    if (rb && rb.drawKw > rack.maxPowerKw) reasons.push('over-power');
    if (crit.rackTypes?.length && type && crit.rackTypes.includes(type.model)) reasons.push('old-type');
    if (deep.mm && deep.mm + CABLE_CLEARANCE_MM > usable) reasons.push('shallow');
    if (!metered) reasons.push('unmetered');
    if (crit.damagedRackIds?.includes(rack.id)) reasons.push('damaged');
    const held = rack.plannerPlanId && rack.plannerPlanId !== plan.id ? `Held by plan ${byId(data, 'plannerPlans', rack.plannerPlanId)?.plnId ?? rack.plannerPlanId}` : data.changeRequests.find(c => ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'].includes(c.status) && c.plannerPlanId !== plan.id && (c.affectedResourceIds ?? []).includes(rack.id)) ? 'In an open change' : undefined;
    return { rack, rb, type, row: byId(data, 'rows', rack.rowId), devices, reasons, deepestMm: deep.mm, deepestModel: deep.model, usableDepthMm: usable, metered, held };
  });
}

export interface RackFit { rackId: string; ok: boolean; issues: string[]; warnings: string[]; floorKgSqm: number; floorLimit?: number; heightMm: number; neighbourHeightMm?: number }
/** Physical fit of the new rack type in each old rack's position. */
export function rackFit(data: PlannerData, rackIds: string[], newType?: T.RackType): RackFit[] {
  return rackIds.map(id => {
    const rack = byId(data, 'racks', id); const issues: string[] = []; const warnings: string[] = [];
    if (!rack || !newType) return { rackId: id, ok: false, issues: [!newType ? 'The new rack model is not in the rack type catalogue' : 'Rack not found'], warnings, floorKgSqm: 0, heightMm: 0 };
    const row = byId(data, 'rows', rack.rowId); const hall = byId(data, 'halls', rack.hallId); const floor = byId(data, 'floors', hall?.floorId);
    const neighbours = (groupBy(data, 'racks', 'rowId').get(rack.rowId) ?? []).filter(r => r.id !== rack.id && r.status !== 'Retired');
    const width = newType.outerWidthMm ?? 600; const depth = newType.outerDepthMm ?? 1200;
    const rowWidth = rack.outerWidthMm ?? rack.widthMm;
    if (width !== rowWidth) issues.push(`${width} mm wide in a ${rowWidth} mm position: the row's containment and floor tiles do not line up`);
    const rowDepth = Math.max(0, ...neighbours.map(r => r.outerDepthMm ?? r.depthMm));
    if (row?.containment !== 'None' && rowDepth && depth > rowDepth + 50) warnings.push(`${depth} mm deep against ${rowDepth} mm neighbours: the ${row?.containment?.toLowerCase()} containment doors need adjusting`);
    const heightMm = rackHeightMm(newType.uHeight); const nU = Math.max(0, ...neighbours.map(r => r.heightU)); const nMm = nU ? rackHeightMm(nU) : undefined;
    if (row?.containment !== 'None' && nMm && heightMm > nMm + 20) warnings.push(`${heightMm} mm tall against ${nMm} mm neighbours: check the containment roof clearance (declared from rack height, not surveyed)`);
    const devices = (groupBy(data, 'devices', 'rackId').get(rack.id) ?? []).filter(d => !GONE(d));
    const deepest = Math.max(0, ...devices.map(d => DEVICE_DEPTH_MM[d.model ?? ''] ?? 0));
    const mount = (newType.mountingDepthMm ?? depth - 100);
    if (deepest && deepest + CABLE_CLEARANCE_MM > mount) issues.push(`Deepest device ${deepest} mm needs ${deepest + CABLE_CLEARANCE_MM} mm; the new rack mounts ${mount} mm`);
    const usedU = rackBaseline(data, rack.id)?.usedUnits.size ?? rack.usedU;
    if (usedU > newType.uHeight) issues.push(`${usedU} U of equipment does not fit ${newType.uHeight} U`);
    const kg = (newType.weight ?? 0) + devices.reduce((a, d) => a + (d.weightKg ?? 0), 0);
    const kgSqm = Math.round(kg / ((width / 1000) * (depth / 1000)));
    if (floor?.floorLoadingKgSqm && kgSqm > floor.floorLoadingKgSqm) issues.push(`${kgSqm} kg/m² over the floor's ${floor.floorLoadingKgSqm} kg/m²`);
    return { rackId: id, ok: issues.length === 0, issues, warnings, floorKgSqm: kgSqm, floorLimit: floor?.floorLoadingKgSqm, heightMm, neighbourHeightMm: nMm };
  });
}

/** Smallest catalogue rack that holds the equipment with 20% room to grow, is deep enough and keeps the row width; same height as the row when possible. */
export function recommendRackType(data: PlannerData, rackIds: string[]): { type?: T.RackType; why: string } {
  const racks = rackIds.map(id => byId(data, 'racks', id)).filter((r): r is T.Rack => !!r);
  if (!racks.length) return { why: 'No racks selected' };
  const needU = Math.max(...racks.map(r => rackBaseline(data, r.id)?.usedUnits.size ?? r.usedU)) * 1.2;
  const deepest = Math.max(0, ...racks.flatMap(r => (groupBy(data, 'devices', 'rackId').get(r.id) ?? []).map(d => DEVICE_DEPTH_MM[d.model ?? ''] ?? 0)));
  const width = racks[0].outerWidthMm ?? racks[0].widthMm; const rowU = racks[0].heightU;
  const ok = data.rackTypes.filter(t => t.uHeight >= needU && (t.outerWidthMm ?? 600) === width && (t.mountingDepthMm ?? (t.outerDepthMm ?? 0) - 100) >= deepest + CABLE_CLEARANCE_MM);
  const pick = [...ok].sort((a, b) => Number(b.uHeight === rowU) - Number(a.uHeight === rowU) || a.uHeight - b.uHeight || (a.outerDepthMm ?? 0) - (b.outerDepthMm ?? 0))[0];
  return { type: pick, why: pick ? `${Math.ceil(needU)} U needed with 20% growth, ${deepest} mm deepest device, ${width} mm row${pick.uHeight === rowU ? ', same height as the row (no containment change)' : ''}` : `No catalogue rack holds ${Math.ceil(needU)} U at ${width} mm wide with ${deepest + CABLE_CLEARANCE_MM} mm mounting depth` };
}

export interface OutletPlan { rackId: string; c13: number; c19: number; perSideC13: number; perSideC19: number; haveC13: number; haveC19: number; ok: boolean; ratingBeforeKw: number; ratingAfterKw: number; drawKw: number; feeds: T.PowerFeed[]; detail: string }
/** Power ports per rack against the new strips' outlets (A and B), and the rack rating after the swap. */
export function outletPlan(data: PlannerData, rackIds: string[], o: { replacePdus: boolean; c13PerStrip: number; c19PerStrip: number; stripKw: number }): OutletPlan[] {
  return rackIds.map(id => {
    const rb = rackBaseline(data, id); const rack = rb?.rack;
    const devices = (groupBy(data, 'devices', 'rackId').get(id) ?? []).filter(d => !GONE(d) && d.category !== 'PDU');
    let c13 = 0, c19 = 0;
    for (const d of devices) {
      const ports = (groupBy(data, 'deviceComponents', 'deviceId').get(d.id) ?? []).filter(c => c.kind === 'power-port');
      const big = d.category === 'GPU-Node' || d.category === 'Storage' || d.category === 'Router' || (d.powerDrawW ?? 0) > 1800;
      for (const p of ports) { if (big || /PEM|Feed|LC-PWR/i.test(`${p.name} ${p.label ?? ''}`)) c19++; else c13++; }
      if (!ports.length) c13 += 2;
    }
    const perSideC13 = Math.ceil(c13 / 2), perSideC19 = Math.ceil(c19 / 2);
    const sideKw = rb?.feedRatingKw;
    const ratingAfter = o.replacePdus ? Math.min(o.stripKw, sideKw ?? o.stripKw) : rb?.ratingKw ?? 0;
    const ok = !o.replacePdus || (perSideC13 <= o.c13PerStrip && perSideC19 <= o.c19PerStrip);
    return { rackId: id, c13, c19, perSideC13, perSideC19, haveC13: o.c13PerStrip, haveC19: o.c19PerStrip, ok, ratingBeforeKw: rb?.ratingKw ?? rack?.maxPowerKw ?? 0, ratingAfterKw: r1(ratingAfter), drawKw: rb?.drawKw ?? 0, feeds: rb?.feeds ?? [],
      detail: !o.replacePdus ? 'Existing strips kept' : `${perSideC13} C13 and ${perSideC19} C19 per side against ${o.c13PerStrip} and ${o.c19PerStrip} per strip; ${rb?.feeds.length ? `feeds ${rb.feeds.map(f => `${f.name} ${f.voltage} V ${f.amperage} A ${f.phase === 'Three-phase' ? '3-phase' : '1-phase'} = ${r1(feedKw(f))} kW at 80%`).join(', ')}` : 'no feeds recorded'}` };
  });
}

export type SwapMethod = SwapMethodName;
export { SWAP_METHODS, SWAP_TEXT };
/** Free positions in the same row (planned, empty racks with nothing drawing). */
export function freePositionsInRow(data: PlannerData, rack: T.Rack): T.Rack[] {
  return (groupBy(data, 'racks', 'rowId').get(rack.rowId) ?? []).filter(r => r.id !== rack.id && r.status === 'Planned' && !r.currentPowerKw && !(groupBy(data, 'devices', 'rackId').get(r.id) ?? []).some(d => !GONE(d)));
}
/** Outage per device in hours for a swap method: the whole re-rack for in place, one short move per device otherwise. */
export function outageHours(method: SwapMethod, devices: number, ratePerHour: number): number {
  if (method === 'In place') return Math.round((devices / Math.max(0.5, ratePerHour) + 1) * 10) / 10;
  return method === 'Temporary rack' ? 0.6 : 0.3;
}
export const swapMethodOf = (plan: T.PlannerPlan, rackId: string): SwapMethod => {
  const v = String(plan.params[`swap:${rackId}`] ?? plan.params.swapMethod ?? 'Next free position in the row');
  return (SWAP_METHODS as string[]).includes(v) ? (v as SwapMethod) : 'Next free position in the row';
};

export interface Tenant { key: string; name: string; customer?: T.Customer; rackIds: string[]; serviceIds: string[]; premium: boolean }
/** Rack owners and the customers of services running in the racks: who must agree to the swap. */
export function tenantsOf(data: PlannerData, rackIds: string[]): Tenant[] {
  const m = new Map<string, Tenant>();
  const add = (name: string, customer: T.Customer | undefined, rackId: string, serviceId?: string) => {
    const key = customer?.id ?? name; const t = m.get(key) ?? { key, name: customer?.name ?? name, customer, rackIds: [], serviceIds: [], premium: !!customer?.premium };
    if (!t.rackIds.includes(rackId)) t.rackIds.push(rackId); if (serviceId && !t.serviceIds.includes(serviceId)) t.serviceIds.push(serviceId); m.set(key, t);
  };
  for (const id of rackIds) {
    const rack = byId(data, 'racks', id); if (!rack) continue;
    if (rack.owner) add(rack.owner, data.customers.find(c => c.name === rack.owner), id);
    for (const s of impactOf(data, { rackIds: [id] }).services) add(s.customer?.name ?? s.service.customerRef, s.customer, id, s.service.id);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
/** Consent rows for the tenants, keeping what the plan already recorded. */
export function consentRows(tenants: Tenant[], existing: T.PlannerConsent[] | undefined, noticeDays: number): T.PlannerConsent[] {
  const have = new Map((existing ?? []).map(c => [c.customerRef, c]));
  return tenants.map(t => have.get(t.key) ?? { customerRef: t.key, customerName: t.name, serviceIds: t.serviceIds, noticeDays: t.premium ? Math.max(noticeDays, 60) : noticeDays, status: 'Not sent', accountManager: t.customer?.accountManager });
}
/** Cross-connects that end on devices in the racks (re-patched with the carrier when the rack moves). */
export function crossConnects(data: PlannerData, rackIds: string[]) {
  return impactOf(data, { rackIds }).terminations.filter(t => t.termination.xconnectId || t.circuit);
}
