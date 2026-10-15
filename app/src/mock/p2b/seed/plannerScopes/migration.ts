/* Planner seed · migration family (see src/modules/planner/lib/scopes/migration.ts).
   Inputs and rules for migration, consolidation and decommission, and the scope data of the
   demo plan PLN-0006 (Dublin SR-1 into Dublin CO-1). PLN-0006 is executing: the first wave
   (equipment already retired) is closed, the service move and the site close-out are scheduled,
   so the plan agrees with a site that is still Decommissioning. */
import type * as T from '../../../../planner/p2b/types';
import type { Seed } from '../ctx';
import type { ScopeSeed } from './types';

const P = (key: string, label: string, aspect: T.PlannerAspect, type: T.PlannerParamDef['type'], extra: Partial<T.PlannerParamDef> = {}): T.PlannerParamDef => ({ key, label, aspect, type, ...extra });
const R = (id: string, aspect: T.PlannerAspect, severity: T.PlannerRuleSeverity, title: string, check: string, extra: Partial<T.PlannerRuleDef> = {}): T.PlannerRuleDef => ({ id, aspect, severity, title, check, ...extra });
const M: T.PlannerScope[] = ['migration'];

export const migrationSeed: ScopeSeed = {
  params: {
    migration: [
      P('crewDevicesPerHour', 'Devices one crew moves per hour', 'migration', 'number', { default: 4, min: 0.5, max: 20, help: 'De-rack, pack, re-rack and re-cable' }),
      P('customerNoticeDays', 'Notice to customers', 'migration', 'number', { unit: 'days', default: 30, min: 0, max: 365, help: 'Premium customers get at least 90 days' }),
      P('handbackWeeks', 'Plant decommission and handback after the last wave', 'migration', 'number', { unit: 'weeks', default: 6, min: 1, max: 52 }),
      P('leaseUsdPerM2Year', 'Rent per m² a year (when no lease is recorded)', 'finance', 'number', { unit: 'USD', default: 0, min: 0 }),
      P('siteStaffFte', 'Site staff freed', 'finance', 'number', { unit: 'FTE', default: 0, min: 0, max: 100 }),
      P('siteMaintenanceUsdYear', 'Plant maintenance at the site per year', 'finance', 'number', { unit: 'USD', default: 0, min: 0 }),
      P('costContingencyPct', 'Cost contingency', 'finance', 'number', { unit: '%', default: 15, min: 0, max: 50 }),
      // Derived from the inventory; kept out of the steps so they cannot be typed over.
      P('racksToMove', 'Rack-equivalents moving (from the inventory)', 'operations', 'number', { default: 0, derived: 'moving U ÷ 34' }),
      P('dataDisposal', 'Certified data disposal (always on)', 'operations', 'bool', { default: true }),
    ],
  },
  rules: [
    { rule: R('R-MIG-01', 'migration', 'hard', 'Every item at the source has a confirmed disposition', 'mig-dispositions'), scopes: M },
    { rule: R('R-MIG-02', 'migration', 'hard', 'Each wave\'s longest outage fits the cut-over window', 'mig-downtime'), scopes: M },
    { rule: R('R-MIG-03', 'space', 'hard', 'The target site takes every wave: positions, kW, cooling and address space', 'mig-target-fit'), scopes: M },
    { rule: R('R-MIG-04', 'migration', 'hard', 'Customer consent and full notice before each wave', 'mig-consent'), scopes: M },
    { rule: R('R-MIG-05', 'network', 'soft', 'Circuits ceased or re-terminated with any early-termination cost counted', 'mig-circuits'), scopes: M },
    { rule: R('R-MIG-06', 'finance', 'hard', 'Notice on site contracts served in time for the exit date', 'mig-contracts'), scopes: M },
    { rule: R('R-MIG-07', 'compliance', 'hard', 'Compliance steps for the site are on the plan (sanitisation, batteries, F-gas, utility, fire, landlord)', 'mig-permits', { standard: 'WEEE, F-gas regulation, NIST 800-88' }), scopes: M },
    { rule: R('R-MIG-08', 'migration', 'hard', 'Critical services move by replication or re-platforming, never lift and shift', 'mig-critical'), scopes: M },
    { rule: R('R-MIG-09', 'migration', 'hard', 'No clash with maintenance windows or open changes on the same equipment', 'wave-clash'), scopes: M },
    { rule: R('R-MIG-10', 'migration', 'hard', 'Every live device and service is in exactly one wave', 'wave-coverage'), scopes: M },
    { rule: R('R-MIG-11', 'migration', 'hard', 'Redundant pairs never move in the same wave', 'wave-ha-split'), scopes: M },
    { rule: R('R-MIG-12', 'migration', 'hard', 'Each wave\'s device work fits one window at the crew rate', 'wave-fits-window'), scopes: M },
    { rule: R('R-MIG-13', 'migration', 'soft', 'Open decommission changes at the site are linked to the plan', 'mig-linked-changes'), scopes: M },
  ],
  // A site being emptied has no fabric, density or IT purchase to size.
  exclude: { migration: ['densityKwPerRack', 'hallDesignKw', 'floorLoadingKgPerRack', 'racksPerLeafPair', 'uplinksPerLeaf', 'uplinkGbps', 'oversubscription', 'carrierCount', 'operatorOwnedIt', 'refreshYears', 'securityZones', 'contingencyPct', 'itCapexPerRack'] },
  dropRules: { migration: ['R-SPC-01', 'R-SPC-02', 'R-NET-01', 'R-NET-02', 'R-FIN-01', 'R-SCH-02'] },
  outputs: { migration: ['Inventory and disposition register', 'Wave schedule and cut-over runbook', 'Customer consent register', 'Circuit, contract and address exit plan', 'Compliance and permits', 'Cost and savings case', 'Closure checklist'] },
  enrich(S, plans) { enrichMigration(S, plans); },
};

