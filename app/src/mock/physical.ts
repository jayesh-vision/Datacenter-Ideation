/* Physical last mile (12-Oct-2026, user: "how will power come to this device, how is the network cable attached?").
   A read model derived per site from what the generator already holds: racks, devices and their power supplies, LLDP links,
   the UPS / rectifier plant, cooling units, CDUs and the open alarms. Nothing here is typed in and nothing in the generated
   collections changes, so every persona's fingerprint stays the same.

   Power  : utility feed → UPS module (A side = UPS-2/4, B side = UPS-1/3, so "UPS-2 on battery" is the A side) or the −48 V
            rectifier plant → rack PDU / BDFB per side → breaker bank → outlet → device PSU. Odd PSUs plug into A, even into B.
            Each side of a cabinet is rated for the whole cabinet (2N at the rack), so the side's capacity = the rack budget.
   Cooling: every rack sits in one room; the room's CRAH / CRAC units carry its air heat; liquid racks put ~75% into a CDU.
   Cabling: structured cabling (TIA-942 style): device port → patch cord → cabinet patch panel → trunk → ODF panel in the
            site's patching rack → cross-connect jumper → … the same back out to the far device; in-rack links are one cord;
            inter-site links leave through the ODF onto the outside-plant cable (cores from the site's cable ledger).
   Tier II sites have one distribution path (one utility feed, one tray route, one building entry), which is what the
   single-point-of-failure list reports for them. */
import type {
  CableHop, CablePath, CoolingZone, Datacenter, Interface, Link, NetworkElement, PhysState, PowerCord, PowerSide, PduBank, RackCooling, RackPdu,
  PatchPanel, SitePhysical, Spof, Trunk, WhatIf, Severity
} from '../api/types';
import type { Db } from './generate';
import { mulberry32, seedOf, intBetween, between } from '../lib/rng';
import { dcAt } from './geo';
import { edgeId } from './personas';

const r1 = (n: number) => Math.round(n * 10) / 10;
const isOpaque = (n: NetworkElement) => n.role === 'Tenant gear';
const planned = (n: NetworkElement) => n.discovery === 'not-discovered' && n.ndReason === 'planned';
const tier2 = (dc: Datacenter) => dc.tier === 'Tier II';

/* per-device draw weight (kW-ish); scaled so a rack's cords add up to its measured draw */
const ROLE_W: Record<string, number> = { Router: 0.9, Switch: 0.45, DWDM: 0.8, Firewall: 0.6, Access: 0.3, Server: 0.7, Storage: 1.1, GPU: 10, 'Tenant gear': 2.6 };
const weightOf = (n: NetworkElement, gpuKw?: number) => gpuKw ?? (ROLE_W[n.role] ?? 0.5) * (n.layer === 'core' || n.layer === 'spine' ? 1.6 : 1);

/* standard rack power ratings: the smallest that carries the side's full share */
const RATINGS: { kw: number; volts: number; phases: 1 | 3; amps: number; model: string; outlets: number }[] = [
  { kw: 7.4, volts: 230, phases: 1, amps: 32, model: 'Metered rack PDU · 1-ph 32 A · 230 V', outlets: 24 },
  { kw: 11, volts: 400, phases: 3, amps: 16, model: 'Switched rack PDU · 3-ph 16 A · 400 V', outlets: 24 },
  { kw: 22, volts: 400, phases: 3, amps: 32, model: 'Switched rack PDU · 3-ph 32 A · 400 V', outlets: 36 },
  { kw: 43.6, volts: 400, phases: 3, amps: 63, model: 'High-density rack PDU · 3-ph 63 A · 400 V', outlets: 48 },
  { kw: 86, volts: 400, phases: 3, amps: 125, model: 'Busway tap-off · 3-ph 125 A · 400 V', outlets: 48 }
];

export interface SitePhys extends SitePhysical {
  /* lookups the read functions use */
  ends: Map<string, End>;          // `${linkId}|${neId}` → where that end of the link is patched
  cordsOf: Map<string, PowerCord[]>;
  pduById: Map<string, RackPdu>;
}
export interface End { linkId: string; neId: string; rackId: string; ifName: string; inRack: boolean; panelId?: string; panelPort?: number; trunkId?: string; odfPanel?: string; odfPort?: number; ospCore?: number; ospStrand?: string; ospRack?: string; route: string; cordId: string }

const linkIdx = new WeakMap<Db, Map<string, Link>>();
const linkOf = (db: Db, id: string) => { let m = linkIdx.get(db); if (!m) { m = new Map(db.links.map(l => [l.id, l])); linkIdx.set(db, m); } return m.get(id); };
const cache = new Map<string, SitePhys>();
let cacheDb: Db | null = null;
export function clearPhysical() { cache.clear(); cacheDb = null; }
export function sitePhys(db: Db, dcId: string): SitePhys | null {
  if (cacheDb !== db) { cache.clear(); cacheDb = db; }
  const hit = cache.get(dcId); if (hit) return hit;
  const dc = db.datacenters.find(d => d.id === dcId); if (!dc) return null;
  const s = build(db, dc);
  cache.set(dcId, s);
  return s;
}

/* ------------------------------------------------------------------ build */

