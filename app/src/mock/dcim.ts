/* DCIM read model (13-Oct-2026, user: merge the P2B "Plan to Build" screens into the operations app, one estate).
   The inventory record of the estate — sites → floors → halls → rows → racks → devices → ports → cables, the device / module type
   catalogue and the power distribution — derived from the generated entities and the physical last-mile model (mock/physical.ts).
   Nothing is typed in: a hall is a room of the site, its rows follow the twin's rack layout (twin/layout.ts: racks of a room in
   order, `cols` per row, rows paired face to face around a cold aisle), a device type is every distinct vendor + model, a cable is
   an LLDP link (data) or a power cord (PSU → rack PDU outlet), a power panel is a hall's A / B busway fed by one UPS module (or the
   −48 V plant), a power feed is a rack PDU. Cached per data version; nothing in the generated collections changes. */
import type {
  DcimCable, DcimCatalog, DcimComponent, DcimDevice, DcimDeviceType, DcimHall, DcimModuleType, DcimPowerFeed, DcimPowerPanel, DcimRack, DcimRackView,
  DcimRow, DcimSite, DcimStatus, Datacenter, HallKind, Interface, NetworkElement, NeRole, PowerCord, RackPdu
} from '../api/types';
import type { Db } from './generate';
import { NE_CATEGORY } from '../api/types';
import { psus, sitePhys } from './physical';
import { siteLifecycle } from './lifecycle';

const r1 = (n: number) => Math.round(n * 10) / 10;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isPlanned = (n: NetworkElement) => n.discovery === 'not-discovered' && n.ndReason === 'planned';
const isOpaque = (n: NetworkElement) => n.role === 'Tenant gear';

/* the twin's room layout rule (screens/site/twin/layout.ts layoutRacks): keep both in step */
export const rowCols = (n: number) => Math.max(2, Math.min(8, Math.ceil(Math.sqrt(n * 2.2))));

export function hallKind(room: string): HallKind {
  if (/meet-me/i.test(room)) return 'Meet-me room';
  if (/MDF|network core|core network|core room|transmission|equipment room/i.test(room)) return 'Network room';
  if (/storage/i.test(room)) return 'Storage hall';
  if (/GPU/i.test(room)) return 'GPU hall';
  return 'Data hall';
}

/* physical envelope per device role (kg), used for rack weight; a rack shell is 140 kg */
const ROLE_KG: Record<NeRole, number> = { Router: 70, Switch: 11, DWDM: 45, Firewall: 22, Access: 9, Server: 26, Storage: 42, GPU: 130, 'Tenant gear': 320 };
const RACK_KG = 140;
const deviceKg = (n: NetworkElement) => (n.layer === 'core' && n.role === 'Router' ? 140 : ROLE_KG[n.role] ?? 20);

export function deviceStatus(n: NetworkElement): DcimStatus {
  if (isOpaque(n)) return 'Tenant-owned';
  if (isPlanned(n)) return 'Planned';
  if (n.lifecycle === 'Maintenance') return 'Maintenance';
  if (n.lifecycle === 'Decommissioning') return 'Decommissioning';
  return 'Active';
}

const typeIdOf = (n: NetworkElement) => slug(`${n.vendor} ${n.model}`);

function moduleKind(slot: string, name: string): DcimModuleType['kind'] {
  if (/^(PSU|PEM)/.test(slot)) return 'Power supply';
  if (/^FAN/i.test(slot) || /fan/i.test(name)) return 'Fan';
  if (/^(RE|RP|SUP|CB)/.test(slot) || /routing engine|supervisor|route processor/i.test(name)) return 'Routing engine';
  if (/GPU|accelerator|H100|H200|B200|A100|L40S|Gaudi|Max 1550/i.test(name)) return 'Accelerator';
  if (/NVMe|SSD|disk|drive/i.test(name)) return 'Storage';
  if (/^(FPC|LC|MPC|PIC|LINE|SLOT)/i.test(slot) || /line card|MPC|linecard/i.test(name)) return 'Line card';
  return 'Other';
}

/* the cable a port of this type needs, by where the far end is */
export function cableType(it: Interface | undefined, route: DcimCable['route']): string {
  const t = it?.type ?? '';
  if (/copper/i.test(t)) return 'Cat6A';
  if (route === 'Inter-site') return 'OS2 single-mode · outside plant';
  if (route === 'In-rack') return /400G/.test(t) ? 'DAC 400G OSFP' : /100G/.test(t) ? 'DAC 100G QSFP28' : /10G/.test(t) ? 'DAC 10G SFP+' : 'Patch cord';
  return /400G/.test(t) ? 'MPO-12 OS2 · 400G-DR4' : /100G/.test(t) ? 'LC duplex OS2 · 100G-LR4' : /10G/.test(t) ? 'LC duplex OS2 · 10G-LR' : 'LC duplex OS2';
}

