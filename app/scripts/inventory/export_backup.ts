/* Dump the DCO mock estate (one persona × geography) into the import-template column order.
   usage: npx tsx export_backup.ts <persona> <in|us> <out.json>  (run from app/, e.g. npx tsx scripts/inventory/export_backup.ts neocloud in /tmp/neocloud-in.json) */
import { writeFileSync } from 'node:fs';
import * as S from '../../src/mock/server';

const [persona, geo, out] = process.argv.slice(2);
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

const gpuNodes: any[] = [...db.gpu.nodes.values()];
const cduOfRack = new Map<string, string>();
for (const c of db.gpu.cdus) for (const r of c.racks) cduOfRack.set(r, c.id);
for (const c of db.gpu.cages) if (c.cduId) cduOfRack.set(c.rackId, c.cduId);

for (const dc of db.datacenters) {
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
for (const n of db.nes) {
  const st = S.opsStateOf(n);
  const tenant = st === 'tenant-owned';
  push('Devices', [n.id, n.dcId, n.name, n.role, n.layer, n.vendor, n.model, n.os || null, tenant ? null : n.serial, tenant ? null : n.ip, tenant ? null : n.mac, n.rackId, n.u, n.uSize ?? 1,
    n.lifecycle, tenant ? 'tenant' : 'operator', n.tenantId ?? null, st === 'in-service' ? 'Y' : 'N', n.collector ?? null, yn(n.isPe)]);
  for (const m of n.modules ?? []) push('Modules', [n.id, m.slot, m.name, m.serial]);
  for (const i of db.ifaces.get(n.id) ?? []) push('Interfaces', [n.id, i.name, i.type, i.speedMbps, i.state === 'admin-down' || i.state === 'reserved' ? i.state : 'up', i.description || null, i.optics?.model ?? null]);
}
for (const l of db.links) push('Links', [l.id, l.aNe, l.aIf, l.zNe, l.zIf, l.role, l.protocol, l.capacityMbps, l.physical?.cable ?? null, l.physical?.strand ?? null, l.physical?.aPort ?? null, l.physical?.zPort ?? null, null]);
for (const g of gpuNodes) push('GPU_Nodes', [g.neId, g.clusterId, g.model, g.vendor, g.gpus.length, g.server, g.cooling, g.driver, g.firmware]);
for (const c of db.customers) push('Customers', [c.id, c.name, c.segment, c.city, c.state, c.plan, yn(c.premium), c.accountManager, null]);
for (const s of db.services) {
  const isGpu = s.unit === 'GPU';
  push('Services', [s.id, s.customerId, s.type, s.dcId, s.neId || null, s.ifName || null, null, isGpu ? s.path.join(';') : null, s.qty, s.unit, s.bandwidthMbps || null, s.slaTarget, s.revenueMonthly, yn(s.critical), null]);
}
/* snapshot sheets */
for (const a of db.alerts) push('Snapshot_Alerts', [a.id, a.dcId, a.severity, a.state, a.title, a.source, a.category, a.scope, a.neId ?? a.node ?? null, a.ifName ?? null, a.linkId ?? a.rackId ?? null, ts(a.start), a.incidentId ?? null]);
for (const i of db.incidents) push('Snapshot_Incidents', [i.id, i.dcId, ['', 'Critical', 'High', 'Medium', 'Low'][i.sev], i.status, i.type, i.title, i.owner, ts(i.detected), ts(i.resolved), i.alertIds.length, i.impact.services, i.impact.customers, i.impact.revenueAtRisk]);
for (const c of db.changes) push('Snapshot_Changes', [c.id, c.dcId, c.kind, c.title, c.status, c.risk, ts(c.windowStart), ts(c.windowEnd), c.requester, c.approver ?? null, c.scope.join(';')]);
R._meta = [[persona, geo, new Date(db.now).toISOString().slice(0, 16).replace('T', ' ')]];
writeFileSync(out, JSON.stringify(R));
console.log(persona, geo, Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.length])));
