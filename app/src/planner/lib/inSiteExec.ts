/**
 * In-site execution — the records a delivery team expects when a rack, pod, hall or retrofit
 * plan is executed, and the capacity it holds from approval.
 *
 *  - rack:     one change request in the next free change night with a clash check and a
 *              backout plan, a maintenance window, planned devices at their U positions with
 *              their NICs and planned patch cables to the reserved leaf ports, and the reserved
 *              addresses in the hall subnet.
 *  - pod:      planned racks (empty cabinets reused) and rows, planned A/B feeds per the feed
 *              schedule, one change per live PDU cut-in, an acceptance test per rack.
 *  - hall:     the hall set to Fitting (or a new hall record), planned rows, racks and floor PDUs,
 *              one milestone per phase, an acceptance test per commissioning level.
 *  - retrofit: a change and a maintenance window per wave, swing positions held, a level 5
 *              acceptance test for the liquid loops.
 *
 * Every record carries `plannerPlanId` (and the wave id where it applies) and its id is pushed
 * into the plan's artefacts. Capacity holds (reservations) are requested through
 * `inSiteReservations` / `inSiteRackUnits` and written by governance at approval.
 */
import type * as T from '../p2b/types';
import type { CloseoutCheck, ExecCtx, RackUnitRequest, ReservationRequest } from './scopes/types';
import type { Evaluation } from './engine';
import { byId, groupBy, type PlannerData } from './plannerData';
import { nextFreeWindow } from './impact';
import type { InSiteAnalysis } from './inSiteAnalysis';
import { clockMs } from '../compat/clock';

const now = () => new Date(clockMs()).toISOString();
export const inSiteOf = (ev: Evaluation | undefined): InSiteAnalysis | undefined => ev?.scope?.inSite as InSiteAnalysis | undefined;
const push = (arr: string[] | undefined, id: string) => [...(arr ?? []), id];
const expiry = (plan: T.PlannerPlan) => new Date(new Date(plan.targetGoLive).getTime() + 30 * 864e5).toISOString();