export interface DcimModel {
  sites: DcimSite[]; halls: DcimHall[]; rows: DcimRow[]; racks: DcimRack[]; devices: DcimDevice[]; types: DcimDeviceType[]; modules: DcimModuleType[];
  cables: DcimCable[]; panels: DcimPowerPanel[]; feeds: DcimPowerFeed[];
  rackById: Map<string, DcimRack>; hallById: Map<string, DcimHall>; deviceById: Map<string, DcimDevice>; typeById: Map<string, DcimDeviceType>;
  cordsByRack: Map<string, PowerCord[]>; pduByRack: Map<string, RackPdu[]>;
}

let cacheDb: Db | null = null;
let cache: DcimModel | null = null;
/* device types added by hand in the catalogue (they have no devices yet); kept until the estate is regenerated */
const customTypes: DcimDeviceType[] = [];
export function clearDcim() { cache = null; }
export function resetDcimCustom() { customTypes.length = 0; resetDcimOverlay(); }
export function addCustomType(t: DcimDeviceType) { customTypes.push(t); cache = null; }
export const customTypeById = (id: string) => customTypes.find(t => t.id === id);
/* runtime DCIM records (14-Oct-2026, P2B gap fill): U-space reservations, power panels / feeds and module types entered by hand */
export interface UReservation { id: string; rackId: string; u: number; uHeight: number; label: string; by: string; until?: number }
export const dcimOverlay = { reservations: [] as UReservation[], panels: [] as DcimPowerPanel[], feeds: [] as DcimPowerFeed[], modules: [] as DcimModuleType[], seq: 0 };
export function resetDcimOverlay() { dcimOverlay.reservations.length = 0; dcimOverlay.panels.length = 0; dcimOverlay.feeds.length = 0; dcimOverlay.modules.length = 0; cache = null; }

export function dcimModel(db: Db): DcimModel {
  if (cache && cacheDb === db) return cache;
  cacheDb = db;
  cache = build(db);
  return cache;
}

const hallIdOf = (dcId: string, fi: number, ri: number) => `${dcId}-F${fi}-H${ri + 1}`;

