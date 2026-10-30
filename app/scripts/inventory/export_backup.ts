/* Dump the DCO mock estate (one persona × geography) into the import-template column order.
   usage: npx tsx export_backup.ts <persona> <in|us> <out.json> [dc,dc,…]  (run from app/, e.g. npx tsx scripts/inventory/export_backup.ts neocloud in /tmp/neocloud-in.json)
   With a datacenter list only those sites are written, end to end: their devices, the links between exported devices, the customers that buy
   something there, their alarms / incidents / changes — a complete, self-consistent sample for a customer to copy when filling the template. */
import { writeFileSync } from 'node:fs';
import * as S from '../../src/mock/server';
import { sitePhys } from '../../src/mock/physical';
import { siteSafety } from '../../src/mock/safety';
import { siteLifecycle } from '../../src/mock/lifecycle';
import { sitePm } from '../../src/mock/maintenance';
import { onCall, problems, colocationOrders } from '../../src/mock/ops';

const [persona, geo, out, only] = process.argv.slice(2);
const dcs = new Set((only ?? '').split(',').map(s => s.trim()).filter(Boolean));
const inScope = (id: string) => !dcs.size || dcs.has(id);
S.setGeo(geo as 'in' | 'us');
S.setPersona(persona as any);
const db: any = S.raw();
const day = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
const ts = (ms?: number) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : null);
const yn = (b: unknown) => (b ? 'Y' : 'N');
const R: Record<string, unknown[][]> = {};
const push = (k: string, row: unknown[]) => (R[k] ??= []).push(row);
const regionName = new Map(db.regions.map((r: any) => [r.id, r.name]));
const roomType = (n: string) => /meet-me|mmr/i.test(n) ? 'Meet-me room' : /gpu|ai/i.test(n) ? 'AI hall' : /noc/i.test(n) ? 'NOC' : /network/i.test(n) ? 'Network room' : 'Data hall';

const sites: any[] = db.datacenters.filter((dc: any) => inScope(dc.id));
const nes: any[] = db.nes.filter((n: any) => inScope(n.dcId));
const neIds = new Set<string>(nes.map((n: any) => n.id));
const links: any[] = db.links.filter((l: any) => neIds.has(l.aNe) && neIds.has(l.zNe));
const linkIds = new Set<string>(links.map((l: any) => l.id));
const gpuNodes: any[] = [...db.gpu.nodes.values()].filter((g: any) => neIds.has(g.neId));
const services: any[] = db.services.filter((s: any) => inScope(s.dcId));
const customerIds = new Set<string>(services.map((s: any) => s.customerId));
const cduOfRack = new Map<string, string>();
for (const c of db.gpu.cdus) for (const r of c.racks) cduOfRack.set(r, c.id);
for (const c of db.gpu.cages) if (c.cduId) cduOfRack.set(c.rackId, c.cduId);