function build(db: Db, dc: Datacenter): SitePhys {
  const nes = db.nes.filter(n => n.dcId === dc.id);
  const live = db.alerts.filter(a => a.state !== 'cleared' && a.dcId === dc.id);
  const p = dc.power;
  const ac = p.feeds.filter(f => f.type === 'AC');
  const feedA = ac[0], feedB = ac[1] ?? ac[0];
  const upsOf = (side: PowerSide) => p.ups.filter((_, i) => ((i + 1) % 2 === 0) === (side === 'A'));
  const rect = p.feeds.find(f => f.type === 'DC');
  const rectName = rect?.source.split(' ').pop() ?? 'RECT-01';

  /* ---- power */
  const pdus: RackPdu[] = [], cords: PowerCord[] = [];
  const gpuKw = (id: string) => db.gpu?.nodes.get(id)?.powerKw;
  const tripA = new Set(live.filter(a => a.rackId && /PDU-A Breaker Trip/i.test(a.title)).map(a => a.rackId!));
  const outletTrip = new Map(live.filter(a => a.neId && a.title === 'Host Power Lost').map(a => [a.neId!, Number(/outlet (\d+)/.exec(a.description)?.[1] ?? 14)]));
  /* one cabinet per site may have a device with both cords on the A side (found at audit): seeded, never on a story device */
  const rrSite = mulberry32(seedOf(`${dc.id}:cords`));
  const candidates = nes.filter(n => !planned(n) && !isOpaque(n) && psus(n).length === 2 && !outletTrip.has(n.id) && n.id !== edgeId(db.persona, dcAt(1), 1) && !n.isPe);
  const miswired = dc.status !== 'planned' && candidates.length && rrSite() < 0.3 ? candidates[intBetween(rrSite, 0, candidates.length - 1)].id : null;

  const roomKeys = dc.floors.flatMap(f => f.rooms.map(r => `${f.name}|${r}`));
  dc.racks.forEach(rk => {
    const roomIdx = Math.max(0, roomKeys.indexOf(`${rk.floor}|${rk.room}`));
    const inRack = nes.filter(n => n.rackId === rk.id && !planned(n)).sort((a, b) => a.u - b.u);
    /* telco access gear and optical shelves run on the −48 V plant; core / spine routers report AC power entry modules */
    const dcPowered = (n: NetworkElement) => db.persona === 'network' && (n.role === 'DWDM' || (n.role === 'Router' && n.layer === 'access')) && !n.modules.some(m => /AC/.test(m.name));
    const kinds: ('AC' | 'DC')[] = inRack.some(dcPowered) ? ['AC', 'DC'] : ['AC'];
    /* draw per device, scaled to the rack's measured draw (3% stays with the cabinet: fans, lights, PDU electronics) */
    const ws = inRack.map(n => weightOf(n, gpuKw(n.id)));
    const sumW = ws.reduce((a, w) => a + w, 0) || 1;
    const itKw = inRack.length ? rk.drawKw * 0.97 : 0;
    const draw = new Map(inRack.map((n, i) => [n.id, (ws[i] / sumW) * itKw]));
    const rating = RATINGS.find(x => x.kw >= rk.budgetKw) ?? RATINGS[RATINGS.length - 1];
    const mk = (side: PowerSide, kind: 'AC' | 'DC'): RackPdu => {
      /* one UPS per side per room: the room's A and B busways each hang off one module */
      const ups = upsOf(side); const u = ups.length ? ups[roomIdx % ups.length] : p.ups[0];
      const dcKind = kind === 'DC';
      return {
        id: `${rk.id}-${dcKind ? 'BDFB' : 'PDU'}-${side}`, dcId: dc.id, rackId: rk.id, name: `${dcKind ? 'BDFB' : 'PDU'}-${side}`, side, kind,
        model: dcKind ? '−48 V DC fuse panel (BDFB) · 2 × 125 A' : rating.model, volts: dcKind ? 48 : rating.volts, phases: dcKind ? 1 : rating.phases, ratingA: dcKind ? 125 : rating.amps,
        capacityKw: rk.budgetKw, outlets: dcKind ? 12 : rating.outlets, loadKw: 0, banks: [],
        upstreamId: dcKind ? `${dc.id}-${rectName}` : u?.id ?? '', upstreamName: dcKind ? `${rectName} (−48 V plant + battery)` : u?.name ?? 'UPS',
        feedId: (side === 'A' ? feedA?.id : feedB?.id) ?? 'AC-1', state: 'ok'
      };
    };
    const rackPdus: RackPdu[] = kinds.flatMap(k => [mk('A', k), mk('B', k)]);
    /* cords: PSU1/3 → A, PSU2/4 → B; a miswired device has both on A */
    const plan: { n: NetworkElement; slot: string; pdu: RackPdu }[] = [];
    for (const n of inRack) {
      const kind = dcPowered(n) ? 'DC' : 'AC';
      psus(n).forEach((slot, k) => {
        const side: PowerSide = n.id === miswired ? 'A' : k % 2 === 0 ? 'A' : 'B';
        plan.push({ n, slot, pdu: rackPdus.find(x => x.kind === kind && x.side === side)! });
      });
    }
    /* banks (a phase on a 3-phase unit): cords are spread round-robin over them, as installers balance phases */
    for (const x of rackPdus) {
      const cnt = plan.filter(q => q.pdu === x).length;
      x.outlets = Math.max(x.outlets, Math.ceil(cnt / 12) * 12, outletTrip.size ? 24 : 0);
      const nb = x.kind === 'DC' ? 2 : x.phases === 3 ? 3 : 2, per = Math.ceil(x.outlets / nb);
      x.banks = Array.from({ length: nb }, (_, b) => ({ id: `${x.id}-B${b + 1}`, name: x.kind === 'DC' ? `Fuse bank ${b + 1}` : x.phases === 3 ? `L${b + 1}` : `Bank ${b + 1}`, from: b * per + 1, to: Math.min(x.outlets, (b + 1) * per), breakerA: x.kind === 'DC' ? 125 : x.phases === 3 ? x.ratingA : 16, loadA: 0, state: 'ok' as PduBank['state'] }));
    }
    const fill = new Map<string, number>(); // bank id → outlets used
    const seq = new Map<string, number>();  // pdu id → cords placed
    const rackCords: PowerCord[] = [];
    for (const q of plan) {
      const k = seq.get(q.pdu.id) ?? 0; seq.set(q.pdu.id, k + 1);
      let bank = q.pdu.banks[k % q.pdu.banks.length];
      if ((fill.get(bank.id) ?? 0) > bank.to - bank.from) bank = q.pdu.banks.find(b => (fill.get(b.id) ?? 0) <= b.to - b.from) ?? bank;
      const used = fill.get(bank.id) ?? 0; fill.set(bank.id, used + 1);
      let outlet = bank.from + used;
      if (outletTrip.has(q.n.id) && q.pdu.side === 'B') outlet = outletTrip.get(q.n.id)!;
      rackCords.push({ neId: q.n.id, psu: q.slot, pduId: q.pdu.id, outlet, bankId: '', drawW: 0, state: 'live' });
    }
    /* the story outlet must not be shared: move whoever else landed on it to a free outlet */
    for (const [neId, o] of outletTrip) {
      const mine = rackCords.find(c => c.neId === neId && c.outlet === o); if (!mine) continue;
      const pdu = rackPdus.find(x => x.id === mine.pduId)!;
      for (const c of rackCords.filter(c => c !== mine && c.pduId === mine.pduId && c.outlet === o)) {
        const taken = new Set(rackCords.filter(z => z.pduId === pdu.id).map(z => z.outlet));
        c.outlet = Array.from({ length: pdu.outlets }, (_, i) => i + 1).find(i => !taken.has(i)) ?? pdu.outlets + 1;
      }
    }
    for (const x of rackPdus) {
      if (x.side === 'A' && tripA.has(rk.id)) { x.state = 'tripped'; x.note = 'Breaker tripped: the cabinet runs on the B side only'; x.banks.forEach(b => { b.state = 'tripped'; }); }
      const u = p.ups.find(v => v.id === x.upstreamId);
      if (x.state === 'ok' && u && u.state === 'On battery') { x.state = 'on-battery'; x.note = `${u.name} on battery · about ${u.batteryMin} min autonomy at ${u.loadPct}% load`; }
      if (x.state === 'ok' && u && (u.state === 'Fault' || u.state === 'Bypass')) { x.state = 'warn'; x.note = `${u.name} in ${u.state.toLowerCase()}: no conditioned power on this side`; }
    }
    for (const c of rackCords) { const x = rackPdus.find(y => y.id === c.pduId)!; c.bankId = (x.banks.find(b => c.outlet >= b.from && c.outlet <= b.to) ?? x.banks[x.banks.length - 1]).id; }
    /* state + load sharing: a device's draw splits over its supplies that still have power */
    for (const n of inRack) {
      const mine = rackCords.filter(c => c.neId === n.id);
      const failed = new Set(n.modules.filter(m => /^(PSU|PEM)/.test(m.slot) && m.state === 'Fault').map(m => m.slot));
      for (const c of mine) {
        const pdu = rackPdus.find(x => x.id === c.pduId)!;
        if (failed.has(c.psu)) c.state = 'psu-failed';
        else if (pdu.state === 'tripped' || (outletTrip.has(n.id) && c.outlet === outletTrip.get(n.id) && pdu.side === 'B')) c.state = 'no-power';
        else if (pdu.state === 'on-battery') c.state = 'on-battery';
      }
      const on = mine.filter(c => c.state === 'live' || c.state === 'on-battery');
      const w = (draw.get(n.id) ?? 0) * 1000;
      for (const c of on) c.drawW = Math.round(w / on.length);
    }
    /* loads: cords + the cabinet's own 3% split over the AC sides that are up */
    const upAc = rackPdus.filter(x => x.kind === 'AC' && x.state !== 'tripped');
    for (const x of rackPdus) {
      const cw = rackCords.filter(c => c.pduId === x.id).reduce((a, c) => a + c.drawW, 0) / 1000;
      x.loadKw = r1(cw + (x.kind === 'AC' && x.state !== 'tripped' ? (rk.drawKw - itKw) / Math.max(1, upAc.length) : 0));
      for (const b of x.banks) {
        const kw = rackCords.filter(c => c.bankId === b.id).reduce((a, c) => a + c.drawW, 0) / 1000;
        b.loadA = b.state === 'tripped' ? 0 : r1((kw * 1000) / (x.kind === 'DC' ? 48 : 230));
        if (b.state !== 'tripped' && b.loadA >= b.breakerA * 0.8) b.state = 'warn';
      }
      if (x.state === 'ok' && x.loadKw >= x.capacityKw * 0.8) { x.state = 'warn'; x.note = `${Math.round((x.loadKw / x.capacityKw) * 100)}% of its rating`; }
    }
    const story = rackCords.find(c => c.state === 'no-power' && outletTrip.has(c.neId));
    if (story) { const x = rackPdus.find(y => y.id === story.pduId)!; if (x.state === 'ok') x.state = 'warn'; x.note = `Outlet ${story.outlet} breaker tripped`; }
    pdus.push(...rackPdus); cords.push(...rackCords);
  });

  /* ---- cooling */
  const cdus = db.gpu?.cdus.filter(c => c.dcId === dc.id) ?? [];
  const cageCdu = new Map((db.gpu?.cages ?? []).filter(c => c.dcId === dc.id).map(c => [c.rackId, c.cduId]));
  const zones: CoolingZone[] = [], rackCooling: RackCooling[] = [];
  /* redundancy is judged for the site the way Facilities does (units needed for the load + one spare); a floor carries the
     finding when it has a unit down or a hot room */
  const cu = dc.cooling, op = cu.units.filter(u => u.status === 'Operational');
  const needed = Math.max(1, Math.ceil(cu.loadKw / (cu.units[0]?.capacityKw || 1)));
  const designOk = op.length >= needed + (cu.redundancy === 'N+1' ? 1 : 0);
  const siteShort = op.reduce((a, u) => a + u.capacityKw, 0) < cu.loadKw;
  for (const f of dc.floors) {
    const keys = f.rooms.map(rm => `${f.name} · ${rm}`);
    const air = dc.cooling.units.filter(u => keys.includes(u.zone) && u.type !== 'CDU');
    const racks = dc.racks.filter(r => r.floor === f.name);
    const zCdu = cdus.filter(c => keys.includes(c.room) || c.racks.some(id => racks.some(r => r.id === id)));
    let airKw = 0, liqKw = 0;
    for (const room of f.rooms) {
      const key = `${f.name} · ${room}`;
      const inRoom = racks.filter(r => r.room === room);
      const local = air.filter(u => u.zone === key);
      inRoom.forEach((rk, i) => {
        const cduId = cdus.find(c => c.racks.includes(rk.id))?.id ?? cageCdu.get(rk.id);
        const liquidPct = rk.liquid ? 0.75 : 0;
        airKw += rk.drawKw * (1 - liquidPct); liqKw += rk.drawKw * liquidPct;
        const near = local.length ? local : air;
        const primary = near.length ? near[Math.min(near.length - 1, Math.floor((i / Math.max(1, inRoom.length)) * near.length))].id : null;
        rackCooling.push({ rackId: rk.id, zoneId: f.name, primaryId: primary, unitIds: [...local, ...air.filter(u => !local.includes(u))].map(u => u.id), ...(cduId ? { cduId } : {}), liquidPct });
      });
    }
    const run = air.filter(u => u.status === 'Operational');
    const runningKw = run.reduce((a, u) => a + u.capacityKw, 0);
    const afterLossKw = runningKw - Math.max(0, ...run.map(u => u.capacityKw));
    const heat = r1(airKw * 1.03);
    const hotRooms = f.rooms.filter(rm => { const key = `${f.name} · ${rm}`; return air.some(u => u.zone === key && u.status === 'Failed') || dc.cooling.sensors.some(x => x.zone === key && x.tempC > 27); });
    const unitDown = air.some(u => u.status !== 'Operational');
    const st: CoolingZone['state'] = !racks.length ? 'n+1' : siteShort && unitDown ? 'short' : (!designOk && unitDown) || hotRooms.length ? 'no-redundancy' : 'n+1';
    zones.push({ id: f.name, dcId: dc.id, floor: f.name, rooms: f.rooms, hotRooms, unitIds: air.map(u => u.id), cduIds: zCdu.map(c => c.id), rackIds: racks.map(r => r.id),
      airHeatKw: heat, liquidHeatKw: r1(liqKw), installedKw: air.reduce((a, u) => a + u.capacityKw, 0), runningKw, afterLossKw,
      state: st });
  }

  /* ---- structured cabling */
  const lldp = db.links.filter(l => l.protocol === 'LLDP' && (db.neById.get(l.aNe)!.dcId === dc.id || db.neById.get(l.zNe)!.dcId === dc.id));
  const odfRack = dc.racks.find(r => r.role === 'ODF / patching') ?? dc.racks[dc.racks.length - 1];
  const single = tier2(dc);
  const routes = single ? ['Tray route 1'] : ['Tray route 1', 'Tray route 2'];
  const ends = new Map<string, End>();
  const perNe = new Map<string, number>();
  const panelUse = new Map<string, number>(); // `${rackId}|${kind}` → ports used
  const odfUse = { trunk: 0, osp: 0 };
  /* the outside-plant cable lands on its own ODF; a change that names it ("Re-patch ODF RACK-D core 7") places it */
  const ospRackName = db.changes.map(c => c.dcId === dc.id ? /Re-patch ODF (RACK-\w+)/.exec(c.title)?.[1] : undefined).find(Boolean);
  const ospRack = dc.racks.find(r => r.name === ospRackName) ?? odfRack;
  const ledgerStrand = new Map(dc.cabling.ledger.map(c => [c.port, c.strand]));
  const ledgerCore = new Map(dc.cabling.ledger.filter(c => c.state === 'connected' && c.neId && c.inIf).map(c => [`${c.neId}:${c.inIf}`, c.port]));
  const freeCores = dc.cabling.ledger.filter(c => c.state === 'free').map(c => c.port);
  const portKind = (ifn?: Interface) => (ifn && ifn.speedMbps <= 1000 ? 'RJ45' : ifn && ifn.speedMbps >= 400000 ? 'MPO' : 'LC duplex');
  let cordSeq = 1;
  for (const l of lldp) {
    for (const [ne, ifn, far] of [[l.aNe, l.aIf, l.zNe], [l.zNe, l.zIf, l.aNe]] as const) {
      const n = db.neById.get(ne)!; if (n.dcId !== dc.id) continue;
      const fn = db.neById.get(far)!;
      const it = db.ifaces.get(ne)?.find(i => i.name === ifn);
      const k = perNe.get(ne) ?? 0; perNe.set(ne, k + 1);
      const inRack = fn.dcId === dc.id && fn.rackId === n.rackId;
      const e: End = { linkId: l.id, neId: ne, rackId: n.rackId, ifName: ifn, inRack, route: routes[k % routes.length], cordId: `${dc.id}-PC-${String(cordSeq++).padStart(5, '0')}` };
      if (!inRack) {
        const pk = portKind(it);
        if (n.rackId !== odfRack.id) {
          const key = `${n.rackId}|${pk}`; const used = (panelUse.get(key) ?? 0) + 1; panelUse.set(key, used);
          e.panelId = `${n.rackId}-PP-${pk === 'RJ45' ? 'C' : pk === 'MPO' ? 'M' : 'F'}${Math.ceil(used / 24)}`; e.panelPort = ((used - 1) % 24) + 1;
          e.trunkId = `${n.rackId}-TRK-${routes.indexOf(e.route) + 1}${pk === 'RJ45' ? 'C' : ''}`;
        }
        const t = ++odfUse.trunk; e.odfPanel = `${odfRack.id}-ODF-${Math.ceil(t / 24)}`; e.odfPort = ((t - 1) % 24) + 1;
        if (fn.dcId !== dc.id) { e.ospCore = ledgerCore.get(`${ne}:${ifn}`) ?? freeCores[odfUse.osp++ % Math.max(1, freeCores.length)] ?? 0; e.ospStrand = ledgerStrand.get(e.ospCore); e.ospRack = ospRack.id; }
      }
      ends.set(`${l.id}|${ne}`, e);
    }
  }
  const panels: PatchPanel[] = [];
  for (const [key, used] of panelUse) {
    const [rackId, kind] = key.split('|') as [string, PatchPanel['kind']];
    for (let i = 1; i <= Math.ceil(used / 24); i++) panels.push({ id: `${rackId}-PP-${kind === 'RJ45' ? 'C' : kind === 'MPO' ? 'M' : 'F'}${i}`, dcId: dc.id, rackId, name: `PP-${kind === 'RJ45' ? 'C' : kind === 'MPO' ? 'M' : 'F'}${i}`, kind, role: 'rack', ports: 24, used: Math.min(24, used - (i - 1) * 24) });
  }
  for (let i = 1; i <= Math.ceil(odfUse.trunk / 24); i++) panels.push({ id: `${odfRack.id}-ODF-${i}`, dcId: dc.id, rackId: odfRack.id, name: `ODF-${i}`, kind: 'LC duplex', role: 'odf', ports: 24, used: Math.min(24, odfUse.trunk - (i - 1) * 24) });
  const trunks: Trunk[] = [];
  const byTrunk = new Map<string, End[]>();
  for (const e of ends.values()) if (e.trunkId) byTrunk.set(e.trunkId, [...(byTrunk.get(e.trunkId) ?? []), e]);
  const roomOf = (id: string) => { const r = dc.racks.find(x => x.id === id)!; return `${r.floor}|${r.room}`; };
  for (const [id, es] of byTrunk) {
    const rk = dc.racks.find(r => r.id === es[0].rackId)!;
    const copper = id.endsWith('C');
    const rr = mulberry32(seedOf(id));
    const near = roomOf(rk.id) === roomOf(odfRack.id);
    const downAll = es.length > 1 && es.every(e => linkOf(db, e.linkId)?.state === 'down');
    trunks.push({ id, dcId: dc.id, aPanel: `${rk.id}-PP-${copper ? 'C' : 'F'}1`, zPanel: `${odfRack.id}-ODF-1`, aRackId: rk.id, zRackId: odfRack.id,
      kind: copper ? 'Cat6A 24-cable bundle' : `MPO-24 OM4 trunk × ${Math.ceil(es.length / 12)}`, pairs: copper ? 24 : Math.ceil(es.length / 12) * 12, used: es.length, route: es[0].route,
      lengthM: Math.round(near ? between(rr, 12, 32) : between(rr, 40, 95)), state: downAll ? 'bad' : 'ok' });
  }

  /* ---- single points of failure */
  const spofs = buildSpofs(db, dc, nes, pdus, cords, zones, ends, lldp, single);

  const cordsOf = new Map<string, PowerCord[]>();
  for (const c of cords) cordsOf.set(c.neId, [...(cordsOf.get(c.neId) ?? []), c]);
  const devs = [...cordsOf.values()];
  const dual = (cs: PowerCord[]) => new Set(cs.filter(c => c.state === 'live' || c.state === 'on-battery').map(c => c.pduId.slice(-1))).size >= 2;
  const endsArr = [...ends.values()];
  return {
    dcId: dc.id, pdus, cords, zones, rackCooling, panels, trunks, spofs, ends, cordsOf, pduById: new Map(pdus.map(x => [x.id, x])),
    totals: { pdus: pdus.length, cords: cords.length, dualFed: devs.filter(dual).length, singleFed: devs.filter(cs => !dual(cs)).length, panels: panels.length, trunks: trunks.length,
      paths: new Set(endsArr.map(e => e.linkId)).size, inRack: new Set(endsArr.filter(e => e.inRack).map(e => e.linkId)).size,
      structured: new Set(endsArr.filter(e => !e.inRack && e.ospCore === undefined).map(e => e.linkId)).size, interSite: new Set(endsArr.filter(e => e.ospCore !== undefined).map(e => e.linkId)).size }
  };
}

