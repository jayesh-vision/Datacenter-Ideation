/**
 * Replace family analysis — one evaluation of a server refresh, network refresh or rack
 * replacement against the platform data, shared by the engine hooks (size, estimate, schedule,
 * checks, bill), the wizard panels, the plan pack and execution. Cached per evaluation.
 */
import type * as T from '../p2b/types';
import type { ScopeCtx } from './scopes/types';
import type { Evaluation, EstimateLine, ScheduleItem } from './engine';
import type { BomItem } from './outputs';
import { byId, type PlannerData } from './plannerData';
import { impactOf, type Impact } from './impact';
import { CATALOGUE, priceOf } from './catalogue';
import { pairsOf, sidesOf, validateWaves, type Pair, type WaveCheck } from './waves';
import { affectedRackIds, criticalDevices, effectiveMapping, heldBy, oldDevicesOf, oldW, planUnits, rackRows, ROLE_KIND, type MapRow, type NewUnit, type RackRow, type ReplaceScope } from './replaceCore';
import { networkPortMap, serverNicFit, modelPorts, type NicFit, type PortMap, type PortClass } from './replacePorts';
import { consentRows, crossConnects, freePositionsInRow, outletPlan, rackFit, recommendRackType, swapMethodOf, tenantsOf, type OutletPlan, type RackFit, type SwapMethod, type Tenant } from './replaceRack';
import { bench, bv, pbool, pnum, pstr } from './replaceBench';

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 864e5;
export { PARALLEL } from './replaceText';
import { PARALLEL } from './replaceText';
import { clockMs } from '../compat/clock';

export type BomSpec = Omit<BomItem, 'id' | 'total' | 'partNumber'>;
export interface Supply { model: string; qty: number; stock: number; procure: number; avail: { at: number; source: 'site' | 'depot' | 'transfer' | 'procure'; deviceId?: string }[]; leadWeeks: number; leadItem: string }
export interface WaveNeed { waveId: string; waveName: string; model: string; qty: number; fromStock: number; toBuy: number; needBy: string; orderBy: string; arrives: string; late: boolean; leadWeeks: number; note: string }
export interface Business { energyOldKw: number; energyNewKw: number; energySavedAnnual: number; supportAvoidedAnnual: number; supportNewAnnual: number; licenceDeltaAnnual: number; resaleCredit: number; benefitLines: EstimateLine[]; opexLines: EstimateLine[]; notes: string[] }

export interface ReplaceAnalysis {
  ready: boolean; reason?: string; scope: ReplaceScope; dc?: T.DataCenter;
  old: T.Device[]; rackIds: string[]; mapping: MapRow[]; units: NewUnit[]; rackRows: RackRow[];
  oldKw: number; newKw: number; peakKw: number; deltaKw: number;
  pairs: Pair[]; sides: Map<string, 'A' | 'B'>; impact: Impact; critical: { ids: Set<string>; services: T.Service[] };
  held: { id: string; why: string }[];
  nic?: NicFit; ports?: PortMap;
  rack?: { fit: RackFit[]; newType?: T.RackType; recommend: { type?: T.RackType; why: string }; outlets: OutletPlan[]; tenants: Tenant[]; consents: T.PlannerConsent[]; xconnects: ReturnType<typeof crossConnects>; reservations: T.RackReservation[]; methods: Record<string, SwapMethod>; freePositions: Record<string, T.Rack[]> };
  approach: string; rate: number; windowHours: number; soakDays: number;
  waveCheck: WaveCheck; supply: Supply[]; needs: WaveNeed[]; bom: BomSpec[]; business: Business;
}

const CACHE = new WeakMap<ScopeCtx, ReplaceAnalysis>();
export const replaceOf = (ev: Evaluation): ReplaceAnalysis | undefined => (ev.scope.replace as ReplaceAnalysis | undefined) ?? (ev.ctx.data ? analyseReplace(ev.ctx) : undefined);

/** Lead-time benchmark name for a catalogue kind. */
export const LEAD_ITEM: Record<string, string> = { server: 'General servers', storage: 'General servers', 'gpu-server': 'GPU servers', leaf: 'Spine / leaf switches', spine: 'Spine / leaf switches', core: 'Spine / leaf switches', firewall: 'Spine / leaf switches', rack: 'Racks and containment', 'rack-pdu': 'PDU', optics: 'Optics (400G)' };
const leadWeeks = (c: ScopeCtx, item: string) => { const b = c.benchmarks.find(x => x.metric === `leadWeeks:${item}`); return r0(b?.high ?? b?.value ?? 8); };
const isFree = (d: T.Device) => !d.rackId && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received') && !String(d.notes ?? '').startsWith('Reserved for');

