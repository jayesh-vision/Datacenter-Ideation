/* Labels live in the DOM (one React root) and are pinned to world points that
   the scene projects every frame — avoids per-label React roots in the canvas. */
import type { TwinData } from '../../../api/ext-twin';
import { PLATE_T, RACK_D, RACK_W, U_H, type Level, type Sel, type TwinLayout } from './layout';
import type { TwinNe } from '../../../api/ext-twin';
import type { Pick } from './Scene';
import type { Attention } from './attention';

export interface Anchor { id: string; world: [number, number, number]; cls: string; text: string; sub?: string; pick?: Pick; align: 'left' | 'right' | 'center'; column?: { slot: number; total: number; leaderFrom: [number, number, number] } }

export const LIFT = 2.2;
export const floorY = (L: TwinLayout, fi: number, sel: Sel, level: Level) => L.floors[fi].y + (level !== 'building' && sel.floor !== null && fi > sel.floor ? LIFT : 0);

export function buildAnchors(L: TwinLayout, data: TwinData, sel: Sel, level: Level, att?: Attention): Anchor[] {
  const out: Anchor[] = [];
  if (level === 'building') {
    L.floors.forEach(f => { const a = att?.floor.get(f.idx); out.push({ id: `f${f.idx}`, world: [-f.w / 2 - 0.3, f.y + 1.4, f.d / 2], cls: `is-floor${a ? ` is-att-${a.sev}` : ''}`, text: f.name, sub: a ? `${a.n} issue${a.n > 1 ? 's' : ''} · ${f.rooms.length} room${f.rooms.length > 1 ? 's' : ''}` : `${f.rooms.length} room${f.rooms.length > 1 ? 's' : ''}`, pick: { floor: f.idx }, align: 'center' }); });
    /* the worst few racks get a pinned callout above their beacon */
    /* critical only, one per room, three at most — the panel lists everything */
    const seenRoom = new Set<string>();
    (att?.items ?? []).filter(i => i.rackId && i.sev === 'critical' && !seenRoom.has(i.roomId) && seenRoom.add(i.roomId)).slice(0, 3).forEach(i => {
      const room = L.rooms.find(r => r.id === i.roomId); const rk = room?.racks.find(k => k.rack.id === i.rackId); if (!room || !rk) return;
      out.push({ id: `att${i.id}`, world: [room.x + rk.x, L.floors[room.floorIdx].y + PLATE_T + rk.h + (i.sev === 'critical' ? 2.3 : 1.9), room.z + rk.z], cls: `is-att is-att-${i.sev}`, text: rk.rack.name, sub: i.title, pick: i.pick, align: 'center' });
    });
    if (L.dg) out.push({ id: 'dg', world: [L.dg.x, L.dg.h + 1.1, L.dg.z], cls: 'is-static', text: `DG · ${data.dc.power.dg.kva} kVA`, align: 'center' });
    return out;
  }
  const fi = sel.floor ?? 0; const fy = floorY(L, fi, sel, level); const floor = L.floors[fi];
  if (level === 'floor') {
    /* slab text carries the facts; the pill is only the click target */
    floor.rooms.forEach(r => out.push({ id: `r${r.id}`, world: [r.x, fy + PLATE_T + 3.1, r.z], cls: 'is-room', text: `Open ${r.name}`, pick: { floor: fi, room: r.id }, align: 'center' }));
    return out;
  }
  const room = L.rooms.find(r => r.id === sel.room); if (!room) return out;
  const rx = room.x, rz = room.z, by = fy + PLATE_T;
  if (level === 'room') {
    room.racks.forEach(k => out.push({ id: `k${k.rack.id}`, world: [rx + k.x, by + k.h + 0.3, rz + k.z], cls: 'is-rack', text: k.rack.name, pick: { floor: fi, room: room.id, rack: k.rack.id }, align: 'center' }));
    room.cooling.forEach(c => out.push({ id: `c${c.unit.id}`, world: [rx + c.x, by + 2.3, rz + c.z], cls: 'is-static', text: c.unit.name, align: 'center' }));
    room.power.forEach(p => out.push({ id: `p${p.label}`, world: [rx + p.x, by + p.h + 0.45, rz + p.z], cls: 'is-static', text: p.label, align: 'center' }));
    return out;
  }
  const rk = room.racks.find(k => k.rack.id === sel.rack); if (!rk) return out;
  const local = (lx: number, ly: number, lz: number): [number, number, number] => [rx + rk.x + lx * Math.cos(rk.rot) + lz * Math.sin(rk.rot), by + ly, rz + rk.z - lx * Math.sin(rk.rot) + lz * Math.cos(rk.rot)];
  const left = rk.rot === 0 ? 'right' : 'left';
  for (let u = 5; u <= rk.rack.heightU; u += 5) out.push({ id: `u${u}`, world: local(-RACK_W / 2 - 0.05, (u - 1) * U_H + 0.04, RACK_D / 2), cls: 'is-u', text: `U${u}`, align: left });
  /* equipment labels: a non-overlapping column right of the rack with leader
     lines; sub-2U devices only when selected, runs of same-prefix 1U devices collapse */
  const named: { n: TwinNe; text: string; from: [number, number, number] }[] = [];
  const sorted = [...rk.nes].sort((a, b) => b.u - a.u);
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    const centre = (n.u - 1) * U_H + (n.uSize * U_H) / 2 + 0.04;
    const from = local(RACK_W / 2 - 0.04, centre, RACK_D / 2 + 0.02);
    if (n.uSize >= 2 || sel.ne === n.id) { named.push({ n, text: n.name.replace(`${n.dcId}-`, ''), from }); continue; }
    const base = n.name.replace(`${n.dcId}-`, '').replace(/-?\d+$/, '');
    let j = i; while (j + 1 < sorted.length && sorted[j + 1].uSize < 2 && sorted[j + 1].id !== sel.ne && sorted[j + 1].name.replace(`${n.dcId}-`, '').replace(/-?\d+$/, '') === base) j++;
    const run = sorted.slice(i, j + 1);
    const mid = run[Math.floor(run.length / 2)];
    const mc = (mid.u - 1) * U_H + (mid.uSize * U_H) / 2 + 0.04;
    named.push({ n: mid, text: run.length > 1 ? `${run.length} × ${base}` : n.name.replace(`${n.dcId}-`, ''), from: local(RACK_W / 2 - 0.04, mc, RACK_D / 2 + 0.02) });
    i = j;
  }
  named.forEach((x, k) => out.push({ id: `e${x.n.id}`, world: x.from, cls: `is-eq${sel.ne === x.n.id ? ' is-sel' : ''}`, text: x.text, pick: { rack: rk.rack.id, ne: x.n.id }, align: 'left', column: { slot: k, total: named.length, leaderFrom: x.from } }));
  return out;
}