/* power-supply slots a device has (from its modules; the record's two supplies when it has not reported yet; tenant gear = two feeds) */
export function psus(n: NetworkElement): string[] {
  const s = n.modules.filter(m => /^(PSU|PEM)/.test(m.slot)).map(m => m.slot);
  if (s.length) return s;
  if (isOpaque(n)) return ['Feed A', 'Feed B'];
  return ['PSU1', 'PSU2'];
}

/* ------------------------------------------------------------ resilience */

function buildSpofs(db: Db, dc: Datacenter, nes: NetworkElement[], pdus: RackPdu[], cords: PowerCord[], zones: CoolingZone[], ends: Map<string, End>, lldp: Link[], single: boolean): Spof[] {
  const out: Spof[] = [];
  const svc = (neIds: string[], linkIds: string[] = []) => {
    const ids = new Set(neIds), lk = new Set(linkIds);
    const ss = db.services.filter(s => s.status !== 'Disabled' && (ids.has(s.neId) || s.path.some(p => ids.has(p)) || s.linkIds.some(l => lk.has(l))));
    return { services: ss.length, customers: new Set(ss.map(s => s.customerId)).size };
  };
  const add = (x: Omit<Spof, 'dcId' | 'services' | 'customers'> & { links?: string[] }) => { const { links, ...rest } = x; out.push({ ...rest, dcId: dc.id, ...svc(x.neIds, links) }); };
  const rackName = (id: string) => dc.racks.find(r => r.id === id)?.name ?? id;
  const short = (id: string) => id.replace(`${dc.id}-`, '');
  const to = (q: string) => `/facilities?dc=${dc.id}&tab=resilience${q}`;
  if (dc.status === 'planned') return out;

  /* devices left on one live supply */
  const byNe = new Map<string, PowerCord[]>();
  for (const c of cords) byNe.set(c.neId, [...(byNe.get(c.neId) ?? []), c]);
  const oneSide: string[] = [], psuFail: string[] = [], tripped: string[] = [], miswired: string[] = [];
  for (const [neId, cs] of byNe) {
    const on = cs.filter(c => c.state === 'live' || c.state === 'on-battery');
    if (!on.length) continue; // down, not a risk: the alarm / incident covers it
    const sides = new Set(on.map(c => c.pduId.slice(-1)));
    if (sides.size >= 2) continue;
    oneSide.push(neId);
    if (cs.every(c => c.pduId.endsWith('-A')) && cs.length >= 2) miswired.push(neId);
    else if (cs.some(c => c.state === 'psu-failed')) psuFail.push(neId);
    else tripped.push(neId);
  }
  if (miswired.length) add({ id: `${dc.id}-SPOF-CORDS`, domain: 'Power', severity: 'major', title: `${miswired.length === 1 ? short(miswired[0]) : `${miswired.length} devices`}: both power cords on PDU-A`,
    detail: `Found at the last cabling audit: ${miswired.map(short).join(', ')} has both supplies plugged into the A-side PDU of ${rackName(db.neById.get(miswired[0])!.rackId)}. Losing PDU-A or ${pdus.find(p => p.rackId === db.neById.get(miswired[0])!.rackId && p.side === 'A')?.upstreamName ?? 'its UPS'} drops it.`,
    fix: 'Move PSU2 to a free outlet on PDU-B (hot-swappable, no outage), then re-verify the cord map.', assets: pdus.filter(p => p.rackId === db.neById.get(miswired[0])!.rackId && p.side === 'A').map(p => p.id), neIds: miswired, rackIds: [db.neById.get(miswired[0])!.rackId], to: to('&spof=cords') });
  if (psuFail.length) add({ id: `${dc.id}-SPOF-PSU`, domain: 'Power', severity: 'minor', title: `${psuFail.length} device${psuFail.length > 1 ? 's' : ''} running on one power supply`,
    detail: `A failed supply leaves ${psuFail.map(short).slice(0, 4).join(', ')}${psuFail.length > 4 ? ` and ${psuFail.length - 4} more` : ''} on a single cord; the other PDU side is now the only path.`,
    fix: 'Replace the failed PSU under the vendor RMA; until then avoid maintenance on the side that is still live.', assets: [], neIds: psuFail, rackIds: [...new Set(psuFail.map(id => db.neById.get(id)!.rackId))], to: to('&spof=psu') });
  if (tripped.length) add({ id: `${dc.id}-SPOF-TRIP`, domain: 'Power', severity: 'major', title: `${tripped.length} device${tripped.length > 1 ? 's' : ''} on the B side only after a PDU trip`,
    detail: `${[...new Set(tripped.map(id => rackName(db.neById.get(id)!.rackId)))].join(', ')}: the A-side breaker tripped, so every cord in the cabinet now hangs off PDU-B.`,
    fix: 'Find the overloaded outlet group before resetting the breaker; re-balance the cabinet across both sides.', assets: pdus.filter(p => p.state === 'tripped').map(p => p.id), neIds: tripped, rackIds: [...new Set(tripped.map(id => db.neById.get(id)!.rackId))], to: to('&spof=trip') });

  /* cabinets whose one side cannot carry the whole load if the other side fails */
  const overRacks = dc.racks.filter(rk => rk.drawKw > 0 && rk.drawKw >= rk.budgetKw * 0.9);
  if (overRacks.length) add({ id: `${dc.id}-SPOF-FAILOVER`, domain: 'Power', severity: overRacks.some(r => r.drawKw >= r.budgetKw) ? 'critical' : 'major', title: `${overRacks.length} cabinet${overRacks.length > 1 ? 's' : ''} cannot fail over to one PDU`,
    detail: `Each side is rated for the whole cabinet. ${overRacks.map(r => `${r.name} draws ${r.drawKw} of ${r.budgetKw} kW`).slice(0, 3).join(' · ')}: if one side drops, the other runs at ${Math.round(Math.max(...overRacks.map(r => r.drawKw / r.budgetKw)) * 100)}% and is likely to trip too.`,
    fix: 'Cap or move load until each cabinet is below 80% of one side, or upgrade the cabinet circuits.', assets: pdus.filter(p => overRacks.some(r => r.id === p.rackId)).map(p => p.id), neIds: nes.filter(n => overRacks.some(r => r.id === n.rackId) && !planned(n)).map(n => n.id), rackIds: overRacks.map(r => r.id), to: to('&spof=failover') });

  /* UPS: one module down or on battery takes the N+1 margin */
  const ups = dc.power.ups, bad = ups.filter(u => u.state !== 'Online');
  if (bad.length) {
    const side = bad.map(u => (ups.indexOf(u) + 1) % 2 === 0 ? 'A' : 'B');
    const hit = pdus.filter(p => bad.some(u => u.id === p.upstreamId));
    add({ id: `${dc.id}-SPOF-UPS`, domain: 'Power', severity: 'critical', title: `${bad.map(u => u.name).join(', ')} ${bad[0].state.toLowerCase()}: the ${side.join('/')} side rides on battery`,
      detail: `${hit.length} cabinet PDUs hang off ${bad.map(u => u.name).join(', ')}. When the battery runs out (about ${bad[0].batteryMin} min) every dual-fed device drops to its other side; single-fed devices on this side go dark.`,
      fix: 'Restore the input feed or start the generator; check that the other side can carry every cabinet before the battery runs out.', assets: [...bad.map(u => u.id), ...hit.map(p => p.id)], neIds: [...new Set(cords.filter(c => hit.some(p => p.id === c.pduId)).map(c => c.neId))], rackIds: [...new Set(hit.map(p => p.rackId))], to: to('&spof=ups') });
  }
  /* Tier II: one distribution path */
  if (single) {
    const all = nes.filter(n => !planned(n)).map(n => n.id);
    add({ id: `${dc.id}-SPOF-FEED`, domain: 'Power', severity: 'minor', title: 'One utility feed and one distribution path (Tier II)',
      detail: 'Both cabinet sides trace back to the same utility feed and LV switchboard. A switchboard fault or a failed generator start takes the whole site down.', fix: 'Accepted by design for Tier II; keep the DG test and fuel checks current, or plan a second feed.',
      assets: [dc.power.feeds.find(f => f.type === 'AC')?.id ?? 'AC-1'], neIds: all, rackIds: dc.racks.map(r => r.id), to: to('&spof=feed') });
  }

  /* cooling: the site has lost its spare unit, or a room is running hot */
  const coolHit = zones.filter(z => z.state !== 'n+1');
  if (coolHit.length) {
    const z0 = coolHit[0], down = dc.cooling.units.filter(u => u.status !== 'Operational');
    const rooms = coolHit.flatMap(z => z.hotRooms.map(r => `${r} (${z.floor})`));
    add({ id: `${dc.id}-SPOF-COOL`, domain: 'Cooling', severity: coolHit.some(z => z.state === 'short') ? 'critical' : 'major',
      title: down.length ? `${down.map(u => u.name).join(', ')} ${down.length > 1 ? 'are' : 'is'} down: ${rooms.length ? `${rooms[0]} runs hot` : 'no spare cooling unit'}` : `${rooms[0]} runs hot`,
      detail: `${down.length ? `${down.map(u => `${u.name} ${u.status.toLowerCase()}`).join(', ')}. ` : ''}${z0.floor}: ${z0.airHeatKw} kW of air heat against ${z0.runningKw} kW of running cooling. Another unit lost on this floor leaves ${z0.afterLossKw} kW and the racks there heat up.`,
      fix: 'Return the failed or maintenance unit first; hold other cooling work at this site and watch rack inlets in the hot room.',
      assets: down.map(u => u.id), neIds: nes.filter(n => coolHit.some(z => z.rackIds.includes(n.rackId)) && !planned(n)).map(n => n.id), rackIds: coolHit.flatMap(z => z.rackIds), to: `/facilities?dc=${dc.id}&tab=cooling` });
  }

  /* cabling: dual-homed devices whose uplinks leave the cabinet on one tray route */
  if (single) {
    const dualHomed = [...new Set([...ends.values()].filter(e => !e.inRack && e.trunkId).map(e => e.neId))].filter(id => [...ends.values()].filter(e => e.neId === id && e.trunkId).length >= 2);
    if (dualHomed.length) add({ id: `${dc.id}-SPOF-ROUTE`, domain: 'Cabling', severity: 'minor', title: `${dualHomed.length} dual-homed devices share one cable route`,
      detail: 'Each cabinet has one trunk route to the ODF, so both uplinks of a dual-homed device run in the same tray. One cut tray or a dropped trunk takes both.', fix: 'Pull a second trunk on a diverse tray route for the busiest cabinets first.',
      assets: [], neIds: dualHomed, rackIds: [...new Set(dualHomed.map(id => db.neById.get(id)!.rackId))], to: to('&spof=route') });
    const bh = lldp.filter(l => db.neById.get(l.aNe)!.dcId !== db.neById.get(l.zNe)!.dcId);
    if (bh.length > 1) add({ id: `${dc.id}-SPOF-ENTRY`, domain: 'Backhaul', severity: 'major', title: `All ${bh.length} backhaul spans leave through one building entry`,
      detail: `Every outside-plant span runs in ${dc.cabling.cable} through the same entry duct. A dig-up outside the building isolates the site even though the spans are logically redundant.`,
      fix: 'Order a second, physically diverse entry (different duct, different street) for at least one span.',
      assets: [dc.cabling.cable], neIds: [...new Set(bh.flatMap(l => [l.aNe, l.zNe]).filter(id => db.neById.get(id)!.dcId === dc.id))], rackIds: [], links: bh.map(l => l.id), to: to('&spof=entry') });
  }
  const rank: Record<Severity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.services - a.services);
}

