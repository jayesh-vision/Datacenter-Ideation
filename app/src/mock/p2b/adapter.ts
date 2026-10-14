/* Our estate as the records the P2B planner reads (its PlannerData collections). One estate (user, 13-Oct-2026): nothing here is
   invented beyond what the planner needs to size against a real site; every figure comes from the generated datacenters, the DCIM
   read model (halls, rows, racks, devices, rack PDUs) and the capacity holds.
   - Region → our region; Campus → one per datacenter city; DataCenter keeps our id (MH-DC-001…) so links work both ways.
   - Building / floors / halls / rows / racks / devices from dcimModel (same ids as the DCIM screens).
   - Power chain: utility feeds (AC feeds, A/B), one transformer per feed, the UPS modules, the DG set, rack PDUs.
   - Cooling: one zone per hall (the units serving it), CRAH / CRAC / CDU units, and chillers sized from the site's cooling plant
     (our model has no chiller records; the planner needs facility-water headroom for liquid plans).
   - Money: the planner model works in US dollars; our rupee figures are converted at the geography rate (₹50 = $1, `toUsd`).
   - Capacity holds that are not plans (planned devices, tenant contracts, GPU allocations) become capacity reservations. */
import type * as T from '../../planner/p2b/types';
import type { DcTypeKey } from '../../planner/p2b/enums';
import type { Db } from '../generate';
import { activeGeo } from '../geo';
import { dcimModel } from '../dcim';
import { capacityHolds } from '../capacity';
import { ipamModel } from '../ipam';

export const USD_RATE = 50;
/** a local amount (₹ in India, $ in the USA) in the planner's dollars */
export const toUsd = (local: number) => (activeGeo().id === 'us' ? local : local / USD_RATE);
const iso = (t: number) => new Date(t).toISOString();
const r1 = (n: number) => Math.round(n * 10) / 10;

export const PERSONA_DC_TYPE: Record<Db['persona'], DcTypeKey> = { network: 'regional-edge-dc', colocation: 'retail-colo', cloud: 'hyperscale-dc', enterprise: 'enterprise-dc', neocloud: 'ai-gpu-factory' };