function build(db: Db): DcimModel {
  const sites: DcimSite[] = [], halls: DcimHall[] = [], rows: DcimRow[] = [], racks: DcimRack[] = [], devices: DcimDevice[] = [];
  const cables: DcimCable[] = [], panels: DcimPowerPanel[] = [], feeds: DcimPowerFeed[] = [];
  const cordsByRack = new Map<string, PowerCord[]>(), pduByRack = new Map<string, RackPdu[]>();
  const custName = new Map(db.customers.map(c => [c.id, c.name]));
  const nesByRack = new Map<string, NetworkElement[]>();
  for (const n of db.nes) nesByRack.set(n.rackId, [...(nesByRack.get(n.rackId) ?? []), n]);
  const rackHall = new Map<string, DcimHall>();

  for (const dc of db.datacenters) {
    const phys = sitePhys(db, dc.id);
    const rackLife = new Map((siteLifecycle(db, dc.id)?.racks ?? []).map(x => [x.rackId, x]));
    const pdus = phys?.pdus ?? [], cords = phys?.cords ?? [];
    for (const p of pdus) pduByRack.set(p.rackId, [...(pduByRack.get(p.rackId) ?? []), p]);
    for (const c of cords) { const n = db.neById.get(c.neId); if (n) cordsByRack.set(n.rackId, [...(cordsByRack.get(n.rackId) ?? []), c]); }
    const cordsOf = new Map<string, PowerCord[]>();
    for (const c of cords) cordsOf.set(c.neId, [...(cordsOf.get(c.neId) ?? []), c]);
    let siteRows = 0;
    const siteHalls: DcimHall[] = [];

    /* ---- halls + rows (+ rack grid positions, same rule as the twin) */
    dc.floors.forEach((f, fi) => f.rooms.forEach((room, ri) => {
      const inRoom = dc.racks.filter(r => r.floor === f.name && r.room === room);
      const cols = rowCols(inRoom.length), nRows = Math.max(1, Math.ceil(inRoom.length / cols));
      const id = hallIdOf(dc.id, fi, ri);
      const keys = `${f.name} · ${room}`;
      const units = dc.cooling.units.filter(u => u.zone === keys);
      const rp = inRoom.flatMap(r => pduByRack.get(r.id) ?? []);
      const busA = rp.find(p => p.side === 'A' && p.kind === 'AC')?.upstreamName ?? dc.power.ups[1]?.name ?? 'UPS-2';
      const busB = rp.find(p => p.side === 'B' && p.kind === 'AC')?.upstreamName ?? dc.power.ups[0]?.name ?? 'UPS-1';
      const liquid = inRoom.filter(r => r.liquid).length;
      const hall: DcimHall = {
        id, dcId: dc.id, floor: f.name, floorIdx: fi, name: room, kind: hallKind(room), cooling: liquid === 0 ? 'Air' : liquid === inRoom.length ? 'Liquid' : 'Hybrid',
        gridCols: cols, gridRows: nRows, rows: inRoom.length ? nRows : 0, racks: inRoom.length,
        devices: inRoom.reduce((a, r) => a + (nesByRack.get(r.id) ?? []).length, 0),
        usedU: inRoom.reduce((a, r) => a + r.usedU, 0), totalU: inRoom.reduce((a, r) => a + r.heightU, 0),
        drawKw: r1(inRoom.reduce((a, r) => a + r.drawKw, 0)), budgetKw: r1(inRoom.reduce((a, r) => a + r.budgetKw, 0)),
        busA, busB, coolingUnits: units.map(u => u.name), hotAisleContained: nRows >= 2
      };
      halls.push(hall); siteHalls.push(hall);
      for (let k = 0; k < nRows && inRoom.length; k++) {
        const ids = inRoom.slice(k * cols, (k + 1) * cols).map(r => r.id);
        const paired = k % 2 === 0 ? k + 1 < nRows : true;
        rows.push({ id: `${id}-R${String.fromCharCode(65 + k)}`, dcId: dc.id, hallId: id, name: `Row ${String.fromCharCode(65 + k)}`, racks: ids,
          containment: paired ? 'Cold aisle' : 'None', facesRow: paired ? `Row ${String.fromCharCode(65 + (k % 2 === 0 ? k + 1 : k - 1))}` : undefined });
        siteRows++;
      }
      inRoom.forEach((rk, i) => {
        rackHall.set(rk.id, hall);
        const row = Math.floor(i / cols), col = i % cols;
        const all = nesByRack.get(rk.id) ?? [];
        const live = all.filter(n => !isPlanned(n));
        const rp2 = pduByRack.get(rk.id) ?? [];
        const ac = rp2.filter(p => p.kind === 'AC');
        const downSides = ac.filter(p => p.state === 'tripped').map(p => p.side);
        const ports = all.reduce((a, n) => a + (db.ifaces.get(n.id)?.length ?? 0), 0);
        const used = all.reduce((a, n) => a + (db.ifaces.get(n.id) ?? []).filter(x => x.peer).length, 0);
        const ai = rk.density === 'ai';
        const life = rackLife.get(rk.id);
        racks.push({
          id: rk.id, name: rk.name, dcId: dc.id, hallId: id, hallName: room, rowId: `${id}-R${String.fromCharCode(65 + row)}`, rowName: `Row ${String.fromCharCode(65 + row)}`,
          floor: f.name, gridX: col, gridY: row, role: rk.role, heightU: rk.heightU, usedU: rk.usedU, freeU: Math.max(0, rk.heightU - rk.usedU),
          devices: all.length, plannedDevices: all.length - live.length, drawKw: rk.drawKw, budgetKw: rk.budgetKw, powerPct: rk.budgetKw ? Math.round((rk.drawKw / rk.budgetKw) * 100) : 0,
          density: ai ? 'AI' : rk.budgetKw >= 15 ? 'High' : 'Standard', liquid: !!rk.liquid, owner: rk.owner ?? 'operator', tenantId: rk.tenantId, tenantName: rk.tenantId ? custName.get(rk.tenantId) : undefined,
          status: dc.status === 'planned' || (all.length && !live.length) ? 'Planned' : rk.owner === 'tenant' ? 'Tenant-owned' : 'Active', tempC: rk.tempC,
          pdus: rp2.length, power: downSides.length === 0 ? 'A + B' : downSides.length === 2 ? 'A + B · one side down' : downSides.includes('A') ? 'B only' : 'A only',
          weightKg: Math.round(RACK_KG + all.reduce((a, n) => a + deviceKg(n), 0) + (rk.role === 'ODF / patching' ? 60 : 0)), maxWeightKg: ai ? 1800 : 1360, ports, portsUsed: used, contractedKw: rk.contractedKw,
          model: life ? `${life.manufacturer} ${life.model}` : undefined, installed: life?.installed, old: life?.old, condition: life?.condition, conditionNote: life?.note
        });
      });
    }));

    /* ---- devices */
    for (const n of db.nes.filter(x => x.dcId === dc.id)) {
      const hall = rackHall.get(n.rackId);
      const ifs = db.ifaces.get(n.id) ?? [];
      const cs = cordsOf.get(n.id) ?? [];
      devices.push({
        id: n.id, name: n.name, dcId: dc.id, rackId: n.rackId, rackName: dc.racks.find(r => r.id === n.rackId)?.name ?? n.rackId, hallId: hall?.id ?? '', hallName: hall?.name ?? '',
        u: n.u, uHeight: n.uSize ?? 1, typeId: typeIdOf(n), manufacturer: n.vendor, model: n.model, role: n.role, category: NE_CATEGORY[n.role], status: deviceStatus(n),
        serial: n.serial, assetTag: `AT-${n.id.replace(/[^A-Z0-9]/gi, '').slice(-8)}`, ip: n.ip, platform: n.os, ports: ifs.length, portsUp: ifs.filter(x => x.state === 'up').length,
        cables: ifs.filter(x => x.peer).length + cs.length, psus: isOpaque(n) ? cs.length || 2 : psus(n).length, powerW: cs.reduce((a, c) => a + c.drawW, 0), tenantId: n.tenantId, health: n.health, ...(n.purpose ? { purpose: n.purpose } : {})
      });
    }

    /* ---- power: a hall busway per side (one UPS module or the −48 V plant), a feed per rack PDU */
    const byPanel = new Map<string, RackPdu[]>();
    for (const p of pdus) {
      const hall = rackHall.get(p.rackId); if (!hall) continue;
      const key = `${hall.id}|${p.kind === 'DC' ? 'DC' : p.side}`;
      byPanel.set(key, [...(byPanel.get(key) ?? []), p]);
    }
    for (const [key, ps] of byPanel) {
      const [hallId, side] = key.split('|');
      const hall = siteHalls.find(h => h.id === hallId)!;
      const p0 = ps[0];
      const ups = dc.power.ups.find(u => u.id === p0.upstreamId);
      const feed = dc.power.feeds.find(f => f.id === p0.feedId);
      const panelId = `${hallId}-${side === 'DC' ? 'BDFB' : `BUS-${side}`}`;
      const load = r1(ps.reduce((a, p) => a + p.loadKw, 0)), cap = r1(ps.reduce((a, p) => a + p.capacityKw, 0));
      const bad = ps.some(p => p.state === 'tripped') || ups?.state === 'Fault';
      const warn = ps.some(p => p.state !== 'ok') || (ups && ups.state !== 'Online');
      panels.push({
        id: panelId, dcId: dc.id, hallId, hallName: hall.name, name: side === 'DC' ? `${hall.name} · −48 V distribution` : `${hall.name} · busway ${side}`, side: side as DcimPowerPanel['side'],
        source: p0.upstreamName, sourceState: side === 'DC' ? 'Rectifier' : ups?.state ?? 'Online', utility: feed ? `${feed.source}` : '—', feeds: ps.length, loadKw: load, capacityKw: cap,
        state: bad ? 'bad' : warn ? 'warn' : 'ok'
      });
      for (const p of ps) {
        const rk = dc.racks.find(r => r.id === p.rackId)!;
        feeds.push({
          id: p.id, dcId: dc.id, panelId, rackId: p.rackId, rackName: rk.name, hallName: hall.name, name: p.name, side: p.side, kind: p.kind, volts: p.volts, phases: p.phases, amps: p.ratingA,
          capacityKw: p.capacityKw, loadKw: p.loadKw, pct: p.capacityKw ? Math.round((p.loadKw / p.capacityKw) * 100) : 0, outlets: p.outlets,
          cords: cords.filter(c => c.pduId === p.id).length, state: p.state, note: p.note
        });
      }
    }

    /* ---- cables: power cords */
    for (const c of cords) {
      const n = db.neById.get(c.neId)!; const p = phys!.pduById.get(c.pduId)!;
      const rk = dc.racks.find(r => r.id === n.rackId)!;
      cables.push({
        id: `PC-${c.neId}-${c.psu}`, dcId: dc.id, kind: 'Power', type: p.kind === 'DC' ? '−48 V DC lugged pair' : p.capacityKw >= 22 ? 'C19 → C20' : 'C13 → C14',
        aDevice: n.id, aName: n.name, aPort: c.psu, aRack: rk.name, zDevice: p.id, zName: `${rk.name} ${p.name}`, zPort: `Outlet ${c.outlet}`, zRack: rk.name,
        route: 'Power cord', via: `${p.name} ← ${p.upstreamName}`, lengthM: 2,
        status: c.state === 'psu-failed' ? 'PSU failed' : c.state === 'no-power' ? 'No power' : 'Connected'
      });
    }

    sites.push({
      id: dc.id, name: dc.name, city: dc.city, state: dc.state, regionId: dc.regionId, tier: dc.tier, status: dc.status, type: siteType(db, dc), operator: dc.category,
      floors: dc.floors.length, halls: siteHalls.length, rows: siteRows, racks: dc.racks.length,
      devices: db.nes.filter(n => n.dcId === dc.id).length, plannedDevices: db.nes.filter(n => n.dcId === dc.id && isPlanned(n)).length,
      cables: 0, powerFeeds: pdus.length, designKw: dc.power.capacityKw, itKw: r1(dc.racks.reduce((a, r) => a + r.drawKw, 0)), rackBudgetKw: r1(dc.racks.reduce((a, r) => a + r.budgetKw, 0)),
      usedU: dc.racks.reduce((a, r) => a + r.usedU, 0), totalU: dc.racks.reduce((a, r) => a + r.heightU, 0), coolingKw: dc.cooling.capacityKw,
      commissionedOn: dc.commissionedOn, lat: dc.lat, lng: dc.lng
    });
  }

  /* ---- cables: data (every LLDP link once, routed through the site's structured cabling; length = cords + trunks + jumpers) */
  const rackName = new Map(db.datacenters.flatMap(d => d.racks.map(r => [r.id, r.name] as const)));
  const trunkLen = new Map<string, number>();
  for (const dc of db.datacenters) for (const t of sitePhys(db, dc.id)?.trunks ?? []) trunkLen.set(t.id, t.lengthM);
  for (const l of db.links) {
    if (l.protocol !== 'LLDP') continue;
    const a = db.neById.get(l.aNe), z = db.neById.get(l.zNe); if (!a || !z) continue;
    const ea = sitePhys(db, a.dcId)?.ends.get(`${l.id}|${a.id}`), ez = sitePhys(db, z.dcId)?.ends.get(`${l.id}|${z.id}`);
    const inter = a.dcId !== z.dcId;
    const route: DcimCable['route'] = inter ? 'Inter-site' : a.rackId === z.rackId || ea?.inRack ? 'In-rack' : 'Structured';
    const ifA = db.ifaces.get(a.id)?.find(i => i.name === l.aIf);
    const short = (x: string | undefined) => x?.replace(`${a.dcId}-`, '');
    const via = route === 'In-rack' ? 'In-rack cord'
      : route === 'Inter-site' ? `${ea?.panelId ? `${short(ea.panelId)} → ` : ''}ODF → ${db.datacenters.find(d => d.id === a.dcId)?.cabling.cable ?? 'outside plant'}${ea?.ospCore ? ` core ${ea.ospCore}` : ''}`
      : `${short(ea?.panelId) ?? 'Cabinet panel'} → ${short(ea?.trunkId) ?? 'trunk'} → ODF → ${short(ez?.trunkId) ?? 'trunk'}`;
    const tl = (e: typeof ea) => (e?.trunkId ? trunkLen.get(e.trunkId) ?? 20 : 0);
    cables.push({
      id: `CB-${l.id}`, dcId: a.dcId, kind: 'Data', type: cableType(ifA, route), aDevice: a.id, aName: a.name, aPort: l.aIf, aRack: rackName.get(a.rackId) ?? a.rackId,
      zDevice: z.id, zName: z.name, zPort: l.zIf, zRack: inter ? `${z.dcId} · ${rackName.get(z.rackId) ?? ''}` : rackName.get(z.rackId) ?? z.rackId,
      route, via, lengthM: route === 'In-rack' ? 2 : Math.round(3 + tl(ea) + 2 + (route === 'Structured' ? tl(ez) + 3 : 0)),
      status: l.state === 'down' ? 'Link down' : isPlanned(a) || isPlanned(z) ? 'Planned' : 'Connected', linkId: l.id
    });
  }
  for (const s of sites) s.cables = cables.filter(c => c.dcId === s.id).length;

  /* ---- catalogue: a device type per vendor + model, a module type per module name */
  const types = new Map<string, DcimDeviceType>();
  const typeSites = new Map<string, Set<string>>();
  for (const n of db.nes) {
    const id = typeIdOf(n);
    typeSites.set(id, (typeSites.get(id) ?? new Set()).add(n.dcId));
    const t = types.get(id);
    if (t) { t.devices++; continue; }
    const ifs = db.ifaces.get(n.id) ?? [];
    const groups = new Map<string, { type: string; speedMbps: number; count: number }>();
    for (const i of ifs) { const k = `${i.type}|${i.speedMbps}`; const g = groups.get(k) ?? { type: i.type, speedMbps: i.speedMbps, count: 0 }; g.count++; groups.set(k, g); }
    const ports = [...groups.values()].sort((a, b) => b.speedMbps - a.speedMbps);
    const u = n.uSize ?? 1;
    const host = NE_CATEGORY[n.role] !== 'network';
    types.set(id, {
      id, manufacturer: n.vendor, model: n.model, role: n.role, category: NE_CATEGORY[n.role], uHeight: u, fullDepth: host || u >= 2, airflow: n.role === 'DWDM' ? 'Side to side' : 'Front to rear',
      weightKg: deviceKg(n), typicalW: 0, psus: isOpaque(n) ? 2 : psus(n).length, platform: n.os, ports, mgmtPorts: isOpaque(n) ? 0 : 1, consolePorts: host || isOpaque(n) ? 0 : 1,
      moduleBays: n.modules.filter(m => !/^(PSU|PEM|FAN)/i.test(m.slot)).length, devices: 1, sites: 0,
      description: isOpaque(n) ? 'Customer equipment block (opaque to the operator)' : `${u}U ${n.role.toLowerCase()}${ports.length ? ` · ${ports.map(p => `${p.count}× ${p.type}`).join(' + ')}` : ''}`
    });
  }
  const drawByType = new Map<string, number[]>();
  for (const d of devices) if (d.powerW > 0) drawByType.set(d.typeId, [...(drawByType.get(d.typeId) ?? []), d.powerW]);
  for (const t of types.values()) { t.sites = typeSites.get(t.id)?.size ?? 0; const w = drawByType.get(t.id) ?? []; t.typicalW = w.length ? Math.round(w.reduce((a, x) => a + x, 0) / w.length) : 0; }
  const allTypes = [...types.values(), ...customTypes.filter(c => !types.has(c.id))].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model));

  const mods = new Map<string, DcimModuleType>();
  for (const n of db.nes) for (const m of n.modules) {
    if (m.state === 'Empty') continue;
    const id = slug(m.name);
    const x = mods.get(id) ?? { id, name: m.name, kind: moduleKind(m.slot, m.name), fits: [], installed: 0, faulty: 0 };
    x.installed++; if (m.state === 'Fault') x.faulty++;
    if (!x.fits.includes(n.model)) x.fits.push(n.model);
    mods.set(id, x);
  }

  for (const x of dcimOverlay.modules) if (!mods.has(x.id)) mods.set(x.id, { ...x });
  /* hand-entered power panels and feeds (no load until devices are cabled to them) */
  for (const p of dcimOverlay.panels) panels.push({ ...p, feeds: dcimOverlay.feeds.filter(f => f.panelId === p.id).length });
  for (const f of dcimOverlay.feeds) { feeds.push({ ...f }); const pn = panels.find(p => p.id === f.panelId); if (pn && !pn.manual) pn.feeds++; }
  return {
    sites, halls, rows, racks, devices, types: allTypes, modules: [...mods.values()].sort((a, b) => b.installed - a.installed), cables, panels, feeds,
    rackById: new Map(racks.map(r => [r.id, r])), hallById: new Map(halls.map(h => [h.id, h])), deviceById: new Map(devices.map(d => [d.id, d])),
    typeById: new Map(allTypes.map(t => [t.id, t])), cordsByRack, pduByRack
  };
}