/* ------------------------------------------------------------ cable path */

export function cablePath(db: Db, linkId: string): CablePath | null {
  const l = linkOf(db, linkId); if (!l) return null;
  const phys = l.protocol === 'LLDP' ? l : db.links.find(x => x.protocol === 'LLDP' && x.aNe === l.aNe && x.aIf === l.aIf && x.zNe === l.zNe);
  if (!phys) return null;
  const a = db.neById.get(phys.aNe)!, z = db.neById.get(phys.zNe)!;
  const sa = sitePhys(db, a.dcId)!, sz = sitePhys(db, z.dcId)!;
  const ea = sa.ends.get(`${phys.id}|${a.id}`), ez = sz.ends.get(`${phys.id}|${z.id}`);
  if (!ea || !ez) return null;
  const ifA = db.ifaces.get(a.id)!.find(i => i.name === phys.aIf), ifZ = db.ifaces.get(z.id)!.find(i => i.name === phys.zIf);
  const dcA = db.datacenters.find(d => d.id === a.dcId)!, dcZ = db.datacenters.find(d => d.id === z.dcId)!;
  const rackN = (dc: Datacenter, id: string) => dc.racks.find(r => r.id === id)?.name ?? id;
  const copper = (ifA?.speedMbps ?? 0) <= 1000;
  const optic = (it: Interface | undefined, ne: NetworkElement): CableHop[] => it?.optics ? [{ kind: 'optic', id: `${ne.id}:${it.name}:xcvr`, label: it.optics.model, sub: `Rx ${it.optics.rxDbm} dBm · Tx ${it.optics.txDbm} dBm · ${it.optics.tempC}°C`, neId: ne.id,
    state: it.optics.rxDbm < -10 ? 'bad' : it.optics.rxDbm < -8 ? 'warn' : 'ok', note: it.optics.rxDbm < -10 ? 'Receive power below the −10 dBm warning threshold' : undefined }] : [];
  const port = (it: Interface | undefined, ne: NetworkElement, ifn: string): CableHop => ({ kind: 'port', id: `${ne.id}:${ifn}`, label: `${ne.name} ${ifn}`, sub: it ? `${it.type} · ${it.state}` : undefined, where: `${rackN(ne.dcId === dcA.id ? dcA : dcZ, ne.rackId)} · U${ne.u}`, neId: ne.id, state: it?.state === 'down' ? 'bad' : it && it.flaps24h >= 3 ? 'warn' : 'ok' });
  const side = (e: End, _ne: NetworkElement, dc: Datacenter, outward: boolean): CableHop[] => {
    const hs: CableHop[] = [];
    hs.push({ kind: 'cord', id: e.cordId, label: copper ? 'Cat6A patch cord · 2 m' : e.panelId ? 'LC–LC OS2 patch cord · 3 m' : 'Patch cord · 3 m', where: rackN(dc, e.rackId), state: 'ok' });
    if (e.panelId) hs.push({ kind: 'panel', id: e.panelId, label: `${rackN(dc, e.rackId)} ${e.panelId.split('-').slice(-2).join('-')} · port ${e.panelPort}`, where: `${rackN(dc, e.rackId)} · top of rack`, state: 'ok' });
    if (e.trunkId) { const t = sitePhys(db, dc.id)!.trunks.find(x => x.id === e.trunkId); hs.push({ kind: 'trunk', id: e.trunkId, label: `Trunk ${e.trunkId.split('-').slice(-2).join('-')}`, sub: t ? `${t.kind} · ${t.lengthM} m · ${t.route}` : undefined, where: `${rackN(dc, e.rackId)} → ${rackN(dc, t?.zRackId ?? '')}`, state: t?.state ?? 'ok' }); }
    if (e.odfPanel) hs.push({ kind: 'panel', id: e.odfPanel, label: `${e.odfPanel.split('-').slice(-2).join('-')} · port ${e.odfPort}`, where: `${rackN(dc, dc.racks.find(r => e.odfPanel!.startsWith(r.id))?.id ?? '')} · ODF / patching`, state: 'ok' });
    return outward ? hs : hs.reverse();
  };
  const hops: CableHop[] = [port(ifA, a, phys.aIf), ...optic(ifA, a)];
  let kind: CablePath['kind'] = 'structured';
  const jumper = (dc: Datacenter, label: string): CableHop => ({ kind: 'jumper', id: `${phys.physical?.cable ?? phys.id}${dc.id !== dcA.id ? '-Z' : ''}`, label, sub: phys.physical ? `${phys.physical.strand} strand` : undefined, where: `${dc.id} ODF`, state: 'ok' });
  if (ea.inRack) {
    kind = 'in-rack';
    hops.push({ kind: 'cord', id: phys.physical?.cable ?? ea.cordId, label: copper ? 'Cat6A patch cord · 1 m' : ifA?.optics ? 'LC–LC OS2 patch cord · 2 m' : 'Direct-attach copper (DAC) · 2 m', where: `${rackN(dcA, a.rackId)} · in-rack`, state: 'ok' });
  } else if (a.dcId !== z.dcId) {
    kind = 'inter-site';
    hops.push(...side(ea, a, dcA, true));
    hops.push({ ...jumper(dcA, `Cross-connect to the outside-plant ODF · core ${ea.ospCore}`), sub: ea.ospStrand ? `${ea.ospStrand} strand` : undefined });
    hops.push({ kind: 'panel', id: `${ea.ospRack}-OSP-ODF`, label: `OSP ODF · core ${ea.ospCore}`, where: `${rackN(dcA, ea.ospRack ?? '')} · outside-plant cable termination`, state: 'ok' });
    const km = Math.round(hav(dcA.lat, dcA.lng, dcZ.lat, dcZ.lng) * 1.3);
    hops.push({ kind: 'osp', id: `${dcA.id}↔${dcZ.id}`, label: `Outside-plant fibre ${dcA.id} → ${dcZ.id}`, sub: `${dcA.cabling.cable} · core ${ea.ospCore} ⇢ ${dcZ.id} core ${ez.ospCore} · ~${km} km`, where: `${tier2(dcA) ? 'Single building entry' : 'Entry duct ' + ((ea.ospCore ?? 1) % 2 ? 'North' : 'South')}`, state: 'ok' });
    hops.push({ kind: 'panel', id: `${ez.ospRack}-OSP-ODF`, label: `OSP ODF · core ${ez.ospCore}`, where: `${rackN(dcZ, ez.ospRack ?? '')} · outside-plant cable termination`, state: 'ok' });
    hops.push({ ...jumper(dcZ, `Cross-connect from the outside-plant ODF · core ${ez.ospCore}`), sub: ez.ospStrand ? `${ez.ospStrand} strand` : undefined });
    hops.push(...side(ez, z, dcZ, false));
  } else {
    hops.push(...side(ea, a, dcA, true));
    hops.push(jumper(dcA, 'Cross-connect jumper (ODF)'));
    hops.push(...side(ez, z, dcZ, false));
  }
  hops.push(...optic(ifZ, z).reverse(), port(ifZ, z, phys.zIf));

  /* where it is most likely broken */
  let suspect: number | null = null, verdict = '';
  const chg = db.changes.find(c => c.title.startsWith('Re-patch ODF') && c.scope.includes(a.id) && (phys.aIf === 'xe-0/0/3') && c.dcId === a.dcId)
    ?? db.changes.find(c => c.title.startsWith('Re-patch ODF') && c.scope.includes(z.id) && phys.zIf === 'xe-0/0/3' && c.dcId === z.dcId);
  const badOptic = hops.findIndex(h => h.kind === 'optic' && h.state !== 'ok');
  if (chg) {
    suspect = hops.findIndex(h => h.kind === 'jumper');
    hops[suspect] = { ...hops[suspect], state: 'warn', note: `Re-patched by ${chg.id} about ${Math.max(1, Math.round((db.now - chg.windowEnd) / 3600000))} h ago — first suspect for the low receive power` };
  } else if (phys.state === 'down') {
    const opticsOk = hops.filter(h => h.kind === 'optic').every(h => h.state === 'ok');
    suspect = opticsOk ? Math.max(0, hops.findIndex(h => h.kind === 'trunk' || h.kind === 'jumper' || h.kind === 'osp' || (kind === 'in-rack' && h.kind === 'cord'))) : badOptic;
    if (suspect >= 0) hops[suspect] = { ...hops[suspect], state: 'bad', note: opticsOk ? 'Both optics healthy but no light end to end: test this segment first' : 'Optic out of range' };
  } else if (badOptic >= 0) {
    suspect = Math.max(0, badOptic - 1);
    hops[suspect] = { ...hops[suspect], state: 'warn', note: 'Clean and re-seat: the receive power drop starts on this side' };
  }
  const state: PhysState = hops.some(h => h.state === 'bad') ? 'bad' : hops.some(h => h.state === 'warn') ? 'warn' : 'ok';
  const segs = hops.filter(h => h.kind !== 'port' && h.kind !== 'optic').length;
  const lengthM = Math.round(hops.reduce((m, h) => m + (Number(/(\d+) m\b/.exec(h.sub ?? h.label)?.[1] ?? 0)), 0));
  verdict = state === 'ok' ? `${segs} passive segment${segs > 1 ? 's' : ''}, all clean` : suspect !== null && suspect >= 0 ? `Check ${hops[suspect].label} first` : 'Check the optics';
  return { linkId: phys.id, aNe: a.id, aIf: phys.aIf, zNe: z.id, zIf: phys.zIf, kind, hops, state, suspect: suspect !== null && suspect >= 0 ? suspect : null, verdict, lengthM };
}