export function adaptEstate(db: Db): Record<string, Record<string, unknown>[]> {
  const G = activeGeo();
  const meta = { customerId: 'CUST-001', createdAt: iso(db.now - 400 * 864e5), updatedAt: iso(db.now), createdBy: 'Estate import', createdById: 'system', isDeleted: false };
  const dm = dcimModel(db);
  const out: Record<string, Record<string, unknown>[]> = {};
  const push = (k: string, r: Record<string, unknown>) => { (out[k] ??= []).push({ ...meta, ...r }); };

  for (const r of db.regions) push('regions', { id: r.id, regId: r.id, enterpriseId: 'ENT-1', name: r.name, geo: G.country, campusCount: db.datacenters.filter(d => d.regionId === r.id).length });

  const status = (s: string): T.DataCenter['status'] => (s === 'planned' ? 'Planned' : s === 'in-progress' ? 'Construction' : 'Operational');
  const equip = (s: string): T.UPS['status'] => (/fault|failed/i.test(s) ? 'Failed' : /battery|bypass|maint/i.test(s) ? 'Degraded' : 'Operational');
  for (const dc of db.datacenters) {
    const site = dm.sites.find(s => s.id === dc.id);
    const campusId = `CMP-${dc.id}`;
    push('campuses', { id: campusId, cmpId: campusId, regionId: dc.regionId, name: dc.city, latitude: dc.lat, longitude: dc.lng, city: dc.city, country: G.country, dataCenterCount: 1 });
    const gpuSite = !![...(db.gpu?.nodes.values() ?? [])].some(n => n.dcId === dc.id);
    const typeKey: DcTypeKey = db.persona === 'neocloud' ? (gpuSite ? 'ai-gpu-factory' : 'hyperscale-dc') : (db.persona === 'cloud' || db.persona === 'enterprise') && gpuSite && dc.racks.some(r => r.liquid) ? 'ai-gpu-factory' : PERSONA_DC_TYPE[db.persona];
    push('dataCenters', {
      id: dc.id, dcId: dc.id, campusId, name: dc.name, code: dc.id, dcTypeKey: typeKey, tier: dc.tier, status: status(dc.status),
      designPowerKw: dc.power.capacityKw, designCoolingKw: dc.cooling.capacityKw, totalRacks: dc.racks.length, commissionedDate: dc.commissionedOn ? iso(dc.commissionedOn) : undefined, latitude: dc.lat, longitude: dc.lng,
    });
    const bId = `${dc.id}-B1`;
    push('buildings', { id: bId, bldId: bId, dataCenterId: dc.id, name: 'Main building', floorCount: dc.floors.length, grossAreaSqm: Math.round(Math.max(800, dc.racks.length * 2.6 * 2.2)) });
    dc.floors.forEach((f, fi) => {
      const fid = `${dc.id}-F${fi}`;
      push('floors', { id: fid, flrId: fid, buildingId: bId, name: f.name, level: fi, usableAreaSqm: Math.round(Math.max(300, dc.racks.filter(r => r.floor === f.name).length * 2.6 * 1.6)), floorLoadingKgSqm: 1200, hallCount: f.rooms.length });
    });

    /* power chain */
    const ac = dc.power.feeds.filter(f => f.type === 'AC');
    ac.forEach((f, i) => {
      const fid = `${dc.id}-${f.id}`;
      push('utilityFeeds', { id: fid, feedId: fid, dataCenterId: dc.id, name: f.source, capacityKw: f.capacityKw, voltage: f.capacityKw >= 4000 ? 33000 : 11000, provider: `${dc.state} distribution utility`, redundancyRole: i % 2 === 0 ? 'A-side' : 'B-side' });
      const xid = `${fid}-TX`;
      push('transformers', { id: xid, xfmrId: xid, feedId: fid, name: `TX-${i + 1}`, capacityKva: Math.round(f.capacityKw / 0.9), loadKw: f.loadKw, status: f.status === 'Alarm' ? 'Degraded' : 'Operational' });
    });
    const feedA = ac[0] ? `${dc.id}-${ac[0].id}` : undefined, feedB = ac[1] ? `${dc.id}-${ac[1].id}` : feedA;
    /* the UPS modules carry the IT load (rack draw); our loadPct only sets each module's share of it */
    const itKw = dc.racks.reduce((a, r) => a + r.drawKw, 0);
    const weight = dc.power.ups.reduce((a, u) => a + (u.state === 'Fault' ? 0 : u.capacityKw * u.loadPct), 0) || 1;
    for (const u of dc.power.ups) {
      const uid = `${dc.id}-${u.name}`;
      const aSide = /UPS-(2|4)\b/.test(u.name);
      const load = u.state === 'Fault' ? 0 : r1((itKw * u.capacityKw * u.loadPct) / weight);
      push('upsUnits', { id: uid, upsId: uid, dataCenterId: dc.id, name: u.name, capacityKw: u.capacityKw, loadKw: load, loadPct: u.capacityKw ? Math.round((load / u.capacityKw) * 100) : 0, redundancy: u.redundancy, runtimeMinutes: u.batteryMin, feedId: aSide ? feedA : feedB, status: equip(u.state) });
    }
    if (dc.power.dg.kva > 0) {
      const sets = dc.power.dg.kva >= 3000 ? 3 : 2;
      for (let i = 0; i < sets; i++) { const gid = `${dc.id}-DG-${i + 1}`; push('generators', { id: gid, genId: gid, dataCenterId: dc.id, name: `DG-${i + 1}`, capacityKva: Math.round(dc.power.dg.kva / (sets - 1)), capacityKw: Math.round((dc.power.dg.kva / (sets - 1)) * 0.8), fuelHours: dc.power.dg.runtimeH, redundancyRole: i === sets - 1 ? 'Redundant' : 'N', status: dc.power.dg.result === 'Fail' && i === 0 ? 'Degraded' : 'Operational' }); }
    }

    /* cooling: a zone per floor (units on a floor share its air, as in our physical model) */
    const halls = dm.halls.filter(h => h.dcId === dc.id);
    dc.floors.forEach((f, fi) => {
      const zid = `${dc.id}-F${fi}-CZ`;
      const units = dc.cooling.units.filter(u => u.zone.startsWith(`${f.name} · `));
      const cap = units.reduce((a, u) => a + u.capacityKw, 0), load = units.reduce((a, u) => a + (u.capacityKw * u.loadPct) / 100, 0);
      push('coolingZones', { id: zid, coolzId: zid, dataCenterId: dc.id, name: f.name, coolingCapacityKw: r1(cap), currentLoadKw: r1(load), headroomKw: r1(cap - load), setpointC: 24 });
      for (const u of units) push('cracUnits', { id: `${dc.id}-${u.id}`, cracId: `${dc.id}-${u.id}`, coolingZoneId: zid, name: u.name, capacityKw: u.capacityKw, type: u.type, status: u.status === 'Failed' ? 'Failed' : u.status === 'Maintenance' ? 'Maintenance' : 'Operational', supplyTempC: u.supplyC, returnTempC: u.returnC });
    });
    const air = dc.cooling.units.filter(u => u.type !== 'CDU');
    const airCap = air.reduce((a, u) => a + u.capacityKw, 0), airLoad = air.reduce((a, u) => a + (u.capacityKw * u.loadPct) / 100, 0);
    if (airCap > 0) for (let i = 0; i < 3; i++) { const cid = `${dc.id}-CH-${i + 1}`; push('chillers', { id: cid, chlrId: cid, dataCenterId: dc.id, name: `CH-${i + 1}`, type: 'Air-cooled chiller', capacityKw: Math.round(airCap / 2), loadKw: r1(airLoad / 3), supplyTempC: 14, status: 'Operational' }); }

    /* halls, rows, racks */
    for (const h of halls) {
      const rows = Math.max(4, h.gridRows % 2 ? h.gridRows + 1 : h.gridRows);
      const positions = Math.max(h.racks, h.gridCols * rows);
      const perRack = h.racks ? h.budgetKw / h.racks : 8;
      const fi = h.floorIdx;
      push('halls', { id: h.id, hallId: h.id, floorId: `${dc.id}-F${fi}`, dataCenterId: dc.id, name: h.name, gridCols: h.gridCols, gridRows: rows, designPowerKw: Math.round(positions * perRack), coolingZoneId: `${dc.id}-F${h.floorIdx}-CZ`, rackCount: h.racks, rackCapacity: positions, utilizationPct: h.budgetKw ? Math.round((h.drawKw / h.budgetKw) * 100) : 0, status: h.racks ? 'Live' : 'Shell', areaSqm: Math.round(positions * 2.6) });
    }
    void site;
  }
  for (const row of dm.rows) push('rows', { id: row.id, rowId: row.id, hallId: row.hallId, name: row.name, gridPosition: row.name.replace('Row ', ''), containment: row.containment === 'Cold aisle' ? 'Cold-Aisle' : 'None', rackCount: row.racks.length });
  const rtId = (u: number) => `RT-${u}U`;
  for (const u of [42, 45, 48]) push('rackTypes', { id: rtId(u), rtypeId: rtId(u), manufacturer: 'Rittal', model: `TS IT ${u}U 600 × 1200`, uHeight: u, widthIn: 19, outerWidthMm: 600, outerDepthMm: 1200, mountingDepthMm: 1070 });
  /* the planner catalogue's rack models (rack replacement picks one of these) */
  for (const [id, mfr, model, u] of [['RT-NETSHELTER-48', 'APC', 'NetShelter SX 48U', 48], ['RT-VR3300-42', 'Vertiv', 'VR3300 42U', 42], ['RT-TSIT-45', 'Rittal', 'TS IT 45U', 45]] as const)
    push('rackTypes', { id, rtypeId: id, manufacturer: mfr, model, uHeight: u, widthIn: 19, outerWidthMm: 600, outerDepthMm: 1200, mountingDepthMm: 1070 });
  for (const r of dm.racks) {
    const purpose: T.Rack['purpose'] = r.density === 'AI' ? 'GPU' : /storage/i.test(r.role) ? 'Storage' : /network|core|mmr|odf|patch/i.test(r.role) ? 'Network' : /compute|server/i.test(r.role) ? 'Compute' : 'Mixed';
    const st: T.Rack['status'] = r.devices === 0 && r.plannedDevices === 0 ? 'Planned' : r.devices === 0 ? 'Reserved' : r.powerPct >= 90 || r.freeU < 2 ? 'Full' : 'Active';
    push('racks', {
      id: r.id, rackId: r.id, rowId: r.rowId, hallId: r.hallId, dataCenterId: r.dcId, name: r.name, gridX: r.gridX, gridY: r.gridY, heightU: r.heightU, usedU: r.usedU, availableU: r.freeU,
      widthMm: 600, depthMm: 1200, maxWeightKg: r.maxWeightKg, currentWeightKg: r.weightKg, maxPowerKw: r.budgetKw, currentPowerKw: r.drawKw, powerUtilizationPct: r.powerPct,
      redundancy: r.power === 'A + B' || r.power === 'A + B · one side down' ? '2N' : 'N', coolingZoneId: `${r.dcId}-F${dm.hallById.get(r.hallId)?.floorIdx ?? 0}-CZ`, thermalDensityKwPerRack: r.budgetKw, purpose, status: st,
      liquidCoolingReady: r.liquid, owner: r.tenantName ?? 'Operator', rackTypeId: rtId([42, 45, 48].includes(r.heightU) ? r.heightU : 42),
    });
    for (const p of dm.pduByRack.get(r.id) ?? []) {
      push('pdus', { id: p.id, pduId: p.id, upsId: p.kind === 'AC' ? `${r.dcId}-${p.upstreamName}` : undefined, hallId: r.hallId, name: `${r.name} ${p.name}`, capacityKw: p.capacityKw, loadKw: p.loadKw, loadPct: p.capacityKw ? Math.round((p.loadKw / p.capacityKw) * 100) : 0, outletCount: p.outlets, outletsUsed: (dm.cordsByRack.get(r.id) ?? []).filter(c => c.pduId === p.id).length });
    }
  }
  const CAT: Record<string, T.Device['category']> = { Router: 'Router', Switch: 'Switch', DWDM: 'Other', Firewall: 'Firewall', Access: 'Switch', Server: 'Server', Storage: 'Storage', GPU: 'GPU-Node', 'Tenant gear': 'Other' };
  for (const t of dm.types) push('assetModels', { id: t.id, amodelId: t.id, manufacturer: t.manufacturer, model: t.model, category: CAT[t.role] ?? 'Other', heightU: t.uHeight, typicalPowerW: t.typicalW, maxPowerW: Math.round(t.typicalW * 1.35), weightKg: t.weightKg, formFactor: 'Rack' });
  for (const d of dm.devices) push('devices', {
    id: d.id, devcId: d.id, name: d.name, deviceTypeId: d.typeId, rackId: d.rackId, dataCenterId: d.dcId, position: d.u, status: d.status === 'Planned' ? 'Planned' : d.status === 'Decommissioning' ? 'Decommissioning' : 'Active',
    serial: d.serial, assetTag: d.assetTag, primaryIp4: d.ip, assetModelId: d.typeId, hostname: d.name, manufacturer: d.manufacturer, model: d.model, category: CAT[d.role] ?? 'Other', heightU: d.uHeight, powerDrawW: d.powerW,
    lifecycleState: d.status === 'Planned' ? 'Ordered' : 'Active', ownerTeam: d.tenantId ? 'Tenant' : d.category === 'network' ? 'Network engineering' : 'Platform engineering',
  });

  /* holds that are not plans */
  for (const h of capacityHolds(db, db.datacenters, false)) {
    if (h.kind === 'Capacity plan') continue;
    const rid = `RSV-${h.id}`;
    push('capacityReservations', { id: rid, rsvId: rid, resourceType: h.resource === 'Cooling' ? 'Cooling' : h.resource === 'Space' ? 'Rack' : 'PowerChain', resourceId: h.ref ?? h.dcId, state: h.state === 'Committed' ? 'Committed' : 'Reserved', quantity: h.qty, unit: h.unit, status: 'Active', dataCenterId: h.dcId, label: `${h.kind}: ${h.label}` });
  }

  /* IPAM: our prefixes (a prefix with children, or an aggregate, is a container the planner carves from) and VLANs */
  const ip = ipamModel(db);
  for (const a of ip.aggregates) push('cidrBlocks', { id: a.id, cidrId: a.id, cidr: a.prefix, name: a.description, totalAddresses: a.size, allocatedAddresses: a.allocated, utilizationPct: a.pct });
  /* largest containers first: the planner carves from the first one with room (the site fabric /16 before the management /23) */
  const maskOf = (c: string) => Number(c.split('/')[1] ?? 32);
  for (const x of [...ip.prefixes].sort((a, b) => maskOf(a.prefix) - maskOf(b.prefix))) push('subnets', {
    id: x.id, subnetId: x.id, parentId: x.parentId, cidr: x.prefix, name: x.description, status: x.status === 'Container' || x.children > 0 ? 'Container' : x.status, gatewayIp: x.gateway ?? '', dataCenterId: x.dcId, hallId: x.hallId,
    totalHosts: x.size, usedHosts: x.used, utilizationPct: x.pct, state: x.status === 'Reserved' ? 'Reserved' : 'Committed', purpose: x.role === 'Management' ? 'Management' : x.role === 'Storage' ? 'Storage' : x.role === 'Point-to-point' || x.role === 'Loopback' || x.role === 'Backbone' ? 'Transit' : 'Production',
  });
  for (const v of ip.vlans) push('vlans', { id: v.id, vlanId: v.id, vlanNumber: v.vid, name: v.name, dataCenterId: v.dcId, status: v.status === 'Active' ? 'Active' : 'Reserved' });

  /* customers and services (money in planner dollars) */
  for (const c of db.customers) push('customers', { id: c.id, custId: c.id, name: c.name, segment: c.segment, city: c.city, state: c.state, plan: c.plan, premium: c.premium, accountManager: c.accountManager, revenueMonthly: Math.round(toUsd(c.revenueMonthly)) });
  for (const s of db.services) push('services', { id: s.id, svcId: s.id, name: `${s.type} ${s.id}`, type: s.type, customerRef: s.customerId, dataCenterId: s.dcId, deviceId: s.neId, ifName: s.ifName, rackId: db.neById.get(s.neId)?.rackId, pathDeviceIds: s.path, cableIds: s.linkIds, bandwidthMbps: s.bandwidthMbps, utilPct: s.utilPct, status: s.status, slaTarget: s.slaTarget, uptime30d: s.uptime30d, growthPct: s.growthPct, revenueMonthly: Math.round(toUsd(s.revenueMonthly)), critical: s.critical, qty: s.qty, unit: s.unit });

  /* backhaul circuits (planner network family: carriers, diversity) */
  const carriers = G.id === 'us' ? ['Lumen', 'Zayo', 'AT&T'] : ['Tata Communications', 'Airtel Business', 'Jio Enterprise'];
  carriers.forEach((n, i) => push('providers', { id: `PRV-${i + 1}`, provId: `PRV-${i + 1}`, name: n, uptimeSlaPct: 99.9, restorationHrs: 4 }));
  db.links.filter(l => l.role === 'Backhaul').forEach((l, i) => {
    const cid = `CKT-${l.id}`;
    push('circuits', { id: cid, cktId: cid, cid: l.id, providerId: `PRV-${(i % carriers.length) + 1}`, circuitTypeId: 'Backhaul', status: l.state === 'down' ? 'Offline' : 'Active', commitRateMbps: l.capacityMbps, description: `${l.aNe} ${l.aIf} → ${l.zNe}`, purpose: 'Backhaul', diversityGroup: `${l.dcId}-backhaul` });
    push('circuitTerminations', { id: `${cid}-A`, ctermId: `${cid}-A`, circuitId: cid, side: 'A', dataCenterId: l.dcId, deviceId: l.aNe, portSpeedMbps: l.capacityMbps });
    const z = db.neById.get(l.zNe);
    push('circuitTerminations', { id: `${cid}-Z`, ctermId: `${cid}-Z`, circuitId: cid, side: 'Z', dataCenterId: z?.dcId, deviceId: l.zNe, portSpeedMbps: l.capacityMbps });
  });

  /* change calendar (conflicts with plan cut-overs) */
  for (const c of db.changes) push('changeRequests', { id: c.id, chgId: c.id, title: c.title, type: c.kind === 'Maintenance' ? 'Maintenance' : c.emergency ? 'Emergency' : 'Normal', description: c.title, risk: c.risk, status: c.status, priority: c.risk === 'High' ? 'High' : 'Medium', affectedResourceType: 'Asset', affectedResourceIds: c.scope, dataCenterId: c.dcId, requestedBy: c.requester, requestedById: c.requester, scheduledStart: iso(c.windowStart), scheduledEnd: iso(c.windowEnd), policyViolations: [], rollbackPlan: c.rollback });

  /* edge locations: PoPs and remote sites */
  for (const l of db.locations.filter(x => x.kind === 'pop' || x.kind === 'site')) {
    const near = db.datacenters.filter(d => d.regionId === l.regionId)[0] ?? db.datacenters[0];
    push('edgeLocations', { id: l.id, locId: l.id, kind: l.kind, name: l.name, campusId: `CMP-${near.id}`, regionId: l.regionId, city: l.city, country: G.country, latitude: l.lat, longitude: l.lng, status: l.status, category: l.category === 'Central' ? 'Regional' : l.category, neCount: l.neCount, discovered: l.discovered, roles: l.roles, blocker: l.blocker, blockerNote: l.blockerNote, passive: l.passive });
  }
  return out;
}