/** When each unit of a model can be at the site: spare at the site, then the depot, then other sites, then a purchase. */
export function supplyFor(c: ScopeCtx, data: PlannerData, model: string, qty: number, kind: string, now: number): Supply {
  const ordered = ['Approved', 'Executing', 'Completed'].includes(c.plan.status);
  const mine = data.devices.filter(d => d.model === model && d.plannerPlanId === c.plan.id && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Ordered' || d.lifecycleState === 'Received'));
  const pool = data.devices.filter(d => d.model === model && isFree(d) && d.plannerPlanId !== c.plan.id);
  const site = pool.filter(d => d.dataCenterId === c.plan.dataCenterId), depot = pool.filter(d => !d.dataCenterId), other = pool.filter(d => d.dataCenterId && d.dataCenterId !== c.plan.dataCenterId);
  const days = (k: string) => bv(c.benchmarks, `transferDays:${k}`);
  const leadItem = LEAD_ITEM[kind] ?? 'General servers'; const lw = leadWeeks(c, leadItem);
  const avail: Supply['avail'] = [
    ...mine.map(d => ({ at: now + (d.lifecycleState === 'Ordered' ? lw * 7 : days('site')) * DAY, source: (d.lifecycleState === 'Ordered' ? 'procure' : 'site') as Supply['avail'][number]['source'], deviceId: d.id })),
    ...site.map(d => ({ at: now + days('site') * DAY, source: 'site' as const, deviceId: d.id })),
    ...depot.map(d => ({ at: now + days('depot') * DAY, source: 'depot' as const, deviceId: d.id })),
    ...other.map(d => ({ at: now + days('transfer') * DAY, source: 'transfer' as const, deviceId: d.id })),
  ].slice(0, qty);
  const stock = avail.filter(a => a.source !== 'procure').length;
  while (avail.length < qty) avail.push({ at: now + (ordered ? Math.max(1, lw / 2) : lw) * 7 * DAY, source: 'procure' });
  return { model, qty, stock, procure: qty - stock, avail, leadWeeks: lw, leadItem };
}

export function analyseReplace(c: ScopeCtx): ReplaceAnalysis {
  const hit = CACHE.get(c); if (hit) return hit;
  const a = build(c); CACHE.set(c, a); return a;
}

function build(c: ScopeCtx): ReplaceAnalysis {
  const scope = c.plan.scope as ReplaceScope; const P = c.params; const plan = c.plan; const data = c.data;
  const rate = Math.max(0.25, pnum(P, 'crewDevicesPerHour', scope === 'network-refresh' ? 2 : scope === 'rack-replace' ? 6 : 4));
  const windowHours = Math.max(1, pnum(P, 'cutoverWindowHours', scope === 'network-refresh' ? 4 : 6));
  const soakDays = pnum(P, 'soakDays', 7);
  const approach = pstr(P, 'migrationApproach', 'Rolling, rack by rack');
  const noImpact: Impact = { deviceIds: [], rackIds: [], downstreamDeviceIds: [], services: [], customers: [], critical: 0, revenueMonthly: 0, minSla: undefined, terminations: [] };
  const empty: ReplaceAnalysis = { ready: false, scope, old: [], rackIds: [], mapping: [], units: [], rackRows: [], oldKw: 0, newKw: 0, peakKw: 0, deltaKw: 0, pairs: [], sides: new Map(), impact: noImpact, critical: { ids: new Set(), services: [] }, held: [], approach, rate, windowHours, soakDays, waveCheck: { issues: [], byWave: new Map(), unassigned: [], duplicated: [], clashes: new Map() }, supply: [], needs: [], bom: [], business: { energyOldKw: 0, energyNewKw: 0, energySavedAnnual: 0, supportAvoidedAnnual: 0, supportNewAnnual: 0, licenceDeltaAnnual: 0, resaleCredit: 0, benefitLines: [], opexLines: [], notes: [] } };
  if (!data || !data.ready) return { ...empty, reason: 'Platform data still loading' };
  const dc = byId(data, 'dataCenters', plan.dataCenterId);
  if (!dc) return { ...empty, ready: true, reason: 'No site selected' };
  const now = clockMs();
  const old = oldDevicesOf(data, plan);
  const rackIds = affectedRackIds(data, plan);
  const network = scope === 'network-refresh';
  const impact = impactOf(data, { deviceIds: old.map(d => d.id), rackIds: scope === 'rack-replace' ? rackIds : undefined, downstream: network });
  const critical = criticalDevices(data, old.map(d => d.id), network);
  // Rack swaps: power strips are replaced, not moved; two halves in one rack only matter when the whole rack goes down at once.
  const allPairs = pairsOf(data, old.filter(d => scope !== 'rack-replace' || d.category !== 'PDU').map(d => d.id));
  const pairs = scope !== 'rack-replace' ? allPairs : allPairs.filter(p => { const ra = byId(data, 'devices', p.a)?.rackId, rb = byId(data, 'devices', p.b)?.rackId; return ra !== rb || swapMethodOf(plan, ra ?? '') === 'In place'; });
  const sides = sidesOf(data, old.map(d => d.id), pairs);
  const held = (scope === 'rack-replace' ? rackIds.map(id => byId(data, 'racks', id)).filter((r): r is T.Rack => !!r).map(r => ({ id: r.id, why: r.plannerPlanId && r.plannerPlanId !== plan.id ? `Held by plan ${byId(data, 'plannerPlans', r.plannerPlanId)?.plnId ?? r.plannerPlanId}` : '' })).filter(x => x.why) : old.map(d => ({ id: d.id, why: heldBy(data, plan, d) ?? '' })).filter(x => x.why));
  const mapping = effectiveMapping(data, plan, old, { replacementModel: pstr(P, 'replacementModel') || undefined, consolidationRatio: pnum(P, 'consolidationRatio', 2), oldEquipment: pstr(P, 'oldEquipment', 'Certified disposal') });
  const units = scope === 'rack-replace' ? [] : planUnits(data, plan, mapping, { parallelAll: approach === PARALLEL, parallelDeviceIds: critical.ids, network });
  const rows = scope === 'rack-replace' ? [] : rackRows(data, plan, old, units);
  const oldKw = r1(old.reduce((s, d) => s + oldW(d, data.assetModels.find(m => m.model === d.model)), 0) / 1000);
  const newKw = scope === 'rack-replace' ? oldKw : r1(units.reduce((s, u) => s + u.typicalKw, 0));
  const peakKw = scope === 'rack-replace' ? oldKw : r1(units.reduce((s, u) => s + u.maxKw, 0));

  let nic: NicFit | undefined; let ports: PortMap | undefined; let rack: ReplaceAnalysis['rack'];
  if (scope === 'server-refresh') nic = serverNicFit(data, old.map(d => d.id), mapping.filter(m => m.newModel).map(m => ({ model: m.newModel, count: m.newUnits })));
  if (network) ports = networkPortMap(data, units.map(u => ({ id: u.oldIds[0], newModel: u.model })), { upgradeUplinks: pbool(P, 'upgradeUplinks', true), reusePct: pnum(P, 'opticsReusePct', 90) });
  if (scope === 'rack-replace') {
    const newType = data.rackTypes.find(t => t.model === pstr(P, 'rackModel', 'NetShelter SX 48U'));
    const methods = Object.fromEntries(rackIds.map(id => [id, swapMethodOf(plan, id)]));
    const tenants = tenantsOf(data, rackIds);
    rack = {
      fit: rackFit(data, rackIds, newType), newType, recommend: recommendRackType(data, rackIds),
      outlets: outletPlan(data, rackIds, { replacePdus: pbool(P, 'replacePdus', true), c13PerStrip: bv(c.benchmarks, 'rackPdu:outletsC13'), c19PerStrip: bv(c.benchmarks, 'rackPdu:outletsC19'), stripKw: bv(c.benchmarks, 'rackPdu:ratingKw') }),
      tenants, consents: consentRows(tenants, plan.consents, pnum(P, 'tenantNoticeDays', 30)), xconnects: crossConnects(data, rackIds),
      reservations: data.rackReservations.filter(r => rackIds.includes(r.rackId) && r.status === 'Active'), methods,
      freePositions: Object.fromEntries(rackIds.map(id => { const r = byId(data, 'racks', id); return [id, r ? freePositionsInRow(data, r) : []]; })),
    };
  }
  // Waves as stored on the plan.
  const waves = plan.waves ?? [];
  const waveCheck = validateWaves(data, waves, {
    dataCenterId: plan.dataCenterId, excludePlanId: plan.id, expected: scope === 'rack-replace' ? rackIds : old.map(d => d.id),
    itemsOf: w => (scope === 'rack-replace' ? w.rackIds : w.deviceIds), pairs, ratePerHour: rate, windowHours,
    workOf: scope === 'rack-replace' ? (w => w.rackIds.reduce((s, id) => s + (old.filter(d => d.rackId === id).length * (rack?.methods[id] === 'Temporary rack' ? 2 : 1)), 0)) : undefined,
    sideAware: network, soakDays, upstream: network,
  });
  // Supply per model, needs per wave.
  const models = scope === 'rack-replace'
    ? [{ model: pstr(P, 'rackModel', 'NetShelter SX 48U'), kind: 'rack', qty: rackIds.length }, ...(pbool(P, 'replacePdus', true) ? [{ model: 'Geist rPDU 3-phase', kind: 'rack-pdu', qty: rackIds.length * 2 }] : [])]
    : mapping.filter(m => m.newModel).map(m => ({ model: m.newModel, kind: ROLE_KIND[m.roleKey] ?? 'server', qty: m.newUnits }));
  const supply = models.map(m => supplyFor(c, data, m.model, m.qty, m.kind, now));
  const staging = bv(c.benchmarks, 'stagingDays');
  const ordered = ['Approved', 'Executing', 'Completed'].includes(plan.status);
  const needs: WaveNeed[] = [];
  const used = new Map<string, number>();
  for (const w of [...waves].filter(x => x.status !== 'Cancelled').sort((x, y) => x.order - y.order)) {
    for (const s of supply) {
      const qty = scope === 'rack-replace' ? (s.model === pstr(P, 'rackModel', 'NetShelter SX 48U') ? w.rackIds.length : w.rackIds.length * 2) : units.filter(u => u.model === s.model && u.oldIds.some(id => w.deviceIds.includes(id))).length;
      if (!qty) continue;
      const k0 = used.get(s.model) ?? 0; used.set(s.model, k0 + qty);
      const slice = s.avail.slice(k0, k0 + qty);
      const arrives = Math.max(...slice.map(x => x.at), now);
      const needBy = new Date(w.windowStart).getTime() - staging * DAY;
      const toBuy = slice.filter(x => x.source === 'procure').length;
      const lw = toBuy ? s.leadWeeks : Math.ceil(Math.max(...slice.map(x => x.at - now), 0) / (7 * DAY));
      const orderBy = needBy - (toBuy ? s.leadWeeks * 7 : Math.ceil((arrives - now) / DAY)) * DAY;
      needs.push({ waveId: w.id, waveName: w.name, model: s.model, qty, fromStock: qty - toBuy, toBuy, needBy: new Date(needBy).toISOString(), orderBy: new Date(orderBy).toISOString(), arrives: new Date(arrives).toISOString(), late: !ordered && w.status !== 'Closed' && arrives > needBy, leadWeeks: lw, note: toBuy ? `${toBuy} bought (${s.leadWeeks} weeks)${qty - toBuy ? `, ${qty - toBuy} from stock` : ''}` : `all ${qty} from stock (${[...new Set(slice.map(x => x.source))].join(', ')})` });
    }
  }
  const a: ReplaceAnalysis = { ready: true, scope, dc, old, rackIds, mapping, units, rackRows: rows, oldKw, newKw, peakKw, deltaKw: r1(newKw - oldKw), pairs, sides, impact, critical, held, nic, ports, rack, approach, rate, windowHours, soakDays, waveCheck, supply, needs, bom: [], business: empty.business };
  a.bom = bomSpecs(c, a);
  a.business = business(c, a);
  return a;
}

/* ================================================================== bill of materials */
function bomSpecs(c: ScopeCtx, a: ReplaceAnalysis): BomSpec[] {
  const P = c.params; const B = (m: string) => bv(c.benchmarks, m); const out: BomSpec[] = [];
  const waves = [...(c.plan.waves ?? [])].filter(w => w.status !== 'Cancelled').sort((x, y) => x.order - y.order);
  const staging = B('stagingDays');
  const needBy = (w?: T.PlannerWave) => (w ? new Date(new Date(w.windowStart).getTime() - staging * DAY).toISOString() : undefined);
  const disposeIds = new Set(a.mapping.filter(m => m.disposition === 'dispose').flatMap(m => m.deviceIds));
  if (a.scope !== 'rack-replace') {
    const cat = a.scope === 'server-refresh' ? 'Compute and storage' as const : 'Network' as const;
    for (const m of a.mapping.filter(x => x.newModel && x.newUnits)) {
      const kind = ROLE_KIND[m.roleKey] ?? 'server'; const opt = CATALOGUE[kind].options.find(o => o.model === m.newModel);
      const groups: { w?: T.PlannerWave; qty: number }[] = waves.length ? waves.map(w => ({ w, qty: a.units.filter(u => u.mapId === m.id && u.oldIds.some(id => w.deviceIds.includes(id))).length })).filter(g => g.qty) : [{ w: undefined, qty: m.newUnits }];
      const placed = groups.reduce((s, g) => s + g.qty, 0);
      if (placed < m.newUnits) groups.push({ w: undefined, qty: m.newUnits - placed });
      for (const g of groups) out.push({ kind, category: cat, item: CATALOGUE[kind].label, spec: `${m.newModel}, replacing ${m.count} × ${m.oldModel} at ${m.ratio}:1${g.w ? ` · ${g.w.name}` : ''}`, qty: g.qty, unit: 'each', unitCost: priceOf(m.newModel) ?? 15000, leadItem: LEAD_ITEM[kind], manufacturer: opt?.manufacturer ?? 'To tender', phaseId: g.w?.id, needBy: needBy(g.w), model: m.newModel });
    }
  }
  if (a.scope === 'server-refresh') {
    const dac = a.units.reduce((s, u) => s + modelPorts(c.data!, u.model).ports.filter(p => !p.mgmt && (p.cls === 'SFP28' || p.cls === 'QSFP28')).length, 0);
    if (dac) out.push({ kind: 'dac', category: 'Cabling', item: 'Copper and DAC', spec: 'DAC to the leaf per new data port (25G or 100G), labelled', qty: dac, unit: 'cable', unitCost: B('dac:SFP28'), manufacturer: 'Corning' });
    out.push({ kind: 'install', category: 'Compute and storage', item: 'Installation and integration', spec: 'Rack, cable, firmware baseline, 24 h burn-in, BMC and monitoring onboarding per new server', qty: a.units.length, unit: 'server', unitCost: B('labour:server-install'), manufacturer: 'NetBuild Corp' });
    out.push({ kind: 'move', category: 'Racks and containment', item: 'Move services', spec: 'De-rack and remove each old server after cut-over', qty: a.old.length, unit: 'device', unitCost: B('labour:server-derack'), manufacturer: 'NetBuild Corp' });
  }
  if (a.scope === 'network-refresh' && a.ports) {
    const price = (cls: PortClass) => B(`optic:${cls === 'SFP' ? 'SFP+' : cls}`);
    for (const o of a.ports.optics.filter(x => x.buy > 0)) out.push({ kind: 'optics', category: 'Network', item: 'Optics', spec: `${o.cls} transceivers for ports that change form factor or speed (${o.reuse} reused)`, qty: o.buy, unit: 'each', unitCost: price(o.cls), leadItem: 'Optics (400G)', manufacturer: 'Corning' });
    for (const o of a.ports.farOptics.filter(x => x.buy > 0)) out.push({ kind: 'optics', category: 'Network', item: 'Optics', spec: `${o.cls} transceivers at the far end (spine ports moving with the uplinks)`, qty: o.buy, unit: 'each', unitCost: price(o.cls), leadItem: 'Optics (400G)', manufacturer: 'Corning' });
    for (const d of a.ports.dac.filter(x => x.buy > 0)) out.push({ kind: 'dac', category: 'Cabling', item: 'Copper and DAC', spec: `${d.cls} DAC where the cable class changes (${d.reuse} reused)`, qty: d.buy, unit: 'cable', unitCost: B(d.cls === 'QSFP28' ? 'dac:QSFP28' : 'dac:SFP28'), manufacturer: 'Corning' });
    const n = a.units.length;
    out.push({ kind: 'install', category: 'Network', item: 'Feature licences', spec: 'Routing and EVPN feature licence per new switch', qty: n, unit: 'licence', unitCost: B('licence:switch'), manufacturer: 'Vendor licence' });
    out.push({ kind: 'install', category: 'Network', item: 'Installation and integration', spec: 'Rack beside the old switch, cable, cut over per side', qty: n, unit: 'switch', unitCost: B('labour:switch-cutover'), manufacturer: 'NetBuild Corp' });
    out.push({ kind: 'install', category: 'Network', item: 'Installation and integration', spec: 'Configuration carried over and translated to the new platform, tested in the lab', qty: n, unit: 'switch', unitCost: B('labour:config-translate'), manufacturer: 'Network automation team' });
    if (a.ports.farEnd.length) out.push({ kind: 'patch', category: 'Cabling', item: 'Patch and cross-connects', spec: 'Re-cable far-end (spine) ports for the faster uplinks', qty: a.ports.farEnd.length, unit: 'port', unitCost: B('labour:recable'), manufacturer: 'NetBuild Corp' });
  }
  if (a.scope === 'rack-replace' && a.rack) {
    const model = pstr(P, 'rackModel', 'NetShelter SX 48U'); const opt = CATALOGUE.rack.options.find(o => o.model === model);
    const racks = a.rackIds.length; const devices = a.old.filter(d => d.category !== 'PDU');
    for (const w of waves.length ? waves : [undefined]) {
      const q = w ? w.rackIds.length : racks; if (!q) continue;
      out.push({ kind: 'rack', category: 'Racks and containment', item: 'Rack', spec: `${model}${w ? ` · ${w.name}` : ''}`, qty: q, unit: 'each', unitCost: priceOf(model) ?? 3800, leadItem: 'Racks and containment', manufacturer: opt?.manufacturer ?? 'APC', phaseId: w?.id, needBy: needBy(w), model });
      if (pbool(P, 'replacePdus', true)) out.push({ kind: 'rack-pdu', category: 'Power', item: 'Rack power strips', spec: `Geist rPDU 3-phase, metered, A and B${w ? ` · ${w.name}` : ''}`, qty: q * 2, unit: 'each', unitCost: priceOf('Geist rPDU 3-phase') ?? 1400, leadItem: 'PDU', manufacturer: 'Vertiv', phaseId: w?.id, needBy: needBy(w), model: 'Geist rPDU 3-phase' });
    }
    if (pbool(P, 'reRack', true)) {
      const moves = a.rackIds.reduce((s, id) => s + a.old.filter(d => d.rackId === id && d.category !== 'PDU').length * (a.rack!.methods[id] === 'Temporary rack' ? 2 : 1), 0);
      out.push({ kind: 'move', category: 'Racks and containment', item: 'Move services', spec: 'De-rack and re-rack per device move (temporary-rack swaps move twice)', qty: moves, unit: 'move', unitCost: B('labour:rerack'), manufacturer: 'NetBuild Corp' });
      const portsN = devices.reduce((s, d) => s + (c.data ? (c.data.deviceComponents.filter(x => x.deviceId === d.id && (x.kind === 'power-port' || (x.kind === 'interface' && x.enabled !== false))).length) : 0), 0);
      out.push({ kind: 'patch', category: 'Cabling', item: 'Patch and cross-connects', spec: 'Re-cable every data and power port in the new rack, new labels', qty: portsN, unit: 'port', unitCost: B('labour:recable'), manufacturer: 'NetBuild Corp' });
    }
    out.push({ kind: 'install', category: 'Racks and containment', item: 'Installation and integration', spec: 'Remove old rack, set, level and bond the new rack, fit blanking', qty: racks, unit: 'rack', unitCost: B('labour:rack-swap'), manufacturer: 'NetBuild Corp' });
    const contain = a.rack.fit.filter(f => f.warnings.some(w => /containment/.test(w))).length;
    if (contain) out.push({ kind: 'containment', category: 'Racks and containment', item: 'Aisle containment', spec: 'Adjust containment doors or roof for the new rack', qty: contain, unit: 'rack', unitCost: B('labour:containment-adjust'), manufacturer: 'Vertiv' });
    if (a.rack.xconnects.length) out.push({ kind: 'patch', category: 'Cabling', item: 'Patch and cross-connects', spec: 'Carrier re-patch of cross-connects ending in the racks', qty: a.rack.xconnects.length, unit: 'cross-connect', unitCost: B('labour:xconnect-repatch'), manufacturer: 'Carrier' });
    const temp = a.rackIds.filter(id => a.rack!.methods[id] === 'Temporary rack').length;
    if (temp) out.push({ kind: 'install', category: 'Racks and containment', item: 'Installation and integration', spec: 'Temporary rack hire and set-up for the swap', qty: temp, unit: 'rack', unitCost: 600, manufacturer: 'NetBuild Corp' });
    if (pstr(P, 'oldEquipment', 'Certified disposal') === 'Certified disposal') {
      out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Old racks removed and recycled with certificate', qty: racks, unit: 'rack', unitCost: B('disposal:rack'), manufacturer: 'CBRE Data Center Solutions' });
      const strips = a.old.filter(d => d.category === 'PDU').length;
      if (strips && pbool(P, 'replacePdus', true)) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Old rack power strips recycled', qty: strips, unit: 'device', unitCost: B('disposal:device'), manufacturer: 'CBRE Data Center Solutions' });
    }
    return out;
  }
  // Disposal per device class: drives sanitised per drive (arrays per drive), devices recycled, a chain of custody per wave.
  const dispose = a.old.filter(d => disposeIds.has(d.id));
  if (dispose.length) {
    const drives = dispose.reduce((s, d) => s + (d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage' ? B(`drives:${d.category}`) : 0), 0);
    if (drives) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Drives wiped to NIST 800-88 or shredded, certificate per serial', qty: drives, unit: 'drive', unitCost: B('disposal:drive'), manufacturer: 'CBRE Data Center Solutions' });
    const net = dispose.filter(d => d.category === 'Switch' || d.category === 'Router' || d.category === 'Firewall').length;
    if (net) out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Configuration, keys and certificates erased on network devices', qty: net, unit: 'device', unitCost: B('disposal:network-wipe'), manufacturer: 'CBRE Data Center Solutions' });
    out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Collection and recycling per device', qty: dispose.length, unit: 'device', unitCost: B('disposal:device'), manufacturer: 'CBRE Data Center Solutions' });
    out.push({ kind: 'disposal', category: 'Fire and security', item: 'Certified data disposal', spec: 'Chain of custody: sealed transport and witnessed hand-over per wave', qty: Math.max(1, waves.length), unit: 'wave', unitCost: B('disposal:custody'), manufacturer: 'CBRE Data Center Solutions' });
  }
  return out;
}

/* ================================================================== business case */
/** Annual cost of support for the old devices, pro rata from their warranty or support contracts. */
function oldSupportAnnual(data: PlannerData, old: T.Device[]): { annual: number; basis: string[] } {
  const by = new Map<string, number>(); for (const d of old) if (d.warrantyContractId) by.set(d.warrantyContractId, (by.get(d.warrantyContractId) ?? 0) + 1);
  let annual = 0; const basis: string[] = [];
  for (const [id, n] of by) {
    const ct = byId(data, 'contracts', id); if (!ct) continue;
    const years = Math.max(1, (new Date(ct.endDate).getTime() - new Date(ct.startDate).getTime()) / (365 * DAY));
    const total = data.devices.filter(d => d.warrantyContractId === id).length || n;
    const yearly = (ct.annualValue ?? ct.value / years) * (n / total);
    annual += yearly; basis.push(`${ct.ctrId}: ${n} of ${total} devices × ${Math.round(ct.annualValue ?? ct.value / years).toLocaleString('en-US')} USD a year`);
  }
  return { annual, basis };
}
function business(c: ScopeCtx, a: ReplaceAnalysis): Business {
  const P = c.params; const data = c.data!; const B = (m: string) => bench(c.benchmarks, m);
  const pue = c.site?.pue ?? 1.5; const tariff = pnum(P, 'tariffUsdPerKwh', c.plan.tariffUsdPerKwh ?? 0.12);
  const kwh = (kw: number) => kw * pue * 8760 * tariff;
  const notes: string[] = []; const benefitLines: EstimateLine[] = []; const opexLines: EstimateLine[] = [];
  if (a.scope === 'rack-replace') {
    notes.push('A rack replacement is justified by safety, metering and power headroom, not by savings; no payback is claimed.');
    return { energyOldKw: a.oldKw, energyNewKw: a.oldKw, energySavedAnnual: 0, supportAvoidedAnnual: 0, supportNewAnnual: 0, licenceDeltaAnnual: 0, resaleCredit: 0, benefitLines, opexLines, notes };
  }
  const saved = kwh(a.oldKw) - kwh(a.newKw);
  benefitLines.push({ category: 'Benefit', item: saved >= 0 ? 'Energy saved' : 'Extra energy', amount: r0(saved), basis: `(${a.oldKw} kW measured − ${a.newKw} kW typical new) × PUE ${pue} × 8,760 h × ${tariff} USD/kWh`, source: 'actual' });
  const sup = oldSupportAnnual(data, a.old);
  const supportPct = a.scope === 'network-refresh' ? B('supportPct:network') : B('supportPct:server');
  const capexNew = a.units.reduce((s, u) => s + (priceOf(u.model) ?? 0), 0);
  const warrantyYears = bv(c.benchmarks, 'warrantyYears:new');
  // Network gear needs a support contract from day one (software and vendor support); servers are covered by the warranty first.
  const supportNew = a.scope === 'network-refresh' ? capexNew * (supportPct.value / 100) : 0;
  if (sup.annual) benefitLines.push({ category: 'Benefit', item: 'Support for the old fleet no longer renewed', amount: r0(sup.annual), basis: sup.basis.join('; '), source: 'actual' });
  else notes.push('No warranty or support contract is recorded on the old devices; support avoided is not counted.');
  if (supportNew) benefitLines.push({ category: 'Benefit', item: 'Support contract for the new equipment', amount: -r0(supportNew), basis: `${supportPct.value}% of ${r0(capexNew).toLocaleString('en-US')} USD list a year (${supportPct.source})`, source: 'benchmark' });
  else if (a.scope === 'server-refresh') notes.push(`New servers are covered by the ${warrantyYears}-year warranty in the price; support after that is not in this case.`);
  const lic = pnum(P, 'licenceDeltaAnnualUsd', 0);
  if (lic) benefitLines.push({ category: 'Benefit', item: lic > 0 ? 'Licences saved (fewer cores or sockets)' : 'Extra licences', amount: r0(lic), basis: 'Entered: licence change per year (per-core or per-socket software on the new servers)', source: 'user' });
  const resaleIds = a.mapping.filter(m => m.disposition === 'resell').flatMap(m => m.deviceIds);
  const resale = resaleIds.reduce((s, id) => { const d = byId(data, 'devices', id); return s + bv(c.benchmarks, `resale:${d?.category === 'Storage' ? 'Storage' : d?.category === 'Switch' || d?.category === 'Router' || d?.category === 'Firewall' ? 'Switch' : 'Server'}`); }, 0);
  opexLines.push({ category: 'OpEx', item: 'Energy for the new equipment', amount: r0(kwh(a.newKw) / 12), basis: `${a.newKw} kW typical × PUE ${pue} × 730 h × ${tariff} USD/kWh`, source: 'benchmark' });
  if (supportNew) opexLines.push({ category: 'OpEx', item: 'Vendor support for the new equipment', amount: r0(supportNew / 12), basis: `${supportPct.value}% of list a year`, source: 'benchmark' });
  return { energyOldKw: a.oldKw, energyNewKw: a.newKw, energySavedAnnual: r0(saved), supportAvoidedAnnual: r0(sup.annual), supportNewAnnual: r0(supportNew), licenceDeltaAnnual: lic, resaleCredit: r0(resale), benefitLines, opexLines, notes };
}

/** Schedule items per wave from the needs (stock needs only its transfer time). */
export function replaceSchedule(a: ReplaceAnalysis, plan: T.PlannerPlan): ScheduleItem[] {
  const items: ScheduleItem[] = a.needs.map(n => ({ item: `${n.model} × ${n.qty}`, leadWeeks: n.leadWeeks, needBy: n.needBy, orderBy: n.orderBy, late: n.late, phase: n.waveName, phaseId: n.waveId, kind: 'equipment', source: n.toBuy && n.fromStock ? 'mixed' : n.toBuy ? 'procure' : 'stock', note: n.note }));
  const waves = [...(plan.waves ?? [])].filter(w => w.status !== 'Cancelled').sort((x, y) => x.order - y.order);
  for (const w of waves) items.push({ item: `Change approved for ${w.name}`, leadWeeks: 1, needBy: w.windowStart, orderBy: new Date(new Date(w.windowStart).getTime() - 7 * DAY).toISOString(), late: false, phase: w.name, phaseId: w.id, kind: 'gate', note: 'Change advisory board one week before the window' });
  return items.sort((x, y) => x.orderBy.localeCompare(y.orderBy));
}