function hav(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371, d = Math.PI / 180, dl = (la2 - la1) * d, dn = (lo2 - lo1) * d;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* the utility feed behind a UPS: when that feed is lost and another one is live, the ATS has moved the load onto it
   (DL-DC-009: feed A lost, ATS on feed B); with no other feed the generator carries it */
function feedStep(dc: Datacenter, feed: Datacenter['power']['feeds'][number] | undefined) {
  if (!feed) return { kind: 'feed', id: '', name: '—', state: 'ok' as PhysState };
  if (feed.status === 'Alarm') {
    const alt = dc.power.feeds.find(f => f.type === 'AC' && f.id !== feed.id && f.status !== 'Alarm');
    if (alt) return { kind: 'feed', id: alt.id, name: `${alt.source} (via ATS)`, sub: `${feed.source} lost · ATS on alternate source`, state: 'warn' as PhysState, note: `${feed.source} lost, the ATS carries that side on ${alt.source}` };
    return { kind: 'feed', id: feed.id, name: `DG set ${dc.power.dg.kva} kVA`, sub: `${feed.source} lost · generator ${dc.power.dg.result === 'Pass' ? 'running' : 'last test failed'}`, state: (dc.power.dg.result === 'Pass' ? 'warn' : 'bad') as PhysState, note: `${feed.source} lost, the generator carries the load` };
  }
  return { kind: 'feed', id: feed.id, name: feed.source, sub: `${feed.rating} · ${feed.status}`, state: (feed.status === 'Warning' ? 'warn' : 'ok') as PhysState };
}

/* ------------------------------------------------------------ device view */

export function devicePhysical(db: Db, neId: string) {
  const ne = db.neById.get(neId); if (!ne) return null;
  const s = sitePhys(db, ne.dcId)!;
  const dc = db.datacenters.find(d => d.id === ne.dcId)!;
  const rack = dc.racks.find(r => r.id === ne.rackId)!;
  const cords = s.cordsOf.get(neId) ?? [];
  const mods = new Map(ne.modules.map(m => [m.slot, m]));
  const power = cords.map(c => {
    const pdu = s.pduById.get(c.pduId)!;
    const bank = pdu.banks.find(b => b.id === c.bankId)!;
    const ups = dc.power.ups.find(u => u.id === pdu.upstreamId);
    const feed = dc.power.feeds.find(f => f.id === pdu.feedId);
    const chain = [
      { kind: 'psu', id: `${neId}:${c.psu}`, name: c.psu, sub: mods.get(c.psu) ? `${mods.get(c.psu)!.name} · ${mods.get(c.psu)!.state}` : 'from the device record', state: (c.state === 'psu-failed' ? 'bad' : c.state === 'no-power' ? 'off' : 'ok') as PhysState },
      { kind: 'outlet', id: `${pdu.id}:${c.outlet}`, name: `${pdu.name} outlet ${c.outlet}`, sub: `${bank.name} · ${bank.loadA} of ${bank.breakerA} A`, state: (c.state === 'no-power' ? 'bad' : bank.state === 'warn' ? 'warn' : bank.state === 'tripped' ? 'bad' : 'ok') as PhysState },
      { kind: 'pdu', id: pdu.id, name: `${rack.name} ${pdu.name}`, sub: `${pdu.model} · ${pdu.loadKw} of ${pdu.capacityKw} kW`, state: (pdu.state === 'tripped' ? 'bad' : pdu.state === 'ok' ? 'ok' : 'warn') as PhysState, note: pdu.note },
      { kind: pdu.kind === 'DC' ? 'rectifier' : 'ups', id: pdu.upstreamId, name: pdu.upstreamName, sub: ups ? `${ups.state} · ${ups.loadPct}% load · ${ups.batteryMin} min battery` : pdu.kind === 'DC' ? `${dc.power.battery.volts} V battery · ${dc.power.battery.runtimeH} h` : undefined, state: (ups && ups.state !== 'Online' ? (ups.state === 'On battery' ? 'warn' : 'bad') : 'ok') as PhysState },
      feedStep(dc, feed)
    ];
    return { cord: c, pdu, chain };
  });
  const on = cords.filter(c => c.state === 'live' || c.state === 'on-battery');
  const sides = new Set(on.map(c => s.pduById.get(c.pduId)!.side));
  const opaque = isOpaque(ne);
  /* what is wrong upstream or in the device, said next to the redundancy verdict so the summary never contradicts the chain */
  const issues = [
    ...cords.filter(c => c.state === 'psu-failed').map(c => `${c.psu} failed`),
    ...cords.filter(c => c.state === 'no-power').map(c => `no power at ${s.pduById.get(c.pduId)!.name} outlet ${c.outlet}`),
    ...[...new Set(power.filter(p => p.chain[4].note).map(p => p.chain[4].note!))],
    ...[...new Set(cords.filter(c => c.state === 'on-battery').map(c => `${s.pduById.get(c.pduId)!.upstreamName} on battery`))]
  ];
  const tail = issues.length ? ` · ${issues.join(' · ')}` : '';
  const verdict = planned(ne) ? { state: 'off' as PhysState, text: 'Planned: no power until it is installed' }
    : !on.length ? { state: 'bad' as PhysState, text: `No supply has power: the device is down${tail}` }
    : sides.size >= 2 ? { state: (issues.length ? 'warn' : 'ok') as PhysState, text: issues.length ? `Dual-fed, still up on both sides${tail}` : `Dual-fed: stays up if either side fails${opaque ? ' (tenant gear: cords per the tenant\'s power order)' : ''}` }
    : { state: 'warn' as PhysState, text: (cords.length >= 2 && cords.every(c => c.pduId.endsWith('-A')) ? 'Single point of failure: both cords on PDU-A' : `Single-fed right now: only the ${[...sides][0]} side has power`) + tail };
  const rc = s.rackCooling.find(r => r.rackId === rack.id)!;
  const zone = s.zones.find(z => z.id === rc.zoneId)!;
  const cdu = rc.cduId ? db.gpu?.cdus.find(c => c.id === rc.cduId) : undefined;
  /* site-level heat balance, the same numbers as Facilities → Cooling */
  const op = dc.cooling.units.filter(u => u.status === 'Operational'), unitCap = dc.cooling.units[0]?.capacityKw || 1;
  const running = op.reduce((a, u) => a + u.capacityKw, 0);
  const site = { heatKw: dc.cooling.loadKw, runningKw: running, afterLossKw: Math.max(0, running - unitCap), redundancy: dc.cooling.redundancy };
  const cooling = { rack: { id: rack.id, name: rack.name, tempC: rack.tempC, liquidPct: rc.liquidPct }, zone, site, units: dc.cooling.units.filter(u => rc.unitIds.includes(u.id)), primaryId: rc.primaryId, cdu };
  const cables = [...s.ends.values()].filter(e => e.neId === neId).map(e => {
    const l = linkOf(db, e.linkId)!;
    const farNe = l.aNe === neId ? l.zNe : l.aNe, farIf = l.aNe === neId ? l.zIf : l.aIf;
    const it = db.ifaces.get(neId)!.find(i => i.name === e.ifName);
    const p = cablePath(db, l.id);
    return { linkId: l.id, ifName: e.ifName, speedMbps: it?.speedMbps ?? 0, optic: it?.optics?.model ?? null, rxDbm: it?.optics?.rxDbm ?? null, farNe, farIf, kind: p?.kind ?? 'structured', hops: p ? p.hops.filter(h => h.kind !== 'port' && h.kind !== 'optic').length : 0,
      via: e.inRack ? 'in-rack cord' : [e.panelId ? e.panelId.split('-').slice(-2).join('-') : null, e.trunkId ? e.trunkId.split('-').slice(-2).join('-') : null, e.odfPanel ? `${e.odfPanel.split('-').slice(-2).join('-')}/${e.odfPort}` : null, e.ospCore !== undefined ? `core ${e.ospCore}` : null].filter(Boolean).join(' › '),
      route: e.inRack ? '—' : e.route, state: p?.state ?? 'ok', verdict: p?.verdict ?? '', linkState: l.state };
  }).sort((a, b) => (a.state === 'ok' ? 1 : 0) - (b.state === 'ok' ? 1 : 0) || a.ifName.localeCompare(b.ifName, undefined, { numeric: true }));
  const spofs = s.spofs.filter(x => x.neIds.includes(neId) && !x.id.endsWith('SPOF-FEED'));
  return { ne, rack, dcId: dc.id, power, verdict, cooling, cables, spofs };
}

/* ------------------------------------------------------------ what-if */

export function whatIf(db: Db, dcId: string, assetId: string): WhatIf | null {
  const s = sitePhys(db, dcId); const dc = db.datacenters.find(d => d.id === dcId);
  if (!s || !dc) return null;
  let kind: WhatIf['kind'] = 'pdu', label = assetId, deadPdus = new Set<string>(), deadUnits = new Set<string>(), deadTrunk: string | null = null;
  const ups = dc.power.ups.find(u => u.id === assetId), feed = dc.power.feeds.find(f => f.id === assetId), unit = dc.cooling.units.find(u => u.id === assetId);
  if (ups) { kind = 'ups'; label = ups.name; s.pdus.filter(p => p.upstreamId === ups.id).forEach(p => deadPdus.add(p.id)); }
  else if (feed && feed.type === 'DC') { kind = 'rectifier'; label = feed.source; s.pdus.filter(p => p.kind === 'DC').forEach(p => deadPdus.add(p.id)); }
  else if (feed) { kind = 'feed'; label = feed.source; } // UPS + generator carry it: shown as a ride-through, nothing drops
  else if (/^side:[AB]$/.test(assetId)) { kind = 'pdu-side'; label = `Every ${assetId.slice(-1)}-side PDU`; s.pdus.filter(p => p.side === assetId.slice(-1)).forEach(p => deadPdus.add(p.id)); }
  else if (s.pduById.has(assetId)) { kind = 'pdu'; const p = s.pduById.get(assetId)!; label = `${dc.racks.find(r => r.id === p.rackId)?.name} ${p.name}`; deadPdus.add(p.id); }
  else if (unit) { kind = 'cooling'; label = unit.name; deadUnits.add(unit.id); }
  else if (s.trunks.some(t => t.id === assetId)) { kind = 'trunk'; deadTrunk = assetId; label = `Trunk ${assetId.split('-').slice(-2).join('-')}`; }
  else return null;
  const down: string[] = [], singleFed: string[] = [], overloaded: string[] = [], hotRacks: string[] = [], linksDown: string[] = [];
  if (deadPdus.size) {
    for (const [neId, cs] of s.cordsOf) {
      const on = cs.filter(c => (c.state === 'live' || c.state === 'on-battery') && !deadPdus.has(c.pduId));
      const before = cs.filter(c => c.state === 'live' || c.state === 'on-battery');
      if (!before.length) continue;
      if (!on.length) down.push(neId);
      else if (new Set(on.map(c => c.pduId.slice(-1))).size < 2 && new Set(before.map(c => c.pduId.slice(-1))).size >= 2) singleFed.push(neId);
    }
    /* the surviving side takes the whole cabinet */
    for (const rk of dc.racks) {
      const mine = s.pdus.filter(p => p.rackId === rk.id && p.kind === 'AC');
      const lost = mine.filter(p => deadPdus.has(p.id));
      if (!lost.length || lost.length === mine.length) continue;
      const rest = mine.filter(p => !deadPdus.has(p.id) && p.state !== 'tripped');
      if (rest.length && rk.drawKw > rest.reduce((a, p) => a + p.capacityKw, 0) * 0.8) overloaded.push(...rest.map(p => p.id));
    }
  }
  if (deadUnits.size) for (const z of s.zones) if (z.unitIds.some(u => deadUnits.has(u))) {
    const left = dc.cooling.units.filter(u => z.unitIds.includes(u.id) && u.status === 'Operational' && !deadUnits.has(u.id)).reduce((a, u) => a + u.capacityKw, 0);
    /* the floor runs short: every loaded rack heats up; otherwise the racks it was the nearest unit for lose their margin */
    if (left < z.airHeatKw) hotRacks.push(...z.rackIds.filter(id => (dc.racks.find(r => r.id === id)?.drawKw ?? 0) > 0));
    else hotRacks.push(...s.rackCooling.filter(r => deadUnits.has(r.primaryId ?? '') && (dc.racks.find(x => x.id === r.rackId)?.drawKw ?? 0) > 0 && left - z.airHeatKw < z.airHeatKw * 0.1).map(r => r.rackId));
  }
  if (deadTrunk) {
    for (const e of s.ends.values()) if (e.trunkId === deadTrunk) linksDown.push(e.linkId);
    /* devices that lose every link they have */
    const ids = new Set(linksDown);
    const nes = [...new Set([...s.ends.values()].filter(e => ids.has(e.linkId)).map(e => e.neId))];
    for (const id of nes) { const all = [...s.ends.values()].filter(e => e.neId === id); if (all.every(e => ids.has(e.linkId))) down.push(id); }
  }
  const neIds = [...new Set([...down, ...singleFed, ...hotRacks.flatMap(r => db.nes.filter(n => n.rackId === r).map(n => n.id))])];
  const ss = db.services.filter(x => x.status !== 'Disabled' && (neIds.some(id => x.neId === id || x.path.includes(id)) || x.linkIds.some(l => linksDown.includes(l))));
  const svcDown = db.services.filter(x => x.status !== 'Disabled' && down.some(id => x.neId === id || x.path.includes(id)));
  const parts = [
    kind === 'feed' ? `UPS batteries carry the load and the ${dc.power.dg.kva} kVA generator starts (${dc.power.dg.runtimeH} h of fuel): nothing drops while the DG runs` : null,
    down.length ? `${down.length} device${down.length > 1 ? 's lose' : ' loses'} power or every link` : null,
    singleFed.length ? `${singleFed.length} stay up on one cord` : null,
    overloaded.length ? `${overloaded.length} surviving PDU${overloaded.length > 1 ? 's' : ''} would run above 80% of rating` : null,
    hotRacks.length ? `${hotRacks.length} rack${hotRacks.length > 1 ? 's' : ''} lose cooling margin and heat up` : null,
    linksDown.length ? `${linksDown.length} cable${linksDown.length > 1 ? 's' : ''} cut` : null
  ].filter(Boolean);
  return { assetId, label, kind, down, singleFed, overloaded, hotRacks, linksDown, services: svcDown.length || ss.length, customers: new Set((svcDown.length ? svcDown : ss).map(x => x.customerId)).size,
    text: parts.length ? parts.join(' · ') : 'Nothing drops: every device keeps a live path' };
}

export const sitePhysicalPublic = (db: Db, dcId: string): SitePhysical | null => {
  const s = sitePhys(db, dcId); if (!s) return null;
  const { ends: _e, cordsOf: _c, pduById: _p, ...rest } = s; void _e; void _c; void _p;
  return rest;
};