/* ================================================================== holds requested at approval */
export function inSiteReservations(plan: T.PlannerPlan, ev: Evaluation, data: PlannerData): ReservationRequest[] {
  const a = inSiteOf(ev); if (!a?.ready) return [];
  const dc = plan.dataCenterId; const exp = expiry(plan); const out: ReservationRequest[] = [];
  const cooling = (zoneId: string | undefined, kw: number, label: string) => { if (zoneId && kw > 0) out.push({ resourceType: 'Cooling', resourceId: zoneId, quantity: Math.round(kw * 10) / 10, unit: 'kW', label, dataCenterId: dc, expiresAt: exp }); };
  if (a.rack) {
    const zones = new Map<string, number>();
    for (const x of a.rack.accepted) {
      // Power held on the rack itself (counted once at site level); a new cabinet is held whole.
      out.push({ resourceType: 'PowerChain', resourceId: x.cand.rack.id, quantity: a.rack.perRack.kw, unit: 'kW', label: `${plan.plnId} · ${a.rack.perRack.kw} kW on ${x.cand.rack.name}`, dataCenterId: dc, expiresAt: exp });
      if (a.rack.mode === 'new-cabinet') out.push({ resourceType: 'Rack', resourceId: x.cand.rack.id, quantity: 1, unit: 'rack', label: `${plan.plnId} · cabinet ${x.cand.rack.name}`, dataCenterId: dc, expiresAt: exp });
      if (x.cand.zone) zones.set(x.cand.zone.zone.id, (zones.get(x.cand.zone.zone.id) ?? 0) + a.rack.perRack.kw);
      for (const p of [x.prod, x.mgmt]) if (p.subnet && p.addresses.length) out.push({ resourceType: 'Subnet', resourceId: p.subnet.id, quantity: p.addresses.length, unit: 'addresses', label: `${plan.plnId} · ${p.addresses.length} addresses in ${p.subnet.cidr} for ${x.cand.rack.name}`, dataCenterId: dc, expiresAt: exp });
    }
    for (const [z, kw] of zones) cooling(z, kw, `${plan.plnId} · ${kw} kW of cooling`);
  }
  const pc = a.pod?.chosen;
  if (a.pod && pc) {
    const p = a.pod;
    for (const pos of pc.positions) if (pos.rackId) out.push({ resourceType: 'Rack', resourceId: pos.rackId, quantity: 1, unit: 'rack', label: `${plan.plnId} · pod position x${pos.gridX} y${pos.gridY}`, dataCenterId: dc, expiresAt: exp });
    // kW held on the PDUs that take the cut-ins: side A counts at site level, side B ('kW-B') only on the PDU.
    for (const c of p.cutIns) out.push({ resourceType: 'PowerChain', resourceId: c.pdu.id, quantity: Math.round(c.kw * 10) / 10, unit: c.side === 'A' ? 'kW' : 'kW-B', label: `${plan.plnId} · ${c.circuits} circuits on ${c.pdu.name} (${c.side})`, dataCenterId: dc, expiresAt: exp });
    const unassigned = p.feedSchedule.filter(f => !f.pduA).length * p.kwPerRack;
    if (unassigned > 0) { const ups = data.upsUnits.filter(u => u.dataCenterId === dc).sort((x, y) => (y.capacityKw - y.loadKw) - (x.capacityKw - x.loadKw))[0]; if (ups) out.push({ resourceType: 'PowerChain', resourceId: ups.id, quantity: unassigned, unit: 'kW', label: `${plan.plnId} · ${unassigned} kW on ${ups.name} for new floor PDUs`, dataCenterId: dc, expiresAt: exp }); }
    if (p.cooling !== 'in-row' && p.cooling !== 'rear-door') cooling(pc.zone?.zone.id, a.addedKw, `${plan.plnId} · pod cooling`);
  }
  if (a.hall) {
    const h = a.hall;
    for (const pos of h.positions) if (pos.rackId) out.push({ resourceType: 'Rack', resourceId: pos.rackId, quantity: 1, unit: 'rack', label: `${plan.plnId} · hall position x${pos.gridX} y${pos.gridY}`, dataCenterId: dc, expiresAt: exp });
    const ups = data.upsUnits.filter(u => u.dataCenterId === dc && u.status !== 'Failed').sort((x, y) => x.id.localeCompare(y.id));
    if (ups[0]) out.push({ resourceType: 'PowerChain', resourceId: ups[0].id, quantity: a.addedKw, unit: 'kW', label: `${plan.plnId} · ${a.addedKw} kW hall fit-out on ${ups[0].name}`, dataCenterId: dc, expiresAt: exp });
    if (ups[1]) out.push({ resourceType: 'PowerChain', resourceId: ups[1].id, quantity: a.addedKw, unit: 'kW-B', label: `${plan.plnId} · ${a.addedKw} kW hall fit-out on ${ups[1].name} (B side)`, dataCenterId: dc, expiresAt: exp });
    cooling(h.zone?.zone.id, Math.min(h.airKw, Math.max(0, h.zone?.headroomKw ?? 0)), `${plan.plnId} · hall air heat`);
  }
  if (a.retrofit) {
    const r = a.retrofit;
    for (const x of r.rows) if (x.deltaKw > 0) out.push({ resourceType: 'PowerChain', resourceId: x.rack.id, quantity: x.deltaKw, unit: 'kW', label: `${plan.plnId} · uprate ${x.rack.name} by ${x.deltaKw} kW`, dataCenterId: dc, expiresAt: exp });
    for (const z of r.zones) cooling(z.zone.zone.id, z.residualKw, `${plan.plnId} · residual air heat`);
    for (const s of new Set(r.waves.flatMap(w => w.swingRackIds ?? []))) out.push({ resourceType: 'Rack', resourceId: s, quantity: 1, unit: 'rack', label: `${plan.plnId} · swing position`, dataCenterId: dc, expiresAt: exp });
  }
  return out;
}

/** Units held in existing racks (rack placement into existing racks). */
export function inSiteRackUnits(plan: T.PlannerPlan, ev: Evaluation): RackUnitRequest[] {
  const a = inSiteOf(ev); if (!a?.rack) return [];
  return a.rack.accepted.filter(x => x.startU && x.endU).map(x => ({ rackId: x.cand.rack.id, units: Array.from({ length: x.endU! - x.startU! + 1 }, (_, i) => x.startU! + i), description: `${plan.plnId} · ${plan.title}` }));
}