for (const dc of sites) {
  const d = dc.id;
  push('Sites', [d, dc.name, null, persona, dc.status, dc.tier, dc.category, regionName.get(dc.regionId) ?? dc.zone, dc.state, dc.city, dc.address, dc.lat, dc.lng,
    day(dc.commissionedOn), dc.power.capacityKw, dc.power.pue, dc.cooling.capacityKw, dc.cooling.redundancy, geo === 'us' ? 'America/New_York' : 'Asia/Kolkata']);
  /* rooms are names inside floors; zones read "<floor> · <room>" */
  const roomId = new Map<string, string>();
  dc.floors.forEach((f: any, fi: number) => {
    const fid = `${d}-F${fi}`;
    push('Floors', [d, fid, f.name, fi]);
    f.rooms.forEach((rm: string, ri: number) => {
      const rid = `${fid}-R${ri + 1}`;
      roomId.set(`${f.name} · ${rm}`, rid); roomId.set(`${f.name}|${rm}`, rid);
      const racks = dc.racks.filter((r: any) => r.floor === f.name && r.room === rm);
      push('Rooms', [d, fid, rid, rm, roomType(rm), null, Math.max(1, Math.ceil(racks.length / 6)), null, racks.some((r: any) => r.liquid) ? (racks.every((r: any) => r.liquid) ? 'Liquid' : 'Hybrid') : 'Air']);
    });
  });
  const feedA = dc.power.feeds.find((f: any) => f.type === 'AC'), feedB = dc.power.feeds.filter((f: any) => f.type === 'AC')[1];
  for (const r of dc.racks) {
    push('Racks', [r.id, d, roomId.get(`${r.floor}|${r.room}`), r.name, null, null, r.role, r.heightU, r.budgetKw, r.owner ?? 'operator', r.tenantId ?? null, r.contractedKw ?? null,
      r.density === 'ai' ? 'ai' : 'standard', yn(r.liquid), cduOfRack.get(r.id) ?? null, feedA ? `${d}-${feedA.id}` : null, feedB ? `${d}-${feedB.id}` : null, null]);
  }
  for (const f of dc.power.feeds) push('Power_Feeds', [`${d}-${f.id}`, d, f.type, f.source, f.rating, f.capacityKw, f.type === 'AC' && f !== feedA ? 'Standby' : 'Active', null]);
  for (const u of dc.power.ups) push('UPS', [u.id, d, null, u.name, null, null, null, u.capacityKw, u.redundancy, u.batteryMin]);
  const dg = dc.power.dg;
  push('Generators', [`${d}-DG-1`, d, 'DG-1', dg.kva, null, dg.runtimeH, day(dg.lastTest), dg.result]);
  for (const f of dc.power.feeds.filter((f: any) => f.type === 'DC')) push('DC_Plant', [`${d}-${f.source.split(' ').pop()}`, d, null, 'Rectifier', f.source.split(' ').pop(), null, null, f.rating, f.capacityKw, null, null]);
  const b = dc.power.battery;
  push('DC_Plant', [`${d}-BATT-01`, d, null, 'Battery bank', 'BATT-01', b.volts, b.ah, null, null, b.runtimeH, day(b.lastTest)]);
  for (const c of dc.cooling.units) push('Cooling_Units', [c.id, d, roomId.get(c.zone) ?? null, c.name, c.type, null, null, c.capacityKw, c.supplyC]);
  for (const s of dc.cooling.sensors) push('Sensors', [s.id, d, roomId.get(s.zone) ?? null, 'Temperature + humidity', null, null]);
  for (const c of dc.collectors) push('Collectors', [c.id, d, c.name, persona === 'network' ? 'SNMP' : 'gNMI', 'Network', null, null]);
  for (const c of db.gpu.cdus.filter((c: any) => c.dcId === d)) push('CDUs', [c.id, d, roomId.get(c.room) ?? null, c.name, c.capacityKw, c.flowNominal, c.supplyC, null]);
  for (const c of db.gpu.clusters.filter((c: any) => c.dcId === d)) push('GPU_Clusters', [c.id, d, roomId.get(c.room) ?? null, c.name, c.scheduler, c.fabric, c.model, c.cooling, null]);
  /* operational snapshot (not import data): open + recent alarms, incidents, changes */
}
/* the generator repeats a few serials between sites; a serial must be unique for discovery to match it, so a repeat gets a suffix here */
const serials = new Map<string, number>();
const serialOf = (s: string) => { const k = (serials.get(s) ?? 0) + 1; serials.set(s, k); return k === 1 ? s : `${s}-${k}`; };
for (const n of nes) {
  const st = S.opsStateOf(n);
  const tenant = st === 'tenant-owned';
  push('Devices', [n.id, n.dcId, n.name, n.role, n.layer, n.vendor, n.model, n.os || null, tenant ? null : serialOf(n.serial), tenant ? null : n.ip, tenant ? null : n.mac, n.rackId, n.u, n.uSize ?? 1,
    n.lifecycle, tenant ? 'tenant' : 'operator', n.tenantId ?? null, st === 'in-service' ? 'Y' : 'N', n.collector ?? null, yn(n.isPe)]);
  for (const m of n.modules ?? []) push('Modules', [n.id, m.slot, m.name, m.serial]);
  for (const i of db.ifaces.get(n.id) ?? []) push('Interfaces', [n.id, i.name, i.type, i.speedMbps, i.state === 'admin-down' || i.state === 'reserved' ? i.state : 'up', i.description || null, i.optics?.model ?? null]);
}
for (const l of links) push('Links', [l.id, l.aNe, l.aIf, l.zNe, l.zIf, l.role, l.protocol, l.capacityMbps, l.physical?.cable ?? null, l.physical?.strand ?? null, l.physical?.aPort ?? null, l.physical?.zPort ?? null, null]);
for (const g of gpuNodes) push('GPU_Nodes', [g.neId, g.clusterId, g.model, g.vendor, g.gpus.length, g.server, g.cooling, g.driver, g.firmware]);
for (const c of db.customers.filter((c: any) => !dcs.size || customerIds.has(c.id))) push('Customers', [c.id, c.name, c.segment, c.city, c.state, c.plan, yn(c.premium), c.accountManager, null]);
for (const s of services) {
  const isGpu = s.unit === 'GPU';
  push('Services', [s.id, s.customerId, s.type, s.dcId, s.neId || null, s.ifName || null, null, isGpu ? s.path.join(';') : null, s.qty, s.unit, s.bandwidthMbps || null, s.slaTarget, s.revenueMonthly, yn(s.critical), null]);
}
/* snapshot sheets */
for (const a of db.alerts.filter((a: any) => inScope(a.dcId))) push('Snapshot_Alerts', [a.id, a.dcId, a.severity, a.state, a.title, a.source, a.category, a.scope, a.neId ?? a.node ?? null, a.ifName ?? null, a.linkId ?? a.rackId ?? null, ts(a.start), a.incidentId ?? null]);
for (const i of db.incidents.filter((i: any) => inScope(i.dcId))) push('Snapshot_Incidents', [i.id, i.dcId, ['', 'Critical', 'High', 'Medium', 'Low'][i.sev], i.status, i.type, i.title, i.owner, ts(i.detected), ts(i.resolved), i.alertIds.length, i.impact.services, i.impact.customers, i.impact.revenueAtRisk]);
for (const c of db.changes.filter((c: any) => inScope(c.dcId))) push('Snapshot_Changes', [c.id, c.dcId, c.kind, c.title, c.status, c.risk, ts(c.windowStart), ts(c.windowEnd), c.requester, c.approver ?? null, c.scope.join(';')]);
/* physical last mile (mock/physical.ts): rack PDUs, cords, panels, trunks, per-end cable paths, cooling coverage */
const linkById = new Map(db.links.map((l: any) => [l.id, l]));
for (const dc of sites) {
  const ph = sitePhys(db, dc.id)!;
  for (const x of ph.pdus) push('Rack_PDUs', [x.id, dc.id, x.rackId, x.side, x.kind, x.model, x.volts, x.phases, x.ratingA, x.capacityKw, x.outlets, x.upstreamId, `${dc.id}-${x.feedId}`]);
  for (const c of ph.cords) push('Power_Connections', [c.neId, c.psu, c.pduId, c.outlet, ph.pdus.find(x => x.id === c.pduId)!.banks.find(b => b.id === c.bankId)?.name ?? null, null]);
  for (const pp of ph.panels) push('Patch_Panels', [pp.id, dc.id, pp.rackId, pp.name, pp.kind, pp.role, pp.ports]);
  for (const t of ph.trunks) push('Trunk_Cables', [t.id, dc.id, t.aPanel, t.zPanel, t.kind, t.pairs, t.route, t.lengthM]);
  for (const e of ph.ends.values()) { if (!linkIds.has(e.linkId)) continue; const l: any = linkById.get(e.linkId); push('Cable_Paths', [e.linkId, l.aNe === e.neId ? 'A' : 'Z', e.neId, e.cordId, e.panelId ?? null, e.panelPort ?? null, e.trunkId ?? null, e.odfPanel ?? null, e.odfPort ?? null, e.ospCore ?? null]); }
  for (const r of ph.rackCooling) push('Cooling_Coverage', [r.rackId, r.primaryId, r.cduId ?? null]);
}
/* Phase 2 / 3 master data: fire, leak, access, contracts, lifecycle, spares, PM plan, on-call; plus RMA / problem / order snapshots */
const contracts = new Map<string, unknown[]>(), models = new Map<string, unknown[]>();
const regionsDone = new Set<string>();
for (const dc of sites) {
  const zr = new Map<string, string>();
  dc.floors.forEach((f: any, fi: number) => f.rooms.forEach((rm: string, ri: number) => zr.set(`${f.name} · ${rm}`, `${dc.id}-F${fi}-R${ri + 1}`)));
  const room = (z: string) => zr.get(z) ?? null;
  const sf = siteSafety(db, dc.id)!;
  for (const f of sf.fire) push('Fire_Systems', [f.id, dc.id, room(f.zone), f.detection, f.suppression, f.release, day(f.lastInspection), null]);
  for (const l of sf.leak) push('Leak_Detection', [l.id, dc.id, room(l.zone), l.covers, l.lengthM, day(l.lastTest)]);
  for (const a of sf.access) push('Access_Points', [a.id, dc.id, a.name, room(a.zone), a.kind, a.reader, a.tenantId ?? null]);
  const lc = siteLifecycle(db, dc.id)!;
  for (const a of lc.assets) {
    if (a.state === 'Planned' || a.state === 'Tenant-owned') continue;
    if (a.contract) contracts.set(a.contract.id, [a.contract.id, dc.id, a.vendor, a.contract.level, null, day(a.contract.expires)]);
    models.set(`${a.vendor}|${a.model}`, [a.vendor, a.model, day(a.endOfSale), day(a.endOfSupport)]);
    push('Asset_Lifecycle', [a.neId, day(a.installed), day(a.warrantyEnd), a.contract?.id ?? null]);
  }
  for (const x of lc.spares) push('Spares', [dc.id, x.part, x.fits, x.onHand, x.min]);
  for (const r of lc.rmas) push('Snapshot_RMA', [r.id, dc.id, r.neId, r.slot, r.part, r.ref, r.status, ts(r.opened), yn(r.spareOnSite)]);
  for (const t of sitePm(db, dc.id)!) push('PM_Plan', [t.id, dc.id, t.assetId, t.kind, t.task, t.intervalDays, day(t.lastDone), t.owner]);
  const reg = regionName.get(dc.regionId) as string;
  if (!regionsDone.has(reg)) { regionsDone.add(reg); for (const o of onCall(db, dc.id)) push('On_Call', [reg, o.role, o.name, o.tier, o.escalateAfterMin, null]); }
}
for (const c of contracts.values()) push('Support_Contracts', c);
for (const m of models.values()) push('Model_Lifecycle', m);
for (const p of problems(db).filter((p: any) => p.sites.some((s: string) => inScope(s)))) push('Snapshot_Problems', [p.id, p.title, p.type, p.state, p.incidents.join(';'), p.open, p.sites.join(';'), p.workaround, p.fix, p.owner]);
{ const o = colocationOrders(db, {});
  for (const x of o.xc.filter((x: any) => inScope(x.dcId))) push('Snapshot_Orders', [x.id, 'Cross-connect', x.dcId, x.customerId, `${x.from} → ${x.to}`, x.state, ts(x.ordered), day(x.due)]);
  for (const h of o.hands.filter((h: any) => inScope(h.dcId))) push('Snapshot_Orders', [h.id, 'Remote hands', h.dcId, h.customerId, h.task, h.state, ts(h.opened), h.minutes]); }
R._meta = [[persona, geo, new Date(db.now).toISOString().slice(0, 16).replace('T', ' '), [...dcs].join(', ')]];
writeFileSync(out, JSON.stringify(R));
console.log(persona, geo, Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length])));
