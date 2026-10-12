/* Power and cable paths drawn into the realistic twin (13-Oct-2026, user: "show which UPS feeds which rack PDU and which cable
   goes from which device — on the digital twin, switched on with quick chips").
   Power path: every room has an A-side and a B-side overhead busway (blue / orange) fed from one UPS module; a feeder runs from
   the busway header along the back corridor to that UPS in the plant room (or down a riser on upper floors); a tap-off drops
   into every rack. Colour = side, red dashed = tripped, amber dashed = on UPS battery.
   Cable paths: every cabinet trunk runs from the rack top along the fibre channel to the ODF / patching rack (teal = tray
   route 1, purple = route 2, red = a trunk whose links are all down); with a device selected its own cables are traced to
   the far rack, in-rack cables as loops on the cabinet front.
   Positions come from the same layout as the rest of the twin (twin/layout.ts) and the physical model (mock/physical.ts). */
import { useState } from 'react';
import { Line } from '@react-three/drei';
import type { TwinData } from '../../../api/ext-twin';
import type { SitePhysical } from '../../../api/types';
import type { getDevicePhysical } from '../../../api';
export type DevicePhysicalView = NonNullable<Awaited<ReturnType<typeof getDevicePhysical>>>;
import { PLATE_T, type FloorL, type RackL, type RoomL, type Sel, type TwinLayout } from '../twin/layout';
import type { Anchor2 } from './anchors2';

export interface PhysView { phys: SitePhysical | null; dev: DevicePhysicalView | null; power: boolean; cables: boolean }
type P3 = [number, number, number];

export const SIDE_C = { A: '#2F80ED', B: '#F2994A', DC: '#10B981' } as const;
export const ROUTE_C = ['#14B8A6', '#A855F7'] as const;
const BAD = '#FF4D4F', WARN = '#F5B82E', HOT = '#22D3EE';
const NO_RAY = () => null;

const roomOf = (L: TwinLayout, rk: RackL) => L.rooms.find(r => r.racks.includes(rk))!;
const maxH = (room: RoomL) => (room.racks.length ? Math.max(...room.racks.map(r => r.h)) : 2);
const face = (rk: RackL) => (rk.rot === 0 ? 1 : -1);
const pduOf = (phys: SitePhysical, rackId: string, side: 'A' | 'B', kind: 'AC' | 'DC' = 'AC') => phys.pdus.find(p => p.rackId === rackId && p.side === side && p.kind === kind);
const stateColor = (base: string, st?: string) => (st === 'tripped' ? BAD : st === 'on-battery' || st === 'warn' ? WARN : base);
const dashedFor = (st?: string) => st === 'tripped' || st === 'on-battery';