/* the facility profile of a site, from the business model and what is in it */
function siteType(db: Db, dc: Datacenter): string {
  const gpu = dc.racks.some(r => r.density === 'ai');
  switch (db.persona) {
    case 'network': return dc.tier === 'Tier II' ? 'Telco exchange / PoP' : 'Telco core datacenter';
    case 'colocation': return gpu ? 'Colocation · AI-ready' : 'Retail colocation';
    case 'cloud': return gpu ? 'Cloud region · GPU zone' : 'Cloud region';
    case 'enterprise': return 'Enterprise datacenter';
    case 'neocloud': return 'AI / HPC GPU factory';
  }
}

/* ------------------------------------------------------------------ reads */

export function dcimRackView(db: Db, rackId: string): DcimRackView | null {
  const m = dcimModel(db);
  const rack = m.rackById.get(rackId); if (!rack) return null;
  const hall = m.hallById.get(rack.hallId)!;
  const devs = m.devices.filter(d => d.rackId === rackId).sort((a, b) => b.u - a.u);
  const phys = sitePhys(db, rack.dcId);
  const dc = db.datacenters.find(d => d.id === rack.dcId)!;
  const rk = dc.racks.find(r => r.id === rackId)!;
  /* U that the rack's usedU holds beyond its devices: the ODF patch-panel block in the patching rack */
  const devU = devs.reduce((a, d) => a + d.uHeight, 0);
  const reserved: DcimRackView['reserved'] = rk.usedU > devU ? [{ u: devs.length ? Math.max(...devs.map(d => d.u + d.uHeight)) : 2, uHeight: rk.usedU - devU, label: 'ODF patch panels' }] : [];
  const cords = (m.cordsByRack.get(rackId) ?? []).map(c => ({ ...c, deviceName: db.neById.get(c.neId)?.name ?? c.neId, pduName: phys?.pduById.get(c.pduId)?.name ?? c.pduId }));
  const ids = new Set(devs.map(d => d.id));
  const row = m.rows.find(r => r.id === rack.rowId);
  for (const x of dcimOverlay.reservations.filter(r => r.rackId === rackId)) reserved.push({ u: x.u, uHeight: x.uHeight, label: x.label, id: x.id, by: x.by, until: x.until });
  const names = new Set([rack.id, rack.name, ...devs.map(d => d.id), ...devs.map(d => d.name)]);
  const activity = db.audit.filter(a => names.has(a.object) || a.object.startsWith(`${rack.id}`) || a.next.includes(rack.name)).slice(-40).reverse()
    .map(a => ({ id: a.id, at: a.at, actor: a.actor, object: a.object, field: a.field, prev: a.prev, next: a.next }));
  return {
    rack, devices: devs, reserved, activity, panels: (phys?.panels ?? []).filter(p => p.rackId === rackId), feeds: m.feeds.filter(f => f.rackId === rackId), cords,
    cables: m.cables.filter(c => c.kind === 'Data' && (ids.has(c.aDevice) || ids.has(c.zDevice))), hall,
    neighbours: (row?.racks ?? []).filter(id => id !== rackId).map(id => ({ id, name: m.rackById.get(id)?.name ?? id }))
  };
}