/* ================================================================== delivery vehicle (rack) */
export async function inSiteExecuteVehicle(x: ExecCtx): Promise<void> {
  const a = inSiteOf(x.ev);
  if (x.plan.scope !== 'rack' || !a?.rack) { await genericProject(x); return; }
  const r = a.rack; const plan = x.plan;
  const id = x.seq('changeRequests', 'CHG');
  const racks = r.accepted.map(y => y.cand.rack);
  const leaves = [...new Set(r.accepted.flatMap(y => y.ports.map(p => p.deviceId)))];
  const w = r.window ?? nextFreeWindow(x.data, { dataCenterId: plan.dataCenterId, rackIds: racks.map(k => k.id), hours: 4, after: new Date(clockMs() + 3 * 864e5).toISOString(), excludePlanId: plan.id });
  const risk = x.ev.hardFails ? 'High' : x.ev.softWarns ? 'Medium' : 'Low';
  const placement = r.accepted.map(y => `${y.cand.rack.name}${y.startU ? ` U${y.startU}–U${y.endU}` : ''}: ${r.perRack.kw} kW, outlets ${y.outlets.map(o => o.name).join(', ') || 'new power strips'}, ports ${y.ports.map(p => `${p.deviceName} ${p.ifaceName}`).join(', ')}`).join('\n');
  x.create('changeRequests', { id, chgId: id, title: `${plan.title} · install`, type: 'RackDeploy', description: `Raised from plan ${plan.plnId}. ${r.mode === 'new-cabinet' ? 'New cabinet in an empty position' : 'Equipment into existing racks'}.\n${placement}\nImplementation: rack and stack, power from the listed outlets (A then B), patch to the leaf ports, address from IPAM, power on and verify both feeds.`, risk, status: 'Submitted', priority: 'Medium', affectedResourceType: 'Rack', affectedResourceIds: [...racks.map(k => k.id), ...leaves], dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', policyViolations: x.ev.findings.filter(f => f.status === 'fail').map(f => f.rule.title), scheduledStart: w.start, scheduledEnd: w.end, rollbackPlan: r.backout, plannerPlanId: plan.id });
  x.artefacts.changeRequestId = id; x.artefacts.changeRequestIds = push(x.artefacts.changeRequestIds, id);
  const mw = x.seq('maintenanceWindows', 'MW');
  x.create('maintenanceWindows', { id: mw, mwId: mw, title: `${plan.title} · install window`, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: id, scheduledStart: w.start, scheduledEnd: w.end, affectedDeviceIds: leaves, impact: 'No service impact expected: new equipment only; existing equipment in the rack is not touched', owner: plan.ownerName, plannerPlanId: plan.id });
  x.artefacts.maintenanceWindowIds = push(x.artefacts.maintenanceWindowIds, mw);
  const inst = await x.startProcess('change', id, { recordType: 'changeRequest', recordId: id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id } });
  if (!inst) throw new Error('The change process could not be started');
  x.artefacts.processInstanceId = inst.id;
}

/** Project vehicle for pod, hall and retrofit (the generic step with the plan's own template). */
async function genericProject(x: ExecCtx) {
  const { plan } = x;
  const programId = await x.createProgram({ name: plan.title, type: 'Capacity Expansion', objective: plan.intent || plan.title, ownerName: plan.ownerName, budget: plan.baseline?.capexTotal ?? x.ev.estimate.capexTotal, status: 'Active', startDate: now(), endDate: plan.targetGoLive });
  x.update('programs', programId, { plannerPlanId: plan.id });
  x.artefacts.programId = programId;
  const template = plan.scope === 'hall' ? 'Hall Fit-out' : plan.scope === 'retrofit' ? 'Liquid Retrofit' : 'Rack Deployment';
  const pid = await x.createProject({ name: plan.title, programId, template, managerName: plan.ownerName, dataCenterId: plan.dataCenterId, plannedStart: now(), plannedEnd: plan.targetGoLive, budget: plan.baseline?.capexTotal ?? x.ev.estimate.capexTotal, detail: { planId: plan.id } });
  if (pid) { x.update('projects', pid, { plannerPlanId: plan.id }); x.artefacts.projectIds = push(x.artefacts.projectIds, pid); }
  const key = plan.scope === 'hall' ? 'hall-fitout' : 'work-order';
  const inst = await x.startProcess(key, plan.plnId, { recordType: 'plannerPlan', recordId: plan.id, dataCenterId: plan.dataCenterId, title: plan.title, variables: { planId: plan.id, scope: plan.scope, designPowerKw: plan.designPowerKw, capex: x.ev.estimate.capexTotal } });
  if (!inst) x.warn(`Work order ${key} could not be started; start it from Work orders`);
  x.artefacts.processInstanceId = inst?.id;
}

/* ================================================================== family records */
export async function inSiteExecute(x: ExecCtx): Promise<void> {
  const a = inSiteOf(x.ev); if (!a) return;
  if (a.rack) await x.step('in-site-rack', () => rackRecords(x, a));
  if (a.pod) await x.step('in-site-pod', () => podRecords(x, a));
  if (a.hall) await x.step('in-site-hall', () => hallRecords(x, a));
  if (a.retrofit) await x.step('in-site-retrofit', () => retrofitRecords(x, a));
  // Subnets carved for a pod or hall belong to the hall.
  const hallId = a.hall?.hall?.id ?? x.artefacts.createdSite?.hallIds?.[0] ?? a.pod?.chosen?.hall.id;
  if (hallId) for (const s of x.artefacts.subnetIds ?? []) x.update('subnets', s, { hallId });
}

function rackRecords(x: ExecCtx, a: InSiteAnalysis) {
  const r = a.rack!; const plan = x.plan;
  for (const acc of r.accepted) {
    const rack = acc.cand.rack;
    if (r.mode === 'new-cabinet') { x.update('racks', rack.id, { status: 'Reserved', plannerPlanId: plan.id, owner: plan.requestedBy || rack.owner }); x.artefacts.plannedRackIds = push(x.artefacts.plannedRackIds, rack.id); }
    // Planned devices stacked from the start of the reserved block, with NICs patched to the leaf ports.
    let u = acc.startU ?? 1; let portIdx = 0;
    for (const row of r.equipment?.rows ?? []) for (let i = 0; i < row.line.qty; i++) {
      if (!row.model) continue;
      const devId = x.seq('devices', 'ASSET');
      x.create('devices', { id: devId, devcId: devId, name: `${plan.plnId.toLowerCase()}-${row.model.model.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${i + 1}`, deviceTypeId: '', rackId: rack.id, dataCenterId: plan.dataCenterId, position: u, status: 'Planned', face: 'front', assetModelId: row.model.id, manufacturer: row.model.manufacturer, model: row.model.model, category: row.model.category, heightU: row.model.heightU, powerDrawW: row.model.typicalPowerW, weightKg: row.model.weightKg, lifecycleState: 'Ordered', ownerTeam: plan.requestedBy, plannerPlanId: plan.id, notes: `Planned by ${plan.plnId}` });
      x.artefacts.plannedDeviceIds = push(x.artefacts.plannedDeviceIds, devId);
      u += row.model.heightU;
      const nics = ['Server', 'GPU-Node', 'Storage'].includes(row.model.category) ? 2 : 0;
      for (let n = 0; n < nics && portIdx < acc.ports.length; n++, portIdx++) {
        const port = acc.ports[portIdx];
        const nic = x.id('DCOMP');
        x.create('deviceComponents', { id: nic, dcompId: nic, deviceId: devId, kind: 'interface', name: `NIC${n + 1}`, enabled: true, speedMbps: port.speedMbps, label: `To ${port.deviceName} ${port.ifaceName}` });
        const cbl = x.id('CBL');
        x.create('cables', { id: cbl, cblId: cbl, status: 'Planned', cableType: (port.speedMbps ?? 0) >= 25000 ? 'DAC' : 'Cat6a', label: `${plan.plnId} ${rack.name} ${port.side}`, aKind: 'interface', aComponentId: port.ifaceId, aDeviceId: port.deviceId, bKind: 'interface', bComponentId: nic, bDeviceId: devId, plannerPlanId: plan.id });
        x.artefacts.cableIds = push(x.artefacts.cableIds, cbl);
      }
    }
    // Addresses reserved in the hall subnets.
    for (const p of [acc.prod, acc.mgmt]) for (const addr of p.addresses) {
      if (!p.subnet) continue;
      const ip = x.seq('ipAddresses', 'IP');
      x.create('ipAddresses', { id: ip, ipId: ip, subnetId: p.subnet.id, address: addr, status: 'Reserved', description: `Reserved for ${plan.plnId} · ${rack.name}`, hostname: `${plan.plnId.toLowerCase()}-${rack.name.toLowerCase()}` });
      x.artefacts.ipAddressIds = push(x.artefacts.ipAddressIds, ip);
    }
  }
  x.planPatch.placement = { mode: r.mode, racks: r.accepted.map(y => ({ rackId: y.cand.rack.id, startU: y.startU, endU: y.endU, kw: r.perRack.kw, feedIds: y.cand.rb.feeds.map(f => f.id), outletIds: y.outlets.map(o => o.id), ports: y.ports.map(p => ({ deviceId: p.deviceId, ifaceId: p.ifaceId, speedMbps: p.speedMbps })) })), acceptedAt: plan.placement?.acceptedAt };
}

/** A planned rack at a grid position (an empty cabinet already there is reused). */
function plannedRack(x: ExecCtx, pos: { hallId: string; gridX: number; gridY: number; rackId?: string; rowId?: string }, rowId: string, zoneId: string | undefined, kw: number, label: string, heightU = 42): string {
  const plan = x.plan;
  if (pos.rackId) { x.update('racks', pos.rackId, { status: 'Reserved', plannerPlanId: plan.id, maxPowerKw: Math.max(kw, byId(x.data, 'racks', pos.rackId)?.maxPowerKw ?? 0), owner: plan.requestedBy }); x.artefacts.plannedRackIds = push(x.artefacts.plannedRackIds, pos.rackId); return pos.rackId; }
  const id = x.seq('racks', 'RACK');
  x.create('racks', { id, rackId: id, rowId, hallId: pos.hallId, dataCenterId: plan.dataCenterId, name: label, gridX: pos.gridX, gridY: pos.gridY, heightU, usedU: 0, availableU: heightU, widthMm: 600, depthMm: 1200, maxWeightKg: 1360, currentWeightKg: 0, maxPowerKw: kw, currentPowerKw: 0, powerUtilizationPct: 0, redundancy: '2N', coolingZoneId: zoneId, thermalDensityKwPerRack: kw, purpose: 'Compute', status: 'Planned', liquidCoolingReady: kw > 30, owner: plan.requestedBy, plannerPlanId: plan.id });
  x.artefacts.plannedRackIds = push(x.artefacts.plannedRackIds, id);
  // A new planned cabinet is held for this plan so other plans do not count it as a free position.
  const rsv = x.seq('capacityReservations', 'RSV');
  x.create('capacityReservations', { id: rsv, rsvId: rsv, resourceType: 'Rack', resourceId: id, state: 'Committed', quantity: 1, unit: 'rack', status: 'Active', plannerPlanId: plan.id, dataCenterId: plan.dataCenterId, label: `${plan.plnId} · ${label}`, expiresAt: expiry(plan) });
  x.artefacts.reservationIds = push(x.artefacts.reservationIds, rsv);
  return id;
}
/** Rows created in this run, so racks on the same new grid line share one row. */
const ROWS = new WeakMap<ExecCtx, Map<string, string>>();
function rowFor(x: ExecCtx, hallId: string, gridY: number, existing: string | undefined, containment: T.Row['containment']): string {
  if (existing) return existing;
  const found = (groupBy(x.data, 'rows', 'hallId').get(hallId) ?? []).find(r => Number(r.gridPosition) === gridY);
  if (found) return found.id;
  const cache = ROWS.get(x) ?? new Map<string, string>(); ROWS.set(x, cache);
  const made = cache.get(`${hallId}:${gridY}`); if (made) return made;
  const id = x.seq('rows', 'ROW');
  x.create('rows', { id, rowId: id, hallId, name: `Row ${String.fromCharCode(65 + gridY)}`, gridPosition: String(gridY), containment, rackCount: 0, plannerPlanId: x.plan.id });
  x.artefacts.rowIds = push(x.artefacts.rowIds, id);
  cache.set(`${hallId}:${gridY}`, id);
  return id;
}
function atp(x: ExecCtx, name: string, system: T.Atp['system'], level: T.Atp['level'], steps: [string, string, string][], waveId?: string, phaseId?: string) {
  const id = x.seq('atps', 'ATP');
  x.create('atps', { id, atpId: id, projectId: x.artefacts.projectIds?.[0] ?? '', name, system, level, status: 'Draft', plannerPlanId: x.plan.id, plannerWaveId: waveId, planPhaseId: phaseId });
  steps.forEach(([description, method, expectedResult], i) => { const s = x.id('ATPS'); x.create('atpSteps', { id: s, atpsId: s, atpId: id, stepNo: i + 1, description, method, expectedResult, result: 'Pending' }); });
  x.artefacts.atpIds = push(x.artefacts.atpIds, id);
}
function changeFor(x: ExecCtx, title: string, type: T.ChangeRequest['type'], resourceType: T.ChangeRequest['affectedResourceType'], ids: string[], w: { start: string; end: string }, rollback: string, impact: string, waveId?: string, deviceIds: string[] = []): { chg: string; mw: string } {
  const plan = x.plan;
  const chg = x.seq('changeRequests', 'CHG');
  x.create('changeRequests', { id: chg, chgId: chg, title, type, description: `Raised from plan ${plan.plnId}. ${impact}`, risk: 'Medium', status: 'Submitted', priority: 'Medium', affectedResourceType: resourceType, affectedResourceIds: ids, dataCenterId: plan.dataCenterId, requestedBy: x.actor, requestedById: 'me', policyViolations: [], scheduledStart: w.start, scheduledEnd: w.end, rollbackPlan: rollback, projectId: x.artefacts.projectIds?.[0], plannerPlanId: plan.id, plannerWaveId: waveId });
  x.artefacts.changeRequestIds = push(x.artefacts.changeRequestIds, chg);
  const mw = x.seq('maintenanceWindows', 'MW');
  x.create('maintenanceWindows', { id: mw, mwId: mw, title, status: 'Scheduled', dataCenterId: plan.dataCenterId, changeRequestId: chg, scheduledStart: w.start, scheduledEnd: w.end, affectedDeviceIds: deviceIds, impact, owner: plan.ownerName, plannerPlanId: plan.id, plannerWaveId: waveId });
  x.artefacts.maintenanceWindowIds = push(x.artefacts.maintenanceWindowIds, mw);
  return { chg, mw };
}
const RACK_ATP: [string, string, string][] = [['Power on from feed A only', 'Open feed B breaker, measure', 'All equipment up on A'], ['Fail over to feed B', 'Close B, open A', 'All equipment up on B; no reboot'], ['Thermal check at load', 'Inlet sensors at the front of the rack', 'Inlet within 18 to 27 °C'], ['Port test', 'Link and traffic on every patched port', 'All links up at the planned speed']];

function podRecords(x: ExecCtx, a: InSiteAnalysis) {
  const p = a.pod!; const plan = x.plan; const ch = p.chosen; if (!ch) { x.warn('No pod position was accepted; no racks were created'); return; }
  const g = ch.hall; const panel = x.data.powerPanels.find(pp => pp.hallId === g.id);
  const taken: { start: string; end: string }[] = [];
  p.feedSchedule.forEach(f => {
    const rowId = rowFor(x, g.id, f.position.gridY, f.position.rowId, ch.containment === 'New' ? 'Cold-Aisle' : ch.containment);
    const rackId = plannedRack(x, f.position, rowId, g.coolingZoneId, p.kwPerRack, `${plan.plnId}-${f.label}`, 42);
    for (const [side, pduName] of [['A', f.pduA], ['B', f.pduB]] as const) {
      const pdu = x.data.pdus.find(d => d.name === pduName && d.hallId === g.id);
      const fid = x.seq('powerFeeds', 'PFEED');
      x.create('powerFeeds', { id: fid, pfId: fid, powerPanelId: panel?.id ?? '', rackId, pduId: pdu?.id, name: `${f.label}-${side}`, supply: 'AC', phase: p.feed.phase, voltage: 415, amperage: f.amps, maxUtilizationPct: 80, type: side === 'A' ? 'Primary' : 'Redundant', status: 'Planned', plannerPlanId: plan.id });
      x.artefacts.powerFeedIds = push(x.artefacts.powerFeedIds, fid);
    }
    atp(x, `${plan.plnId} · ${f.label} rack acceptance`, 'Integrated', 'L4 Functional', RACK_ATP);
  });
  // One change per live PDU cut-in, each in its own free night.
  for (const c of p.cutIns) {
    const w = nextFreeWindow(x.data, { dataCenterId: plan.dataCenterId, hours: 4, after: new Date(clockMs() + 7 * 864e5).toISOString(), excludePlanId: plan.id, taken }); taken.push(w);
    changeFor(x, `${plan.plnId} · cut in ${c.circuits} circuits on ${c.pdu.name} (${c.side})`, 'PowerUpgrade', 'PowerChain', [c.pdu.id], w, `Open the new breakers on ${c.pdu.name} and leave them locked off; no change to live circuits`, `Live cut-in on ${c.pdu.name}: new breakers only, existing circuits stay on; the other side carries the load during the work`);
  }
}

function hallRecords(x: ExecCtx, a: InSiteAnalysis) {
  const h = a.hall!; const plan = x.plan;
  let hallId = h.hall?.id;
  if (h.mode === 'new-hall') {
    const nh = plan.inSite?.newHall; if (!nh) { x.warn('The new hall is not described; no hall record was created'); return; }
    hallId = x.seq('halls', 'HALL');
    const cols = Math.max(1, Math.ceil(Math.sqrt(nh.positions * 2)));
    x.create('halls', { id: hallId, hallId, floorId: nh.floorId, dataCenterId: plan.dataCenterId, name: nh.name, gridCols: cols, gridRows: Math.ceil(nh.positions / cols), designPowerKw: nh.designKw, rackCount: 0, rackCapacity: nh.positions, utilizationPct: 0, status: 'Fitting', areaSqm: nh.areaSqm, plannerPlanId: plan.id });
    x.artefacts.createdSite = { ...(x.artefacts.createdSite ?? {}), hallIds: [...(x.artefacts.createdSite?.hallIds ?? []), hallId] };
  } else if (hallId) x.update('halls', hallId, { status: 'Fitting', plannerPlanId: plan.id });
  if (!hallId) return;
  const zoneId = h.hall?.coolingZoneId;
  // Racks at their grid positions, phase by phase.
  let k = 0;
  for (const ph of h.phases.length ? h.phases : [{ phase: undefined, racks: h.racks, kw: h.kw, share: 1 }]) {
    for (let i = 0; i < ph.racks && k < h.positions.length; i++, k++) {
      const pos = { ...h.positions[k], hallId: hallId };
      const cls = clsAt(h.classes, k);
      const rowId = rowFor(x, hallId, pos.gridY, pos.rowId, 'Cold-Aisle');
      plannedRack(x, pos, rowId, zoneId, cls?.kw ?? 0, `${plan.plnId}-${String(k + 1).padStart(3, '0')}`, 48);
    }
  }
  // New floor PDUs on the site UPS (A and B).
  const ups = x.data.upsUnits.filter(u => u.dataCenterId === plan.dataCenterId && u.status !== 'Failed').sort((p1, p2) => p1.id.localeCompare(p2.id));
  const kwEach = a.plant.find(p => p.kind === 'pdu')?.capacityKw ?? 150;
  for (let i = 0; i < h.pduPerSide * 2 && (h.mode !== 'partly-used' || h.pduPerSide > 0); i++) {
    const id = x.seq('pdus', 'PDU');
    x.create('pdus', { id, pduId: id, upsId: ups[i % 2]?.id ?? ups[0]?.id, hallId, name: `${plan.plnId}-PDU-${i % 2 ? 'B' : 'A'}${Math.floor(i / 2) + 1}`, capacityKw: kwEach, loadKw: 0, loadPct: 0, outletCount: 42, outletsUsed: 0, plannerPlanId: plan.id });
    x.artefacts.pduIds = push(x.artefacts.pduIds, id);
  }
  // One milestone per phase on the project, and an acceptance test per commissioning level.
  const project = x.artefacts.projectIds?.[0];
  if (project) for (const ph of h.phases) { const id = x.seq('milestones', 'MS'); x.create('milestones', { id, msId: id, projectId: project, name: `${ph.phase.name}: ${ph.racks} racks, ${ph.kw} kW released`, dueDate: ph.phase.goLive, status: 'Not Started', rag: 'Green', plannerPlanId: plan.id }); x.artefacts.milestoneIds = push(x.artefacts.milestoneIds, id); }
  const levels: [T.Atp['level'], T.Atp['system'], [string, string, string][]][] = [
    ['L1 FAT', 'Power', [['Factory test of floor PDUs and CRAH/CDU units', 'Witnessed at the factory', 'Test certificates issued']]],
    ['L2 SAT', 'Power', [['Site inspection of delivered equipment', 'Visual and documentation check', 'No damage; serials match the bill']]],
    ['L3 Pre-functional', 'Controls', [['Installation checks: torque, labelling, insulation resistance, pipework pressure', 'Checklist per item', 'All items signed off']]],
    ['L4 Functional', 'Cooling', [['Each PDU, CRAH and CDU through its operating modes', 'Load bank and BMS points', 'Every mode as designed; alarms reach the BMS']]],
    ['L5 IST', 'Integrated', [['Integrated systems test at design load with a feed lost', 'Load banks at full hall load; open one side', 'IT load carried; inlet within 18 to 27 °C']]],
  ];
  for (const [level, system, steps] of levels) atp(x, `${plan.plnId} · ${level}`, system, level, steps, undefined, h.phases[h.phases.length - 1]?.phase.id);
}
const clsAt = (classes: T.PlannerRackClass[], i: number) => { let acc = 0; for (const c of classes) { acc += c.racks; if (i < acc) return c; } return classes[classes.length - 1]; };

function retrofitRecords(x: ExecCtx, a: InSiteAnalysis) {
  const r = a.retrofit!; const plan = x.plan;
  if (r.wavesProposed) { x.warn('The retrofit waves were not accepted; no wave changes were created'); }
  const waves: T.PlannerWave[] = [];
  for (const w of r.wavesProposed ? [] : r.waves) {
    if (w.changeRequestId) { waves.push(w); continue; }
    const type: T.ChangeRequest['type'] = w.kind === 'works' ? 'PowerUpgrade' : 'ServerRelocation';
    const impact = w.kind === 'works' ? `Works on drained racks ${w.rackIds.map(id => byId(x.data, 'racks', id)?.name ?? id).join(', ')}; no live service` : `${w.serviceIds.length} services touched (${w.deviceIds.length} devices); see the wave plan for customers`;
    const { chg, mw } = changeFor(x, `${plan.plnId} · ${w.name}`, type, 'Rack', w.rackIds, { start: w.windowStart, end: w.windowEnd }, w.rollback, impact, w.id, w.deviceIds);
    waves.push({ ...w, changeRequestId: chg, maintenanceWindowId: mw, status: 'Scheduled' });
  }
  for (const s of new Set(waves.flatMap(w => w.swingRackIds ?? []))) x.update('racks', s, { status: 'Reserved', plannerPlanId: plan.id });
  atp(x, `${plan.plnId} · liquid cooling acceptance (level 5)`, 'Cooling', 'L5 IST', [
    ['Flush the secondary loop', 'Flush to the CDU vendor procedure', 'Filter clean; water quality in range'],
    ['Fill and vent', 'Fill with treated water, vent high points', 'No air at the high points'],
    ['Pressure hold', 'Hold at 1.5 × working pressure for 24 h', 'No pressure drop'],
    ['Leak test', 'Leak detection cable and visual check at every manifold', 'No leak; leak alarms reach the BMS'],
    ['CDU failover', 'Trip the duty CDU under load', 'Standby takes the loop; supply temperature stable'],
    ['Thermal under load', 'Load banks or IT at the target kW per rack', 'Inlet and coolant return within design'],
  ]);
  x.planPatch.waves = waves.length ? waves : plan.waves;
}

/* ================================================================== completion */
export function inSiteCloseout(plan: T.PlannerPlan, data: PlannerData): CloseoutCheck[] {
  const art = plan.artefacts; const out: CloseoutCheck[] = [];
  const holds = data.capacityReservations.filter(h => h.plannerPlanId === plan.id);
  const open = holds.filter(h => h.state === 'Reserved' || h.state === 'Committed');
  out.push({ key: 'holds-consumed', label: 'Capacity holds consumed or released', ok: holds.length > 0 && open.length === 0, detail: holds.length ? `${holds.length - open.length} of ${holds.length} holds consumed or released` : 'No holds recorded for the plan' });
  if (plan.scope === 'rack') {
    const devs = (art?.plannedDeviceIds ?? []).map(id => byId(data, 'devices', id)).filter((d): d is T.Device => !!d);
    const live = devs.filter(d => d.lifecycleState === 'Active' || d.lifecycleState === 'Installed');
    out.push({ key: 'devices-active', label: 'Planned devices installed and active', ok: devs.length > 0 && live.length === devs.length, detail: devs.length ? `${live.length} of ${devs.length} active` : 'No planned devices (tenant equipment not listed)' });
    const racks = (plan.placement?.racks ?? []).map(p => byId(data, 'racks', p.rackId)).filter((rk): rk is T.Rack => !!rk);
    const planned = (plan.placement?.racks ?? []).reduce((s, p) => s + p.kw, 0);
    const measured = Math.round(racks.reduce((s, rk) => s + (rk.currentPowerKw || 0), 0) * 10) / 10;
    out.push({ key: 'measured-kw', label: 'Measured draw against plan', ok: racks.length > 0 && measured > 0, detail: racks.length ? `${measured} kW measured on ${racks.map(rk => rk.name).join(', ')} (rack total) against ${planned} kW planned` : 'No racks recorded in the placement' });
  }
  if (plan.scope === 'pod' || plan.scope === 'hall') {
    const racks = (art?.plannedRackIds ?? []).map(id => byId(data, 'racks', id)).filter((rk): rk is T.Rack => !!rk);
    const live = racks.filter(rk => rk.status === 'Active' || rk.status === 'Full');
    out.push({ key: 'racks-live', label: 'Planned racks live', ok: racks.length > 0 && live.length === racks.length, detail: `${live.length} of ${racks.length} racks active; ${Math.round(live.reduce((s, rk) => s + rk.currentPowerKw, 0))} kW measured against ${plan.designPowerKw} kW planned` });
  }
  if (plan.scope === 'hall') {
    const hall = byId(data, 'halls', String(plan.params.targetHallId ?? art?.createdSite?.hallIds?.[0] ?? ''));
    out.push({ key: 'hall-live', label: 'Hall set to Live', ok: hall?.status === 'Live', detail: hall ? `${hall.name} is ${hall.status ?? 'not set'}` : 'Hall not found' });
  }
  if (plan.scope === 'retrofit') {
    const waves = plan.waves ?? [];
    out.push({ key: 'waves-closed', label: 'Every wave closed', ok: waves.length > 0 && waves.every(w => w.status === 'Closed'), detail: `${waves.filter(w => w.status === 'Closed').length} of ${waves.length} closed` });
    const racks = (plan.inSite?.retrofit ?? []).map(s => byId(data, 'racks', s.rackId)).filter((rk): rk is T.Rack => !!rk);
    out.push({ key: 'liquid-ready', label: 'Converted racks marked liquid-ready in DCIM', ok: racks.length > 0 && racks.every(rk => rk.liquidCoolingReady), detail: `${racks.filter(rk => rk.liquidCoolingReady).length} of ${racks.length}` });
  }
  if (plan.scope !== 'rack') {
    const atps = (art?.atpIds ?? []).map(id => byId(data, 'atps', id)).filter((t): t is T.Atp => !!t);
    out.push({ key: 'atp-accepted', label: 'Acceptance tests accepted', ok: atps.length > 0 && atps.every(t => t.status === 'Accepted'), detail: `${atps.filter(t => t.status === 'Accepted').length} of ${atps.length} accepted` });
  }
  return out;
}