/* ---------------- power geometry (floor-local, y above the slab top) ---------------- */
interface Seg { pts: P3[]; c: string; w: number; dashed?: boolean; dim?: boolean; key: string }
function powerSegs(L: TwinLayout, floor: FloorL, phys: SitePhysical, sel: Sel): { segs: Seg[]; heads: { room: RoomL; side: 'A' | 'B'; at: P3; ups: string; dc?: boolean }[] } {
  const segs: Seg[] = [], heads: { room: RoomL; side: 'A' | 'B'; at: P3; ups: string; dc?: boolean }[] = [];
  const plant = floor.rooms.find(r => r.kind === 'power');
  const selRoom = sel.rack ? floor.rooms.find(r => r.racks.some(k => k.rack.id === sel.rack)) : null;
  floor.rooms.filter(r => r.kind === 'it' && r.racks.length).forEach((room, ri) => {
    const sides: ('A' | 'B')[] = ['A', 'B'];
    for (const side of sides) {
      const off = side === 'A' ? 0 : 1;
      const yh = maxH(room) + 0.8 + off * 0.16;
      /* the header runs down the wall that faces the plant room; feeders run just behind the rear walls */
      const toRight = !!plant && plant.x > room.x;
      const xL = toRight ? room.x + room.w / 2 - 0.3 - off * 0.14 : room.x - room.w / 2 + 0.3 + off * 0.14;
      const zBack = room.z - room.d / 2 + 0.3 + off * 0.12;
      const zTrunk = Math.min(room.z - room.d / 2, plant ? plant.z - plant.d / 2 : room.z - room.d / 2) - 0.35 - off * 0.16 - ri * 0.06;
      const first = pduOf(phys, room.racks[0].rack.id, side);
      const upId = first?.upstreamId ?? '';
      const base = SIDE_C[side];
      const roomSel = !!selRoom && selRoom === room;
      const dimAll = !!sel.rack && !roomSel;
      /* busway along every row, joined by a header along the room's left wall */
      const rows = [...new Set(room.racks.map(r => r.row))];
      const zs = rows.map(rw => room.z + room.racks.find(r => r.row === rw)!.z + (side === 'A' ? -0.18 : 0.18));
      rows.forEach((rw, k) => {
        const rk = room.racks.filter(r => r.row === rw);
        const x1 = toRight ? room.x + Math.min(...rk.map(r => r.x)) - 0.35 : room.x + Math.max(...rk.map(r => r.x)) + 0.35;
        segs.push({ key: `bw${room.id}${side}${rw}`, pts: [[xL, yh, zs[k]], [x1, yh, zs[k]]], c: base, w: roomSel ? 4 : 2.5, dim: dimAll });
      });
      segs.push({ key: `hd${room.id}${side}`, pts: [[xL, yh, Math.max(...zs)], [xL, yh, zBack]], c: base, w: roomSel ? 4 : 2.5, dim: dimAll });
      /* tap-off drops into each rack, coloured by that rack's PDU state */
      room.racks.forEach(rk => {
        const p = pduOf(phys, rk.rack.id, side);
        const x = room.x + rk.x + (side === 'A' ? -0.16 : 0.16), z = room.z + rk.z + (side === 'A' ? -0.18 : 0.18);
        const on = sel.rack === rk.rack.id;
        segs.push({ key: `dr${rk.rack.id}${side}`, pts: [[x, yh, z], [x, rk.h + 0.02, z]], c: stateColor(base, p?.state), w: on ? 5 : 2, dashed: dashedFor(p?.state), dim: !!sel.rack && !on });
      });
      /* feeder: back corridor to the UPS in the plant room, or to the riser on upper floors */
      const ups = plant?.power.find(p => p.ups?.id === upId);
      const upsState = first?.state;
      if (plant && ups) {
        const xp = plant.x + ups.x, zp = plant.z + ups.z;
        segs.push({ key: `fd${room.id}${side}`, pts: [[xL, yh, zBack], [xL, yh, zTrunk], [xp, yh, zTrunk], [xp, yh, zp], [xp, ups.h + 0.02, zp]], c: stateColor(base, upsState === 'on-battery' ? 'on-battery' : undefined), w: roomSel ? 4 : 2.5, dashed: upsState === 'on-battery', dim: dimAll });
        heads.push({ room, side, at: [xp, ups.h + 0.6 + off * 0.35, zp], ups: ups.label });
      } else {
        const xr = -floor.w / 2 + 0.5 + off * 0.2 + ri * 0.06;
        segs.push({ key: `fd${room.id}${side}`, pts: [[xL, yh, zBack], [xL, yh, zTrunk], [xr, yh, zTrunk], [xr, -PLATE_T - 0.2, zTrunk]], c: base, w: roomSel ? 4 : 2.5, dim: dimAll });
        heads.push({ room, side, at: [xr, yh + 0.45, zTrunk], ups: first?.upstreamName ?? 'UPS' });
      }
      /* −48 V DC panels (telco gear): a green feeder from the rectifier */
      if (side === 'A' && room.racks.some(rk => pduOf(phys, rk.rack.id, 'A', 'DC'))) {
        const rect = plant?.power.find(p => p.kind === 'rectifier');
        const yd = yh + 0.34;
        room.racks.filter(rk => pduOf(phys, rk.rack.id, 'A', 'DC')).forEach(rk => {
          const x = room.x + rk.x, z = room.z + rk.z;
          segs.push({ key: `dc${rk.rack.id}`, pts: [[xL, yd, z], [x, yd, z], [x, rk.h + 0.02, z]], c: SIDE_C.DC, w: sel.rack === rk.rack.id ? 4 : 1.8, dim: !!sel.rack && sel.rack !== rk.rack.id });
        });
        if (rect && plant) {
          const xp = plant.x + rect.x, zp = plant.z + rect.z;
          segs.push({ key: `dcf${room.id}`, pts: [[xL, yd, Math.min(...zs)], [xL, yd, zTrunk - 0.3], [xp, yd, zTrunk - 0.3], [xp, yd, zp], [xp, rect.h + 0.02, zp]], c: SIDE_C.DC, w: 2, dim: dimAll });
          heads.push({ room, side, at: [xp, rect.h + 0.6, zp], ups: rect.label, dc: true });
        }
      }
    }
  });
  return { segs, heads };
}