export function dcimComponents(db: Db, deviceId: string): DcimComponent[] {
  const n = db.neById.get(deviceId); if (!n) return [];
  const m = dcimModel(db);
  const out: DcimComponent[] = [];
  for (const i of db.ifaces.get(n.id) ?? []) {
    const l = db.links.find(x => x.protocol === 'LLDP' && ((x.aNe === n.id && x.aIf === i.name) || (x.zNe === n.id && x.zIf === i.name)));
    const peer = i.peer ? db.neById.get(i.peer.neId) : undefined;
    out.push({
      id: `${n.id}:${i.name}`, deviceId: n.id, kind: 'Interface', name: i.name, type: i.type, speedMbps: i.speedMbps,
      state: i.state === 'admin-down' ? 'Disabled' : i.state === 'down' ? (i.peer ? 'Down' : 'Free') : i.peer ? 'Connected' : 'Free',
      cableId: l ? `CB-${l.id}` : undefined, peer: i.peer && peer ? { deviceId: peer.id, deviceName: peer.name, port: i.peer.ifName } : undefined,
      detail: i.optics ? `${i.optics.model} · Rx ${i.optics.rxDbm} dBm` : i.description || undefined
    });
  }
  const cords = (m.cordsByRack.get(n.rackId) ?? []).filter(c => c.neId === n.id);
  const phys = sitePhys(db, n.dcId);
  const failed = new Set(n.modules.filter(x => /^(PSU|PEM)/.test(x.slot) && x.state === 'Fault').map(x => x.slot));
  for (const slot of isOpaque(n) ? cords.map(c => c.psu) : psus(n)) {
    const c = cords.find(x => x.psu === slot); const p = c ? phys?.pduById.get(c.pduId) : undefined;
    out.push({
      id: `${n.id}:${slot}`, deviceId: n.id, kind: 'Power port', name: slot, type: p?.kind === 'DC' ? '−48 V DC input' : p && p.capacityKw >= 22 ? 'IEC C20' : 'IEC C14',
      state: failed.has(slot) ? 'Failed' : !c ? 'Free' : c.state === 'no-power' ? 'Down' : 'Connected', cableId: c ? `PC-${n.id}-${slot}` : undefined,
      peer: c && p ? { deviceId: p.id, deviceName: `${p.name} (${p.upstreamName})`, port: `Outlet ${c.outlet}` } : undefined,
      detail: c ? `${c.drawW} W · ${c.state.replace('-', ' ')}` : undefined
    });
  }
  if (!isOpaque(n)) {
    out.push({ id: `${n.id}:mgmt`, deviceId: n.id, kind: 'Management', name: NE_CATEGORY[n.role] === 'network' ? 'mgmt0' : 'BMC', type: '1G copper', state: 'Connected', detail: n.ip });
    if (NE_CATEGORY[n.role] === 'network') out.push({ id: `${n.id}:con`, deviceId: n.id, kind: 'Console', name: 'con0', type: 'RJ45 console', state: 'Connected', detail: 'Console server · out of band' });
  }
  /* free bays: a router chassis has two line-card slots (FPC0–1), a server eight drive bays (DISK0–7) */
  const has = new Set(n.modules.map(x => x.slot));
  const spare = n.role === 'Router' && n.modules.some(x => /^FPC/.test(x.slot)) ? ['FPC0', 'FPC1'] : n.role === 'Server' && n.modules.some(x => /^DISK/.test(x.slot)) ? Array.from({ length: 8 }, (_, k) => `DISK${k}`) : [];
  for (const slot of spare.filter(x => !has.has(x))) out.push({ id: `${n.id}:${slot}`, deviceId: n.id, kind: 'Module bay', name: slot, type: 'Empty bay', state: 'Empty', detail: /^FPC/.test(slot) ? 'Line-card slot' : 'Drive bay' });
  for (const x of n.modules.filter(y => !/^(PSU|PEM)/.test(y.slot))) {
    out.push({ id: `${n.id}:${x.slot}`, deviceId: n.id, kind: 'Module bay', name: x.slot, type: x.state === 'Empty' ? 'Empty bay' : x.name, state: x.state === 'Empty' ? 'Empty' : x.state === 'Fault' ? 'Failed' : 'Connected', detail: x.state === 'Empty' ? undefined : `S/N ${x.serial} · ${x.tempC}°C` });
  }
  return out;
}

