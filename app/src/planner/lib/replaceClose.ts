/**
 * Closing a wave — the record changes that make the platform match what was done.
 *
 * closeWave() is pure: it returns the creates and updates (and the plan patch) for one wave;
 * the plan page applies them through the database. It refuses a wave whose burn-in or
 * acceptance test is not signed. replaceCloseout() is the family's completion checklist, read
 * live from the platform.
 */
import type * as T from '../p2b/types';
import type { CloseoutCheck } from './scopes/types';
import { byId, groupBy, type PlannerData } from './plannerData';
import { effectiveMapping, oldW, planUnits, roleOf, type NewUnit, type ReplaceScope } from './replaceCore';
import { swapMethodOf, freePositionsInRow, outletPlan } from './replaceRack';
import { criticalDevices } from './replaceCore';

export interface RecordChanges {
  creates: { entity: string; rec: Record<string, unknown> }[];
  updates: { entity: string; id: string; patch: Record<string, unknown> }[];
  /** Patch for the plan (waves, artefacts). */
  plan: Partial<T.PlannerPlan>;
  errors: string[]; warnings: string[]; summary: string[];
  /** Manual follow-ups the platform cannot do itself (labels, monitoring). */
  tasks: string[];
}
export interface CloseWaveInput {
  at: string; by: string; actualDowntimeMin?: number; notes?: string;
  /** Disposal vendor's certificate reference; without it the certificate stays Collected until issued. */
  certificateRef?: string;
  /** The burn-in / acceptance test was witnessed and passed. */
  atpAccepted?: boolean;
  /** Sequential ids for new records (the page passes nextId). */
  idFor?: (entity: string, prefix: string) => string;
  /** Records outside the planner bundle that the close also updates. */
  extra?: { configChanges?: T.ConfigChange[]; managedDevices?: T.ManagedDevice[]; atps?: T.Atp[] };
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 864e5;
const CLOSED_CHANGE: T.ChangeRequest['status'][] = ['Implemented', 'Closed'];

function base(plan: T.PlannerPlan, waveId: string, input: CloseWaveInput) {
  const out: RecordChanges = { creates: [], updates: [], plan: {}, errors: [], warnings: [], summary: [], tasks: [] };
  let n = 0;
  const id = (entity: string, prefix: string) => input.idFor?.(entity, prefix) ?? `${prefix}-${plan.plnId}-${waveId}-${++n}`;
  const upd = (entity: string, rid: string, patch: Record<string, unknown>) => { const e = out.updates.find(u => u.entity === entity && u.id === rid); if (e) Object.assign(e.patch, patch); else out.updates.push({ entity, id: rid, patch: { ...patch, updatedAt: input.at } }); };
  const make = (entity: string, prefix: string, rec: Record<string, unknown>) => { const rid = id(entity, prefix); out.creates.push({ entity, rec: { ...rec, id: rid, plannerPlanId: plan.id, createdAt: input.at, updatedAt: input.at, createdBy: input.by, createdById: 'me', customerId: 'CUST-001', isDeleted: false } }); return rid; };
  return { out, upd, make };
}

/** Change, window and acceptance test of the wave: closed, completed, accepted (or an error when the test is not signed). */
function closeVehicle(data: PlannerData, w: T.PlannerWave, input: CloseWaveInput, out: RecordChanges, upd: (e: string, id: string, p: Record<string, unknown>) => void) {
  const atp = w.atpId ? (input.extra?.atps ?? data.atps).find(a => a.id === w.atpId) : undefined;
  if (w.atpId && atp?.status !== 'Accepted' && !input.atpAccepted) out.errors.push(`Acceptance test ${w.atpId} is ${atp?.status ?? 'missing'}; it must be witnessed and accepted before the wave closes`);
  if (atp && atp.status !== 'Accepted' && input.atpAccepted) upd('atps', atp.id, { status: 'Accepted', acceptedAt: input.at, witnessedBy: input.by });
  const chg = w.changeRequestId ? byId(data, 'changeRequests', w.changeRequestId) : undefined;
  if (chg && !CLOSED_CHANGE.includes(chg.status)) upd('changeRequests', chg.id, { status: 'Closed', implementedAt: input.at });
  if (w.changeRequestId && !chg) out.warnings.push(`Change ${w.changeRequestId} not found`);
  const mw = w.maintenanceWindowId ? data.maintenanceWindows.find(x => x.id === w.maintenanceWindowId) : undefined;
  if (mw && mw.status !== 'Completed') upd('maintenanceWindows', mw.id, { status: 'Completed' });
}

/** Units of the plan, reconstructed exactly as the analysis places them. */
export function unitsOf(data: PlannerData, plan: T.PlannerPlan): NewUnit[] {
  const old = String(plan.params.affectedIds ?? '').split(',').filter(Boolean).map(id => byId(data, 'devices', id)).filter((d): d is T.Device => !!d);
  const mapping = effectiveMapping(data, plan, old, { replacementModel: plan.params.replacementModel as string | undefined, consolidationRatio: Number(plan.params.consolidationRatio ?? 2), oldEquipment: plan.params.oldEquipment as string | undefined });
  const crit = criticalDevices(data, old.map(d => d.id), plan.scope === 'network-refresh');
  return planUnits(data, plan, mapping, { parallelAll: plan.params.migrationApproach === 'Parallel run, then switch', parallelDeviceIds: crit.ids, network: plan.scope === 'network-refresh' });
}

/**
 * Close one wave of a server or network refresh, or a rack replacement. Returns the record
 * changes; nothing is written here.
 */
export function closeWave(plan: T.PlannerPlan, waveId: string, data: PlannerData, input: CloseWaveInput): RecordChanges {
  const { out, upd, make } = base(plan, waveId, input);
  const w = (plan.waves ?? []).find(x => x.id === waveId);
  if (!w) { out.errors.push(`Wave ${waveId} not found`); return out; }
  if (w.status === 'Closed') { out.errors.push(`${w.name} is already closed`); return out; }
  if (w.status === 'Cancelled') { out.errors.push(`${w.name} was cancelled`); return out; }
  closeVehicle(data, w, input, out, upd);
  const certItems: NonNullable<T.DisposalCertificate['items']> = [];
  const scope = plan.scope as ReplaceScope;
  if (scope === 'rack-replace') closeRacks(plan, w, data, input, out, upd, make, certItems);
  else closeRefresh(plan, w, data, input, out, upd, make, certItems);
  let certId: string | undefined;
  if (certItems.length) {
    certId = make('disposalCertificates', 'CERT', {
      certId: undefined, plannerWaveId: w.id, dataCenterId: plan.dataCenterId, vendorName: 'CBRE Data Center Solutions',
      method: scope === 'rack-replace' ? 'Recycle (no data)' : scope === 'network-refresh' ? 'Purge (NIST 800-88)' : 'Purge (NIST 800-88)',
      items: certItems, collectedAt: input.at, issuedAt: input.certificateRef ? input.at : undefined, status: input.certificateRef ? 'Issued' : 'Collected', reference: input.certificateRef,
      notes: `Chain of custody: sealed and collected at the end of ${w.name}, witnessed by ${input.by}`,
    });
    const c = out.creates.find(x => x.rec.id === certId); if (c) c.rec.certId = certId;
    out.summary.push(`Disposal certificate ${certId} (${certItems.length} item${certItems.length === 1 ? '' : 's'}, ${input.certificateRef ? 'issued' : 'collected, waiting for the vendor certificate'})`);
  }
  const waves = (plan.waves ?? []).map(x => (x.id === w.id ? { ...x, status: 'Closed' as const, closedAt: input.at, closedBy: input.by, actualDowntimeMin: input.actualDowntimeMin, notes: [x.notes, input.notes].filter(Boolean).join(' · ') || undefined } : x));
  out.plan = { waves, artefacts: plan.artefacts ? { ...plan.artefacts, certificateIds: [...(plan.artefacts.certificateIds ?? []), ...(certId ? [certId] : [])] } : plan.artefacts };
  if (out.errors.length) { out.creates = []; out.updates = []; out.plan = {}; }
  return out;
}

type Upd = (e: string, id: string, p: Record<string, unknown>) => void;
type Make = (e: string, prefix: string, rec: Record<string, unknown>) => string;

function closeRefresh(plan: T.PlannerPlan, w: T.PlannerWave, data: PlannerData, input: CloseWaveInput, out: RecordChanges, upd: Upd, make: Make, certItems: NonNullable<T.DisposalCertificate['items']>) {
  const units = unitsOf(data, plan).filter(u => u.oldIds.some(id => w.deviceIds.includes(id)));
  const mapping = new Map((plan.mapping ?? []).map(m => [m.id, m]));
  const disp = (d: T.Device) => mapping.get(`${d.model ?? 'Unknown model'}|${roleOf(d)}`)?.disposition ?? (plan.params.oldEquipment === 'Keep as spares' ? 'keep' : plan.params.oldEquipment === 'Resell' ? 'resell' : 'dispose');
  const network = plan.scope === 'network-refresh';
  // New device records: planned purchases tagged with the unit, then stock reserved for the plan, else a new record.
  const mine = data.devices.filter(d => d.plannerPlanId === plan.id && !d.rackId && d.lifecycleState !== 'Active');
  const taken = new Set<string>();
  const newOf = new Map<string, string>();
  const warranty = new Map<string, string>();
  const vendorOf = (model: string) => { const am = data.assetModels.find(m => m.model === model); return data.vendors.find(v => am && v.name.toLowerCase().startsWith(am.manufacturer.toLowerCase().split(' ')[0])); };
  for (const u of units) {
    const tagged = mine.find(d => !taken.has(d.id) && String(d.notes ?? '').includes(`unit ${u.id} `));
    const stock = tagged ?? mine.find(d => !taken.has(d.id) && d.model === u.model && (d.lifecycleState === 'Staged' || d.lifecycleState === 'Received'));
    const lead = byId(data, 'devices', u.oldIds[0]);
    const v = vendorOf(u.model);
    let wid = v ? warranty.get(v.id) ?? data.contracts.find(c => c.type === 'Warranty' && c.vendorId === v.id && String(c.description ?? '').includes(plan.plnId))?.id : undefined;
    if (v && !wid) {
      const years = 3;
      wid = make('contracts', 'CTR', { ctrId: undefined, vendorId: v.id, type: 'Warranty', startDate: input.at, endDate: new Date(new Date(input.at).getTime() + years * 365 * DAY).toISOString(), value: 0, annualValue: 0, status: 'Active', dataCenterId: plan.dataCenterId, description: `${years}-year hardware warranty included with the ${u.model} units bought under ${plan.plnId}` });
      const c = out.creates.find(x => x.rec.id === wid); if (c) { c.rec.ctrId = wid; delete c.rec.plannerPlanId; }
      warranty.set(v.id, wid);
    }
    const patch: Record<string, unknown> = { lifecycleState: 'Active', status: 'Active', rackId: u.rackId, position: u.startU, dataCenterId: plan.dataCenterId, primaryIp4: u.keepIp4, oobIp: u.keepOob, hostname: u.keepHostname ?? lead?.hostname, commissionedDate: input.at, warrantyContractId: wid, plannerPlanId: plan.id, notes: `Installed in ${w.name} of ${plan.plnId}; replaces ${u.oldIds.map(id => byId(data, 'devices', id)?.name ?? id).join(', ')}` };
    let nid: string;
    if (stock) { nid = stock.id; taken.add(stock.id); upd('devices', nid, patch); }
    else {
      const am = data.assetModels.find(m => m.model === u.model);
      nid = make('devices', 'ASSET', { devcId: undefined, name: u.keepHostname ?? `${lead?.name ?? 'new'}-n`, deviceTypeId: lead?.deviceTypeId ?? '', model: u.model, manufacturer: am?.manufacturer, category: am?.category, heightU: am?.heightU, powerDrawW: am?.typicalPowerW, weightKg: am?.weightKg, assetModelId: am?.id, deviceRoleId: lead?.deviceRoleId, airflow: lead?.airflow, ...patch });
      const c = out.creates.find(x => x.rec.id === nid); if (c) c.rec.devcId = nid;
      out.warnings.push(`No planned or stock record for unit ${u.id}; a device record was created`);
    }
    for (const o of u.oldIds) newOf.set(o, nid);
  }
  // Old devices: out of the rack; retired (disposed once the vendor certificate is in), kept as depot spares, or resold.
  for (const id of w.deviceIds) {
    const d = byId(data, 'devices', id); if (!d) continue;
    const how = disp(d);
    const common = { rackId: undefined, position: undefined, decommissionDate: input.at, plannerPlanId: plan.id };
    if (how === 'keep') upd('devices', id, { ...common, lifecycleState: 'Staged', status: 'Offline', dataCenterId: undefined, notes: `Spare from ${plan.plnId} (${w.name}); wiped before re-use` });
    else {
      upd('devices', id, { ...common, lifecycleState: input.certificateRef ? 'Disposed' : 'Retired', status: 'Offline', notes: `${how === 'resell' ? 'For resale' : 'For certified disposal'} from ${plan.plnId} (${w.name})` });
      certItems.push({ deviceId: id, serial: d.serial, assetTag: d.assetTag, model: d.model, drives: d.category === 'Storage' ? 24 : d.category === 'GPU-Node' ? 8 : d.category === 'Server' ? 4 : 0 });
    }
  }
  // Services: repoint every reference to an old device onto its replacement.
  let repointed = 0;
  for (const s of data.services) {
    const path = s.pathDeviceIds ?? [];
    if (!(s.deviceId && newOf.has(s.deviceId)) && !path.some(p => newOf.has(p))) continue;
    upd('services', s.id, { deviceId: s.deviceId && newOf.has(s.deviceId) ? newOf.get(s.deviceId) : s.deviceId, pathDeviceIds: [...new Set(path.map(p => newOf.get(p) ?? p))] });
    repointed++;
  }
  // Racks: power, space and weight after the swap; the plan's holds on them are consumed.
  const amOf = (model?: string) => data.assetModels.find(m => m.model === model);
  const racks = new Set([...w.deviceIds.map(id => byId(data, 'devices', id)?.rackId), ...units.map(u => u.rackId)].filter(Boolean) as string[]);
  for (const rid of racks) {
    const r = byId(data, 'racks', rid); if (!r) continue;
    const outD = w.deviceIds.map(id => byId(data, 'devices', id)).filter((d): d is T.Device => !!d && d.rackId === rid);
    const inU = units.filter(u => u.rackId === rid);
    const kw = r1(Math.max(0, r.currentPowerKw - outD.reduce((s, d) => s + oldW(d, amOf(d.model)), 0) / 1000 + inU.reduce((s, u) => s + u.typicalKw, 0)));
    const usedU = Math.max(0, r.usedU - outD.reduce((s, d) => s + Math.max(1, d.heightU ?? 1), 0) + inU.reduce((s, u) => s + u.heightU, 0));
    upd('racks', rid, { currentPowerKw: kw, powerUtilizationPct: r.maxPowerKw ? Math.round((kw / r.maxPowerKw) * 100) : 0, usedU, availableU: Math.max(0, r.heightU - usedU), currentWeightKg: r1(Math.max(0, r.currentWeightKg - outD.reduce((s, d) => s + (d.weightKg ?? 0), 0) + inU.reduce((s, u) => s + u.weightKg, 0))), thermalDensityKwPerRack: kw });
    for (const h of data.capacityReservations.filter(x => x.plannerPlanId === plan.id && (x.resourceId === rid || x.label?.includes(r.name)) && (x.state === 'Reserved' || x.state === 'Committed'))) upd('capacityReservations', h.id, { state: 'Consumed' });
    for (const rr of data.rackReservations.filter(x => x.plannerPlanId === plan.id && x.rackId === rid && x.status === 'Active')) upd('rackReservations', rr.id, { status: 'Released' });
  }
  if (network) {
    for (const cc of input.extra?.configChanges ?? []) if (w.deviceIds.includes(cc.deviceId) || [...newOf.values()].includes(cc.deviceId)) if (cc.plannerPlanId === plan.id && cc.status !== 'Verified') upd('configChanges', cc.id, { status: 'Verified', pushedAt: input.at, pushedBy: input.by });
    for (const md of input.extra?.managedDevices ?? []) if (md.assetId && newOf.has(md.assetId)) { const nd = newOf.get(md.assetId)!; const unit = units.find(u => u.oldIds.includes(md.assetId!)); upd('managedDevices', md.id, { assetId: nd, model: unit?.model ?? md.model, vendor: amOf(unit?.model)?.manufacturer ?? md.vendor }); }
    out.tasks.push('Relabel the patched cables at both ends', 'Confirm monitoring polls the new switches (SNMP, syslog, streaming telemetry)');
  }
  out.summary.push(`${units.length} new device${units.length === 1 ? '' : 's'} active`, `${w.deviceIds.length} old device${w.deviceIds.length === 1 ? '' : 's'} out of the racks`, `${repointed} service${repointed === 1 ? '' : 's'} repointed`, `${racks.size} rack${racks.size === 1 ? '' : 's'} updated`);
}

function closeRacks(plan: T.PlannerPlan, w: T.PlannerWave, data: PlannerData, input: CloseWaveInput, out: RecordChanges, upd: Upd, make: Make, certItems: NonNullable<T.DisposalCertificate['items']>) {
  const newType = data.rackTypes.find(t => t.model === String(plan.params.rackModel ?? 'NetShelter SX 48U'));
  const outlets = outletPlan(data, w.rackIds, { replacePdus: plan.params.replacePdus !== false, c13PerStrip: 36, c19PerStrip: 6, stripKw: 22 });
  for (const rid of w.rackIds) {
    const old = byId(data, 'racks', rid); if (!old) continue;
    const method = swapMethodOf(plan, rid);
    const planned = data.racks.find(r => r.plannerPlanId === plan.id && (r.status === 'Planned' || r.status === 'Reserved') && String(r.notes ?? '').includes(`replaces ${old.id}`));
    const free = method === 'Next free position in the row' ? freePositionsInRow(data, old)[0] : undefined;
    const rating = outlets.find(o => o.rackId === rid)?.ratingAfterKw ?? old.maxPowerKw;
    const fields = { rackTypeId: newType?.id ?? old.rackTypeId, heightU: newType?.uHeight ?? old.heightU, outerWidthMm: newType?.outerWidthMm ?? old.outerWidthMm, outerDepthMm: newType?.outerDepthMm ?? old.outerDepthMm, mountingDepthMm: newType?.mountingDepthMm ?? old.mountingDepthMm, status: 'Active', maxPowerKw: rating, currentPowerKw: old.currentPowerKw, powerUtilizationPct: rating ? Math.round((old.currentPowerKw / rating) * 100) : 0, usedU: old.usedU, availableU: Math.max(0, (newType?.uHeight ?? old.heightU) - old.usedU), currentWeightKg: old.currentWeightKg - (data.rackTypes.find(t => t.id === old.rackTypeId)?.weight ?? 0) + (newType?.weight ?? 0), owner: old.owner, purpose: old.purpose, plannerPlanId: plan.id, notes: `Replaces ${old.name} (${old.id}) under ${plan.plnId}` };
    let nid: string;
    if (planned) { nid = planned.id; upd('racks', nid, fields); }
    else if (free) { nid = free.id; upd('racks', nid, { ...fields, name: free.name }); }
    else { nid = make('racks', 'RACK', { ...old, ...fields, rackId: undefined, name: old.name }); const c = out.creates.find(x => x.rec.id === nid); if (c) c.rec.rackId = nid; }
    upd('racks', old.id, { status: 'Retired', currentPowerKw: 0, powerUtilizationPct: 0, usedU: 0, availableU: old.heightU, notes: `Replaced by ${nid} under ${plan.plnId} (${w.name})` });
    const devices = (groupBy(data, 'devices', 'rackId').get(old.id) ?? []).filter(d => d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed');
    for (const d of devices) {
      if (d.category === 'PDU' && plan.params.replacePdus !== false) { upd('devices', d.id, { rackId: undefined, position: undefined, lifecycleState: 'Retired', decommissionDate: input.at, notes: `Old rack power strip removed under ${plan.plnId}` }); certItems.push({ deviceId: d.id, serial: d.serial, model: d.model }); continue; }
      upd('devices', d.id, { rackId: nid });
    }
    const nf = (groupBy(data, 'powerFeeds', 'rackId').get(nid) ?? []).length;
    if (!nf) for (const f of groupBy(data, 'powerFeeds', 'rackId').get(old.id) ?? []) upd('powerFeeds', f.id, { rackId: nid });
    for (const rr of data.rackReservations.filter(x => x.rackId === old.id && x.status === 'Active')) upd('rackReservations', rr.id, { rackId: nid, description: `${rr.description ?? ''} (moved from ${old.name} under ${plan.plnId})`.trim() });
    for (const s of data.services.filter(x => x.rackId === old.id)) upd('services', s.id, { rackId: nid });
    for (const h of data.capacityReservations.filter(x => x.resourceId === old.id && (x.state === 'Reserved' || x.state === 'Committed'))) upd('capacityReservations', h.id, holdPatch(h, nid, plan));
    certItems.push({ rackId: old.id, model: data.rackTypes.find(t => t.id === old.rackTypeId)?.model });
    out.summary.push(`${old.name}: retired; ${devices.length} devices moved to ${nid}${free ? ` in position ${free.name}` : ''}`);
  }
  out.tasks.push('Update rack elevation labels and the cross-connect records with the carrier');
}
const holdPatch = (h: T.CapacityReservation, nid: string, plan: T.PlannerPlan) => (h.plannerPlanId === plan.id ? { state: 'Consumed' } : { resourceId: nid });

/** Mark a collected certificate as issued; data-bearing devices on it become Disposed. */
export function issueCertificate(cert: T.DisposalCertificate, ref: string, at: string): RecordChanges {
  const out: RecordChanges = { creates: [], updates: [{ entity: 'disposalCertificates', id: cert.id, patch: { status: 'Issued', reference: ref, issuedAt: at, updatedAt: at } }], plan: {}, errors: [], warnings: [], summary: [`Certificate ${cert.certId} issued (${ref})`], tasks: [] };
  for (const i of cert.items) if (i.deviceId) out.updates.push({ entity: 'devices', id: i.deviceId, patch: { lifecycleState: 'Disposed', updatedAt: at } });
  return out;
}

/** Completion checklist of a replace plan, read live from the platform. */
export function replaceCloseout(plan: T.PlannerPlan, data: PlannerData): CloseoutCheck[] {
  const waves = (plan.waves ?? []).filter(w => w.status !== 'Cancelled');
  const open = waves.filter(w => w.status !== 'Closed');
  const certs = data.disposalCertificates.filter(c => c.plannerPlanId === plan.id);
  const pending = certs.filter(c => c.status !== 'Issued');
  const checks: CloseoutCheck[] = [
    { key: 'waves', label: 'Every wave closed', ok: waves.length > 0 && !open.length, detail: !waves.length ? 'The plan has no waves' : open.length ? `${open.length} of ${waves.length} open: ${open.map(w => w.name).join(', ')}` : `${waves.length} waves closed` },
    { key: 'certificates', label: 'Disposal certificates issued', ok: (certs.length > 0 && !pending.length) || (certs.length === 0 && plan.params.oldEquipment === 'Keep as spares'), detail: !certs.length ? 'No certificate yet' : pending.length ? `${pending.length} of ${certs.length} waiting for the vendor` : `${certs.length} issued` },
  ];
  const chg = data.changeRequests.filter(c => c.plannerPlanId === plan.id);
  checks.push({ key: 'changes', label: 'Changes closed', ok: chg.every(c => CLOSED_CHANGE.includes(c.status) || c.status === 'Cancelled'), detail: `${chg.filter(c => CLOSED_CHANGE.includes(c.status)).length} of ${chg.length} closed` });
  if (plan.scope === 'rack-replace') {
    const ids = String(plan.params.affectedIds ?? '').split(',').filter(Boolean);
    const live = ids.filter(id => byId(data, 'racks', id)?.status !== 'Retired');
    const stuck = ids.flatMap(id => (groupBy(data, 'devices', 'rackId').get(id) ?? []).filter(d => d.lifecycleState !== 'Retired' && d.lifecycleState !== 'Disposed'));
    checks.push({ key: 'old-racks', label: 'Old racks retired', ok: !live.length, detail: live.length ? `${live.length} still in service` : `${ids.length} retired` });
    checks.push({ key: 'devices-moved', label: 'Devices moved to the new racks', ok: !stuck.length, detail: stuck.length ? `${stuck.length} devices still in old racks` : 'All moved' });
    checks.push({ key: 'reservations', label: 'Rack reservations carried across', ok: !data.rackReservations.some(r => ids.includes(r.rackId) && r.status === 'Active'), detail: 'Active reservations point at the new racks' });
    return checks;
  }
  const old = String(plan.params.affectedIds ?? '').split(',').filter(Boolean).map(id => byId(data, 'devices', id)).filter((d): d is T.Device => !!d);
  const still = old.filter(d => d.rackId);
  checks.push({ key: 'old-out', label: 'Old devices out of the racks', ok: !still.length, detail: still.length ? `${still.length} of ${old.length} still racked` : `${old.length} removed` });
  const ids = new Set(old.map(d => d.id));
  const refs = data.services.filter(s => s.status !== 'Disabled' && ((s.deviceId && ids.has(s.deviceId)) || (s.pathDeviceIds ?? []).some(p => ids.has(p))));
  checks.push({ key: 'services', label: 'Services repointed to the new devices', ok: !refs.length, detail: refs.length ? `${refs.length} services still reference old devices` : 'No service references an old device' });
  const newActive = data.devices.filter(d => d.plannerPlanId === plan.id && d.lifecycleState === 'Active' && d.rackId && !ids.has(d.id));
  const units = (plan.mapping ?? []).reduce((s, m) => s + m.newUnits, 0);
  checks.push({ key: 'new-active', label: 'New devices active with a warranty', ok: units > 0 && newActive.length >= units && newActive.every(d => !!d.warrantyContractId), detail: `${newActive.length} of ${units} active${newActive.some(d => !d.warrantyContractId) ? ', some without a warranty contract' : ''}` });
  return checks;
}