/* ---------------- cable geometry ---------------- */
function fibrePoint(room: RoomL, rk: RackL, route: number): { top: P3; ch: P3; y: number; z: number } {
  const y = rk.h + 0.36 + route * 0.07 + (maxH(room) - rk.h);
  const z = room.z + rk.z - 0.25 * face(rk) + route * 0.05;
  const x = room.x + rk.x + 0.12 + route * 0.05;
  return { top: [x, rk.h + 0.02, z], ch: [x, y, z], y, z };
}
function routeBetween(L: TwinLayout, floor: FloorL, a: RackL, b: RackL, route: number): P3[] | null {
  const ra = roomOf(L, a), rb = roomOf(L, b);
  if (!floor.rooms.includes(ra)) return null;
  const pa = fibrePoint(ra, a, route);
  const endA = ra.x + Math.max(...ra.racks.filter(r => r.row === a.row).map(r => r.x)) + 0.5 + route * 0.06;
  if (!floor.rooms.includes(rb)) {
    /* far rack on another floor: to the riser */
    const xr = floor.w / 2 - 0.6 - route * 0.12;
    return [pa.top, pa.ch, [endA, pa.y, pa.z], [endA, pa.y, ra.z + ra.d / 2 - 0.3], [xr, pa.y, ra.z + ra.d / 2 - 0.3], [xr, -PLATE_T - 0.2, ra.z + ra.d / 2 - 0.3]];
  }
  const pb = fibrePoint(rb, b, route);
  const endB = rb.x + Math.max(...rb.racks.filter(r => r.row === b.row).map(r => r.x)) + 0.5 + route * 0.06;
  if (ra === rb) {
    if (a.row === b.row) return [pa.top, pa.ch, [pb.ch[0], pa.y, pa.z], pb.top];
    return [pa.top, pa.ch, [endA, pa.y, pa.z], [endA, pa.y, pb.z], [pb.ch[0], pa.y, pb.z], pb.top];
  }
  const zc = Math.max(ra.z + ra.d / 2, rb.z + rb.d / 2) - 0.3 - route * 0.1;
  const y = Math.max(pa.y, pb.y);
  return [pa.top, [pa.ch[0], y, pa.z], [endA, y, pa.z], [endA, y, zc], [endB, y, zc], [endB, y, pb.z], [pb.ch[0], y, pb.z], pb.top];
}
function cableSegs(L: TwinLayout, floor: FloorL, data: TwinData, phys: SitePhysical, sel: Sel, dev: DevicePhysicalView | null): Seg[] {
  const segs: Seg[] = [];
  const rackBy = new Map(L.racks.map(r => [r.rack.id, r]));
  const focusRack = sel.rack;
  for (const t of phys.trunks) {
    const a = rackBy.get(t.aRackId), b = rackBy.get(t.zRackId); if (!a || !b) continue;
    const route = t.route.endsWith('2') ? 1 : 0;
    const pts = routeBetween(L, floor, a, b, route); if (!pts) continue;
    const mine = focusRack === t.aRackId;
    segs.push({ key: `t${t.id}`, pts, c: t.state === 'bad' ? BAD : ROUTE_C[route], w: mine ? 4 : 1.6, dashed: t.state === 'bad', dim: (!!focusRack && !mine) || !!dev });
  }
  /* the selected device: each of its cables to the far rack (via the ODF), in-rack ones as loops on the cabinet front */
  if (dev && sel.rack) {
    const me = rackBy.get(sel.rack);
    const neBy = new Map(data.nes.map(n => [n.id, n]));
    const self = neBy.get(dev.ne.id);
    for (const c of dev.cables) {
      const far = neBy.get(c.farNe);
      const col = c.state === 'bad' ? BAD : c.state === 'warn' ? WARN : HOT;
      if (!me) continue;
      if (c.kind === 'in-rack' && far && self) {
        const room = roomOf(L, me); const f = face(me);
        const yA = (self.u - 1 + self.uSize / 2) * 0.0445 + 0.04, yB = (far.u - 1 + far.uSize / 2) * 0.0445 + 0.04;
        const x = room.x + me.x + 0.33, z = room.z + me.z + f * 0.56;
        segs.push({ key: `c${c.linkId}`, pts: [[x - 0.05, yA, z], [x + 0.06, (yA + yB) / 2, z + f * 0.05], [x - 0.05, yB, z]], c: col, w: 3, dashed: c.state === 'bad' });
        continue;
      }
      const farRack = far ? rackBy.get(far.rackId) : undefined;
      const odf = phys.trunks.find(t => t.aRackId === sel.rack)?.zRackId;
      const odfRack = odf ? rackBy.get(odf) : undefined;
      const route = c.route.endsWith('2') ? 1 : 0;
      if (odfRack && me !== odfRack) { const p1 = routeBetween(L, floor, me, odfRack, route); if (p1) segs.push({ key: `ca${c.linkId}`, pts: p1, c: col, w: 3.5, dashed: c.state === 'bad' }); }
      const from = odfRack ?? me;
      if (farRack && farRack !== from) { const p2 = routeBetween(L, floor, from, farRack, route); if (p2) segs.push({ key: `cb${c.linkId}`, pts: p2, c: col, w: 3.5, dashed: c.state === 'bad' }); }
      else if (!farRack) {
        /* far end at another site: outside-plant fibre leaves the building */
        const r = roomOf(L, from); const p = fibrePoint(r, from, route);
        segs.push({ key: `co${c.linkId}`, pts: [p.top, p.ch, [floor.w / 2 + 1.2, p.y, p.z]], c: col, w: 3.5, dashed: c.state === 'bad' });
      }
    }
  }
  return segs;
}