/* ================================================================== PLN-0006 */
const DAY = 864e5;
const at22 = (S: Seed, days: number) => { const d = new Date(S.now + days * DAY); d.setUTCHours(22, 0, 0, 0); return d; };
/** Next change night (Tue, Wed, Thu or Sat) at or after `days` from now. */
const night = (S: Seed, days: number) => { const d = at22(S, days); while (![2, 3, 4, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d; };

function enrichMigration(S: Seed, plans: T.PlannerPlan[]) {
  const p = plans.find(x => x.plnId === 'PLN-0006' && x.scope === 'migration'); if (!p || !p.dataCenterId) return;
  const src = S.dataCenters.find(d => d.id === p.dataCenterId); const tgt = S.siteByKey('DUB-CO1');
  if (!src || !tgt) return;
  const owner = S.byRole('Program Manager');
  // The site is still Decommissioning with live equipment: the plan is executing, not completed.
  p.status = 'Executing'; p.peerDataCenterId = tgt.id;
  p.params = { ...p.params, migrationMode: 'consolidation', crewDevicesPerHour: 4, cutoverWindowHours: 6, customerNoticeDays: 30, handbackWeeks: 6, siteStaffFte: 0.5, siteMaintenanceUsdYear: 9000, costContingencyPct: 15 };
  for (const k of ['migrationMode', 'crewDevicesPerHour', 'customerNoticeDays', 'handbackWeeks', 'siteStaffFte', 'siteMaintenanceUsdYear', 'costContingencyPct']) p.paramSources = { ...p.paramSources, [k]: 'user' };

  const devices = S.devices.filter(d => d.dataCenterId === src.id && d.lifecycleState !== 'Disposed');
  const live = (d: T.Device) => d.lifecycleState === 'Active' || d.lifecycleState === 'Installed' || d.lifecycleState === 'Maintenance';
  const services = S.services.filter(s => s.dataCenterId === src.id && s.status !== 'Disabled');
  const racks = S.racks.filter(r => r.dataCenterId === src.id);
  const circuits = [...new Set(S.circuitTerminations.filter(t => t.dataCenterId === src.id).map(t => t.circuitId))].map(id => S.circuits.find(c => c.id === id)).filter((c): c is T.Circuit => !!c && c.status !== 'Decommissioned');
  const zones = new Set(S.coolingZones.filter(z => z.dataCenterId === src.id).map(z => z.id));

  // Dispositions: what was retired goes to certified disposal; live equipment and services move; network and power kit at the source is retired with the site.
  const dsp: T.PlannerDispositionRow[] = [];
  const add = (recordType: T.PlannerDispositionRow['recordType'], recordId: string, label: string, disposition: T.PlannerDisposition, extra: Partial<T.PlannerDispositionRow> = {}) => dsp.push({ recordType, recordId, label, disposition, ...extra });
  /* the site's own operator servers (telco NMS / AAA / NFV hosts, the colocation operator's DCIM / BMS / CCTV; owner team other than the
     platform team) carry no customer service: they are retired with the site in the close-out wave, as its network and power kit is */
  const onService = new Set(services.flatMap(s => [s.deviceId, ...(s.pathDeviceIds ?? [])]).filter((id): id is string => !!id));
  const siteSystem = (d: T.Device) => (d.category === 'Server' || d.category === 'Storage') && !!d.ownerTeam && !['Platform engineering', 'Tenant'].includes(d.ownerTeam) && !onService.has(d.id);
  for (const d of devices) add('device', d.id, d.name, d.lifecycleState === 'Retired' ? 'dispose' : !live(d) ? 'move' : d.category === 'PDU' || d.category === 'UPS' ? 'retire' : siteSystem(d) ? 'retire' : d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage' ? 'move' : 'retire', { targetRef: live(d) && !siteSystem(d) ? tgt.id : undefined });
  for (const r of racks.filter(x => x.status !== 'Retired')) add('rack', r.id, r.name, 'retire');
  for (const s of services) add('service', s.id, s.name, 'move', { targetRef: tgt.id });
  for (const c of circuits) add('circuit', c.id, c.cid, 'cease', { notes: 'Dublin CO-1 already has diverse carriers; cease rather than re-terminate' });
  for (const s of S.subnets.filter(x => x.dataCenterId === src.id && x.status !== 'Container' && x.status !== 'Deprecated')) add('subnet', s.id, s.cidr, 'release');
  for (const v of S.vlans.filter(x => x.dataCenterId === src.id && x.status !== 'Unused')) add('vlan', v.id, `VLAN ${v.vlanNumber}`, 'release');
  for (const c of S.contracts.filter(x => x.dataCenterId === src.id && x.status === 'Active')) add('contract', c.id, c.ctrId, 'end');
  for (const u of S.upsUnits.filter(x => x.dataCenterId === src.id)) add('plant', u.id, `UPS ${u.name}`, 'dispose');
  for (const c of S.cracUnits.filter(x => zones.has(x.coolingZoneId))) add('plant', c.id, `${c.type} ${c.name}`, 'retire');
  for (const g of S.generators.filter(x => x.dataCenterId === src.id)) add('plant', g.id, `Generator ${g.name}`, 'retire');
  for (const c of S.chillers.filter(x => x.dataCenterId === src.id)) add('plant', c.id, `Chiller ${c.name}`, 'retire');
  for (const f of S.utilityFeeds.filter(x => x.dataCenterId === src.id)) add('plant', f.id, `Utility feed ${f.name}`, 'cease');
  p.dispositions = dsp;

  // Consent: every customer notified and agreed (premium customers with 90 days' notice).
  const byCust = new Map<string, T.Service[]>(); for (const s of services) byCust.set(s.customerRef, [...(byCust.get(s.customerRef) ?? []), s]);
  p.consents = [...byCust.entries()].map(([ref, ss]) => { const cu = S.customers.find(c => c.id === ref); const prem = !!cu?.premium; return { customerRef: ref, customerName: cu?.name ?? ref, serviceIds: ss.map(s => s.id), noticeDays: prem ? 90 : 30, notifiedAt: S.daysAgo(prem ? 100 : 60), consentAt: S.daysAgo(prem ? 80 : 45), status: 'Consented' as const, accountManager: cu?.accountManager }; });

  // Waves: 1 retired kit (closed a month ago), 2 the services and their servers, 3 everything else and the close-out.
  const retired = devices.filter(d => d.lifecycleState === 'Retired');
  const svcDevs = [...new Set(services.flatMap(s => [s.deviceId, ...(s.pathDeviceIds ?? [])]).filter((id): id is string => !!id && devices.some(d => d.id === id && live(d) && (d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage'))))];
  const rest = devices.filter(d => !retired.includes(d) && !svcDevs.includes(d.id) && (live(d) || !d.rackId)).map(d => d.id);
  const w1s = at22(S, -31), w2s = night(S, 12), w3s = night(S, 26);
  const h = (d: Date, hours: number) => new Date(d.getTime() + hours * 3600e3).toISOString();
  const rk = (ids: string[]) => [...new Set(ids.map(id => devices.find(d => d.id === id)?.rackId).filter((x): x is string => !!x))];
  const kw = (ids: string[]) => Math.round(ids.reduce((a, id) => { const d = devices.find(x => x.id === id); return a + (d && live(d) ? (d.powerDrawW ?? 0) / 1000 : 0); }, 0) * 10) / 10;
  const waves: T.PlannerWave[] = [
    { id: 'W-1', name: 'Wave 1 · retired equipment out', order: 1, kind: 'pilot', deviceIds: retired.map(d => d.id), rackIds: racks.filter(r => r.status === 'Retired').map(r => r.id), serviceIds: [], method: 'Retire', windowStart: w1s.toISOString(), windowEnd: h(w1s, 6), crewHours: 4, rollback: 'Nothing to roll back: the equipment was already out of service.', acceptance: 'Equipment powered down, tagged and collected in sealed bags; racks empty.', status: 'Closed', closedAt: S.daysAgo(30), closedBy: owner.name, actualDowntimeMin: 0, itKw: 0, notes: 'Disposal vendor collected the drives; certificate pending' },
    { id: 'W-2', name: 'Wave 2 · services to Dublin CO-1', order: 2, kind: 'wave', deviceIds: svcDevs, rackIds: rk(svcDevs), serviceIds: services.map(s => s.id), targetRackIds: [], method: 'Lift and shift', windowStart: w2s.toISOString(), windowEnd: h(w2s, 6), crewHours: 3, rollback: 'Rollback: if the equipment fails its checks at the target, it is transported back and re-racked in its recorded position; the source rack and its feeds stay live until the wave is accepted.', acceptance: 'Service owners confirm the service at the target; monitoring green; source copy kept until sign-off.', status: 'Scheduled', itKw: kw(svcDevs) },
    { id: 'W-3', name: 'Wave 3 · network, power and site close-out', order: 3, kind: 'drain', deviceIds: rest, rackIds: rk(rest), serviceIds: [], circuitIds: circuits.map(c => c.id), method: 'Retire', windowStart: w3s.toISOString(), windowEnd: h(w3s, 6), crewHours: 4, rollback: 'Network and power at the source stay up until wave 2 is accepted; nothing is removed while a service depends on it.', acceptance: 'Owners confirm nothing depends on the site; equipment powered down and tagged for disposal; circuits ceased with the carrier.', status: 'Scheduled', itKw: kw(rest) },
  ];
  // Records execution created: the programme, a change and a window per wave, the disposal certificate of wave 1.
  const progId = S.nid('PROG');
  const total = Math.round(kw(svcDevs) + kw(rest));
  S.programs.push({ id: progId, progId, ...S.meta(owner), name: p.title, type: 'Decommissioning', objective: p.intent, status: 'Active', ownerName: owner.name, budget: 95000, startDate: S.daysAgo(45), endDate: new Date(new Date(waves[2].windowEnd).getTime() + 6 * 7 * DAY).toISOString(), projectCount: 0, plannerPlanId: p.id } as T.Program);
  const chgIds: string[] = []; const mwIds: string[] = [];
  for (const w of waves) {
    const chgId = S.nid('CHG');
    S.changeRequests.push({ id: chgId, chgId, ...S.meta(owner), title: `${p.title} · ${w.name}`, type: w.id === 'W-2' ? 'ServerRelocation' : 'Decommission', description: `Raised from plan ${p.plnId}. ${w.method}. ${w.deviceIds.length} devices, ${w.serviceIds.length} services.`, risk: 'Medium', status: w.status === 'Closed' ? 'Closed' : 'Approved', priority: 'Medium', affectedResourceType: 'Asset', affectedResourceIds: w.deviceIds, dataCenterId: src.id, requestedBy: owner.name, requestedById: owner.id, policyViolations: [], scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, implementedAt: w.status === 'Closed' ? w.closedAt : undefined, rollbackPlan: w.rollback, plannerPlanId: p.id, plannerWaveId: w.id } as T.ChangeRequest);
    const mwId = S.nid('MW');
    S.maintenanceWindows.push({ id: mwId, mwId, ...S.meta(owner), title: `${p.title} · ${w.name}`, status: w.status === 'Closed' ? 'Completed' : 'Scheduled', dataCenterId: src.id, changeRequestId: chgId, scheduledStart: w.windowStart, scheduledEnd: w.windowEnd, affectedDeviceIds: w.deviceIds, impact: w.serviceIds.length ? `${w.serviceIds.length} services move to ${tgt.code}; customers consented` : 'No customer service affected', owner: owner.name, plannerPlanId: p.id, plannerWaveId: w.id } as T.MaintenanceWindow);
    w.changeRequestId = chgId; w.maintenanceWindowId = mwId; chgIds.push(chgId); mwIds.push(mwId);
  }
  // Open decommission changes already raised at the site are linked to the plan.
  for (const c of S.changeRequests.filter(x => x.dataCenterId === src.id && x.type === 'Decommission' && !x.plannerPlanId && ['Submitted', 'UnderReview', 'Approved', 'Scheduled', 'InProgress'].includes(x.status))) { c.plannerPlanId = p.id; chgIds.push(c.id); }
  const dataBearing = retired.filter(d => d.category === 'Server' || d.category === 'GPU-Node' || d.category === 'Storage');
  const certId = S.nid('CERT');
  S.disposalCertificates.push({ id: certId, certId, ...S.meta(owner), plannerPlanId: p.id, plannerWaveId: 'W-1', dataCenterId: src.id, vendorName: 'CBRE Data Center Solutions', method: 'Purge (NIST 800-88)', items: dataBearing.map(d => ({ deviceId: d.id, serial: d.serial, assetTag: d.assetTag, model: d.model, drives: d.category === 'Storage' ? 24 : d.category === 'GPU-Node' ? 8 : 4 })), collectedAt: S.daysAgo(29), status: 'Collected', notes: 'Sealed bags collected; the vendor certificate follows after sanitisation' } as T.DisposalCertificate);
  p.waves = waves;
  p.programId = progId;
  p.artefacts = { createdAt: S.daysAgo(40), completedAt: S.daysAgo(40), vehicle: 'programme', programId: progId, purchaseOrderIds: [], subnetIds: [], vlanIds: [], permitIds: [], designDocIds: [], changeRequestIds: chgIds, maintenanceWindowIds: mwIds, certificateIds: [certId], steps: { vehicle: 'done', bom: 'done', 'purchase-orders': 'done', holds: 'done', ip: 'done', permits: 'done', 'design-docs': 'done', scope: 'done' } };
  // Compliance steps for a site with a UPS, a DX cooling unit and its own utility feed.
  const need = (i: number, name: string, authority: string, leadWeeks: number, before: Date, status: T.PlannerPermit['status']): T.PlannerPermit => ({ id: `PM${i}`, name, authority, leadWeeks, neededBefore: before.toISOString(), status });
  const close = new Date(new Date(waves[2].windowEnd).getTime() + 14 * DAY);
  p.permits = [
    need(1, 'Data sanitisation certificates', 'Information security', 4, close, 'In review'),
    need(2, 'Battery hazardous waste consignment', 'Environment agency', 4, close, 'Applied'),
    need(3, 'F-gas refrigerant recovery record', 'Environment agency (certified contractor)', 3, close, 'Applied'),
    need(4, 'Utility disconnection and final meter reading', 'Distribution operator', 8, new Date(close.getTime() + 21 * DAY), 'Applied'),
    need(5, 'Fire system decommission certificate', 'Fire authority', 4, new Date(close.getTime() + 14 * DAY), 'Not started'),
    need(6, 'Landlord notice and handback (schedule of condition)', 'Landlord', 12, new Date(close.getTime() + 28 * DAY), 'Approved'),
  ];
  p.designPowerKw = Math.max(1, total);
  p.params = { ...p.params, racksToMove: Math.ceil(svcDevs.reduce((a, id) => a + Math.max(1, devices.find(d => d.id === id)?.heightU ?? 1), 0) / 34) };
  const weights = waves.map(w => Math.max(0.001, w.itKw ?? 0)); const sum = weights.reduce((a, b) => a + b, 0); let left = p.designPowerKw;
  p.phases = waves.map((w, i) => { const v = i === waves.length - 1 ? left : Math.round((p.designPowerKw * weights[i]) / sum); left -= v; return { id: w.id, name: w.name, goLive: w.windowEnd, itKw: v, halls: 0, racks: w.rackIds.length, status: w.status === 'Closed' ? 'Live' as const : 'Approved' as const }; });
  p.targetGoLive = close.toISOString();
}