export function dcimCatalog(db: Db): DcimCatalog {
  const m = dcimModel(db);
  const mf = new Map<string, { name: string; types: number; devices: number }>();
  for (const t of m.types) { const x = mf.get(t.manufacturer) ?? { name: t.manufacturer, types: 0, devices: 0 }; x.types++; x.devices += t.devices; mf.set(t.manufacturer, x); }
  const roles = new Map<string, DcimCatalog['roles'][number]>();
  for (const t of m.types) { const x = roles.get(t.role) ?? { role: t.role, category: t.category, types: 0, devices: 0 }; x.types++; x.devices += t.devices; roles.set(t.role, x); }
  const pl = new Map<string, number>();
  for (const d of m.devices) if (d.status !== 'Tenant-owned') pl.set(d.platform, (pl.get(d.platform) ?? 0) + 1);
  return {
    manufacturers: [...mf.values()].sort((a, b) => b.devices - a.devices),
    roles: [...roles.values()].sort((a, b) => b.devices - a.devices),
    platforms: [...pl].map(([name, devices]) => ({ name, devices })).sort((a, b) => b.devices - a.devices)
  };
}

/* free U ranges in a rack (1-based, bottom up), for placing a new device */
export function freeSlots(db: Db, rackId: string): { from: number; to: number }[] {
  const dc = db.datacenters.find(d => d.racks.some(r => r.id === rackId)); if (!dc) return [];
  const rk = dc.racks.find(r => r.id === rackId)!;
  const taken = new Array(rk.heightU + 2).fill(false);
  const nes = db.nes.filter(n => n.rackId === rackId);
  for (const n of nes) for (let u = n.u; u < n.u + (n.uSize ?? 1); u++) taken[u] = true;
  const devU = nes.reduce((a, n) => a + (n.uSize ?? 1), 0);
  if (rk.usedU > devU) { const top = nes.length ? Math.max(...nes.map(n => n.u + (n.uSize ?? 1))) : 2; for (let u = top; u < top + rk.usedU - devU; u++) taken[u] = true; }
  for (const x of dcimOverlay.reservations.filter(r => r.rackId === rackId)) for (let u = x.u; u < x.u + x.uHeight; u++) taken[u] = true;
  const out: { from: number; to: number }[] = [];
  let s = 0;
  for (let u = 1; u <= rk.heightU + 1; u++) {
    if (u <= rk.heightU && !taken[u]) { if (!s) s = u; }
    else if (s) { out.push({ from: s, to: u - 1 }); s = 0; }
  }
  return out;
}