/* ---------------- render ---------------- */
export function PhysOverlay({ L, floor, data, sel, pv }: { L: TwinLayout; floor: FloorL; data: TwinData; sel: Sel; pv: PhysView }) {
  if (!pv.phys || (!pv.power && !pv.cables)) return null;
  const segs = [...(pv.power ? powerSegs(L, floor, pv.phys, sel).segs : []), ...(pv.cables ? cableSegs(L, floor, data, pv.phys, sel, pv.dev) : [])];
  return (
    <group>
      {segs.map(s => (
        <Line key={s.key} points={s.pts} color={s.c} lineWidth={s.dim ? 1 : s.w} transparent opacity={s.dim ? 0.22 : 0.95} dashed={!!s.dashed} dashSize={0.18} gapSize={0.1} depthWrite={false} raycast={NO_RAY} toneMapped={false} />
      ))}
    </group>
  );
}

/* labels for the paths (world coordinates) */
export function physAnchors(L: TwinLayout, data: TwinData, sel: Sel, pv: PhysView): Anchor2[] {
  if (!pv.phys || sel.floor === null) return [];
  const floor = L.floors[sel.floor]; const by = floor.y + PLATE_T;
  const out: Anchor2[] = [];
  const short = (s: string) => s.replace(`${data.dc.id}-`, '');
  if (pv.power) {
    const { heads } = powerSegs(L, floor, pv.phys, sel);
    const selRoom = sel.rack ? floor.rooms.find(r => r.racks.some(k => k.rack.id === sel.rack)) : null;
    const seen = new Set<string>();
    for (const h of heads) {
      if (selRoom && h.room !== selRoom) continue;
      const k = `${h.ups}|${h.side}|${h.dc ? 'dc' : ''}`; if (seen.has(k)) { continue; } seen.add(k);
      out.push({ id: `pw${h.room.id}${h.side}${h.dc ? 'dc' : ''}`, world: [h.at[0], by + h.at[1], h.at[2]], cls: 't2-static t2-path', text: h.dc ? `${h.ups} → −48 V panels` : `${h.ups} → ${h.side} side`, sub: h.dc ? undefined : h.room.name, dot: h.dc ? SIDE_C.DC : SIDE_C[h.side] });
    }
    if (sel.rack) {
      const rk = L.racks.find(r => r.rack.id === sel.rack); const room = rk ? roomOf(L, rk) : null;
      if (rk && room && floor.rooms.includes(room)) for (const side of ['A', 'B'] as const) {
        const p = pduOf(pv.phys, rk.rack.id, side); if (!p) continue;
        const yh = maxH(room) + 0.8 + (side === 'A' ? 0 : 0.16);
        out.push({ id: `pdu${rk.rack.id}${side}`, world: [room.x + rk.x + (side === 'A' ? -0.16 : 0.16), by + yh + 0.25, room.z + rk.z + (side === 'A' ? -0.18 : 0.18)], cls: `t2-static t2-path${p.state === 'tripped' ? ' is-critical' : p.state !== 'ok' ? ' is-major' : ''}`,
          text: `PDU-${side} ← ${p.upstreamName}`, sub: `${p.loadKw} of ${p.capacityKw} kW${p.state === 'tripped' ? ' · tripped' : p.state === 'on-battery' ? ' · on battery' : ''}`, dot: stateColor(SIDE_C[side], p.state) });
      }
    }
  }
  if (pv.cables) {
    const odfIds = [...new Set(pv.phys.trunks.map(t => t.zRackId))];
    for (const id of odfIds) {
      const rk = L.racks.find(r => r.rack.id === id); if (!rk) continue; const room = roomOf(L, rk); if (!floor.rooms.includes(room)) continue;
      const n = pv.phys.trunks.filter(t => t.zRackId === id).length;
      out.push({ id: `odf${id}`, world: [room.x + rk.x, by + rk.h + 1.3, room.z + rk.z], cls: 't2-static t2-path', text: `ODF · ${rk.rack.name}`, sub: `${n} trunk${n === 1 ? '' : 's'} land here`, dot: ROUTE_C[0] });
    }
    if (sel.rack && !pv.dev) {
      pv.phys.trunks.filter(t => t.aRackId === sel.rack).forEach((t, i) => {
        const rk = L.racks.find(r => r.rack.id === sel.rack)!; const room = roomOf(L, rk);
        const route = t.route.endsWith('2') ? 1 : 0; const p = fibrePoint(room, rk, route);
        out.push({ id: `trk${t.id}`, world: [p.ch[0] + 0.6 + i * 0.1, by + p.y + 0.25 + i * 0.28, p.ch[2]], cls: `t2-static t2-path${t.state === 'bad' ? ' is-critical' : ''}`, text: short(t.id).replace(`${rk.rack.name}-`, ''), sub: `${t.used} of ${t.pairs} pairs · ${t.route} · ${t.lengthM} m`, dot: t.state === 'bad' ? BAD : ROUTE_C[route] });
      });
    }
    if (pv.dev && sel.rack) {
      const neBy = new Map(data.nes.map(n => [n.id, n]));
      pv.dev.cables.filter(c => c.kind !== 'in-rack').slice(0, 8).forEach(c => {
        const far = neBy.get(c.farNe); const rk = far ? L.racks.find(r => r.rack.id === far.rackId) : undefined;
        if (rk) { const room = roomOf(L, rk); if (!floor.rooms.includes(room)) return; out.push({ id: `far${c.linkId}`, world: [room.x + rk.x, by + rk.h + 0.5, room.z + rk.z], cls: `t2-static t2-path${c.state === 'bad' ? ' is-critical' : c.state === 'warn' ? ' is-major' : ''}`, text: `${c.ifName} → ${short(c.farNe)}`, sub: `${c.farIf} · ${c.via}`, dot: c.state === 'bad' ? BAD : c.state === 'warn' ? WARN : HOT }); }
        else out.push({ id: `far${c.linkId}`, world: [floor.w / 2 + 1.4, by + 3.2, 0], cls: 't2-static t2-path', text: `${c.ifName} → ${c.farNe}`, sub: 'outside plant · other site', dot: HOT });
      });
    }
  }
  return out;
}

/* with a path chip on and a rack open, frame the rack together with the busway and trunks above it */
export function pathPose(L: TwinLayout, sel: Sel): [number[], number[]] | null {
  if (!sel.rack) return null;
  const rk = L.racks.find(r => r.rack.id === sel.rack); if (!rk) return null;
  const room = roomOf(L, rk); const floor = L.floors[room.floorIdx];
  const x = room.x + rk.x, z = room.z + rk.z, y = floor.y + PLATE_T, f = face(rk);
  /* aimed a little to the left of the rack so it sits right of centre, clear of the path card */
  return [[x + f * 1.2 - 1.1, y + rk.h + 2.6, z + f * 4.8], [x - 1.1, y + rk.h * 0.8, z]];
}

/* the chain in words, beside the 3D: feed → UPS → busway → PDU for the open rack, and the selected device's cables */
export function PathCard({ L, data, sel, pv }: { L: TwinLayout; data: TwinData; sel: Sel; pv: PhysView }) {
  const [open, setOpen] = useState(true);
  if (!pv.phys || !sel.rack || (!pv.power && !pv.cables)) return null;
  const rk = L.racks.find(r => r.rack.id === sel.rack); if (!rk) return null;
  const short = (s: string) => s.replace(`${data.dc.id}-`, '');
  const feed = (id: string) => data.dc.power.feeds.find(f => f.id === id)?.source ?? id;
  const pdus = pv.phys.pdus.filter(p => p.rackId === rk.rack.id);
  const trunks = pv.phys.trunks.filter(t => t.aRackId === rk.rack.id);
  const odf = trunks[0] ? L.racks.find(r => r.rack.id === trunks[0].zRackId)?.rack.name : undefined;
  const cords = pv.dev ? pv.phys.cords.filter(c => c.neId === pv.dev!.ne.id) : [];
  return (
    <div className={`t2-pathcard${open ? '' : ' is-min'}`} data-twin2-pathcard>
      <button type="button" className="t2-pc-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide path details' : 'Show path details'}</button>
      {open && <>
      {pv.power && <div className="t2-pc-sec">
        <b>Power into {rk.rack.name}</b>
        {pdus.map(p => (
          <div key={p.id} className={`t2-pc-row is-${p.state}`}>
            <i style={{ background: p.kind === 'DC' ? SIDE_C.DC : SIDE_C[p.side] }} />
            <span>{feed(p.feedId)} → <strong>{p.upstreamName}</strong> → {p.kind === 'DC' ? '−48 V panel' : `busway ${p.side}`} → <strong>{p.name}</strong> <em>{p.loadKw} / {p.capacityKw} kW{p.state === 'tripped' ? ' · tripped' : p.state === 'on-battery' ? ' · on battery' : ''}</em></span>
          </div>
        ))}
        {pv.dev && cords.length > 0 && <div className="t2-pc-sub">{short(pv.dev.ne.id)}: {cords.map(c => `${c.psu} → ${c.pduId.split('-').slice(-2).join('-')}/${c.outlet}${c.state !== 'live' ? ` (${c.state.replace('-', ' ')})` : ''}`).join(' · ')}</div>}
      </div>}
      {pv.cables && <div className="t2-pc-sec">
        <b>{pv.dev ? `Cables of ${short(pv.dev.ne.id)}` : `Cabling out of ${rk.rack.name}`}</b>
        {!pv.dev && (trunks.length ? trunks.map(t => (
          <div key={t.id} className={`t2-pc-row is-${t.state}`}><i style={{ background: t.state === 'bad' ? BAD : ROUTE_C[t.route.endsWith('2') ? 1 : 0] }} />
            <span>{rk.rack.name} panel → <strong>{short(t.id).replace(`${rk.rack.name}-`, '')}</strong> ({t.kind}, {t.used}/{t.pairs} pairs, {t.lengthM} m) → ODF in <strong>{odf}</strong> · {t.route}</span></div>))
          : <div className="t2-pc-sub">{odf ? '' : 'This is the patching / ODF rack: every trunk lands here.'}</div>)}
        {pv.dev && pv.dev.cables.slice(0, 7).map(c => (
          <div key={c.linkId} className={`t2-pc-row is-${c.state}`}><i style={{ background: c.state === 'bad' ? BAD : c.state === 'warn' ? WARN : HOT }} />
            <span><strong>{c.ifName}</strong> → {c.kind === 'in-rack' ? 'in-rack cord' : c.via} → <strong>{short(c.farNe)}</strong> {c.farIf}</span></div>))}
        {pv.dev && pv.dev.cables.length > 7 && <div className="t2-pc-sub">+{pv.dev.cables.length - 7} more · full list on the device's Power & cabling tab</div>}
      </div>}
      </>}
    </div>
  );
}
