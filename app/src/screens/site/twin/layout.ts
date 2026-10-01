/* Deterministic layout for the digital twin. Turns the site record (floors →
   rooms → racks → equipment, cooling units per zone, UPS/DG/battery) into
   metre-scale positions. Same input, same scene — no randomness. */
import type { CoolingUnit, Datacenter, EnvSensor, Rack, UpsUnit } from '../../../api/types';
import type { TwinNe } from '../../../api/ext-twin';

export const U_H = 0.0445;            // one rack unit, metres
export const RACK_W = 0.6, RACK_D = 1.1, PITCH = 0.72;
export const FLOOR_H = 4.2, PLATE_T = 0.18;
const COLD = 1.6, HOT = 1.3, MARGIN = 1.1, WALL = 1.6, CORRIDOR = 1.4;

export interface RackL { rack: Rack; x: number; z: number; rot: number; h: number; nes: TwinNe[]; row: number; col: number }
export interface CoolingL { unit: CoolingUnit; x: number; z: number; w: number }
export interface Aisle { x: number; z: number; w: number; d: number; kind: 'cold' | 'hot' }
export interface PowerL { kind: 'ups' | 'rectifier' | 'battery'; label: string; x: number; z: number; w: number; d: number; h: number; ups?: UpsUnit; state: 'ok' | 'warn' | 'bad' }
export interface RoomL {
  id: string; floorIdx: number; floorName: string; name: string; kind: 'it' | 'power';
  x: number; z: number; w: number; d: number;
  racks: RackL[]; cooling: CoolingL[]; aisles: Aisle[]; trays: { x1: number; x2: number; z: number; y: number }[];
  pipes: { x1: number; z1: number; x2: number; z2: number }[]; sensor?: EnvSensor; power: PowerL[];
}
export interface FloorL { idx: number; name: string; y: number; w: number; d: number; rooms: RoomL[] }
export interface TwinLayout { floors: FloorL[]; rooms: RoomL[]; racks: RackL[]; building: { w: number; d: number; h: number }; dg: { x: number; z: number; w: number; d: number; h: number } | null }

export const rackHeight = (r: Rack) => r.heightU * U_H + 0.08;

function layoutRacks(racks: Rack[], nesByRack: Map<string, TwinNe[]>) {
  const n = racks.length;
  const cols = Math.max(2, Math.min(8, Math.ceil(Math.sqrt(n * 2.2))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const pairs = Math.ceil(rows / 2);
  const out: RackL[] = []; const aisles: Aisle[] = []; const trays: RoomL['trays'] = [];
  const spanX = cols * PITCH;
  const pairD = 2 * RACK_D + COLD;
  const contentD = pairs * pairD + Math.max(0, pairs - 1) * HOT;
  const z0 = -contentD / 2;
  racks.forEach((rack, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const pair = Math.floor(row / 2), side = row % 2;
    const zBase = z0 + pair * (pairD + HOT);
    const z = side === 0 ? zBase + RACK_D / 2 : zBase + RACK_D + COLD + RACK_D / 2;
    const x = -spanX / 2 + PITCH / 2 + col * PITCH;
    out.push({ rack, x, z, rot: side === 0 ? 0 : Math.PI, h: rackHeight(rack), nes: nesByRack.get(rack.id) ?? [], row, col });
  });
  for (let p = 0; p < pairs; p++) {
    const zBase = z0 + p * (pairD + HOT);
    aisles.push({ x: 0, z: zBase + RACK_D + COLD / 2, w: spanX, d: COLD, kind: 'cold' });
    if (p < pairs - 1) aisles.push({ x: 0, z: zBase + pairD + HOT / 2, w: spanX, d: HOT, kind: 'hot' });
    const hMax = Math.max(...out.filter(r => Math.floor(r.row / 2) === p).map(r => r.h), 1.9);
    trays.push({ x1: -spanX / 2, x2: spanX / 2, z: zBase + RACK_D / 2, y: hMax + 0.45 });
    if (Math.ceil(rows) > p * 2 + 1) trays.push({ x1: -spanX / 2, x2: spanX / 2, z: zBase + RACK_D + COLD + RACK_D / 2, y: hMax + 0.45 });
  }
  return { racks: out, aisles, trays, w: spanX + 2 * MARGIN, d: contentD + 2 * MARGIN + WALL, contentD };
}

export function buildLayout(dc: Datacenter, nes: TwinNe[]): TwinLayout {
  const nesByRack = new Map<string, TwinNe[]>();
  nes.forEach(n => { const l = nesByRack.get(n.rackId) ?? []; l.push(n); nesByRack.set(n.rackId, l); });
  nesByRack.forEach(l => l.sort((a, b) => a.u - b.u));
  const floors: FloorL[] = []; const rooms: RoomL[] = [];
  dc.floors.forEach((f, fi) => {
    const fr: RoomL[] = [];
    f.rooms.forEach(rn => {
      const rk = dc.racks.filter(r => r.floor === f.name && r.room === rn);
      const lr = layoutRacks(rk, nesByRack);
      const zoneKey = `${f.name} · ${rn}`;
      const units = dc.cooling.units.filter(u => u.zone === zoneKey);
      const cw = Math.min(1.2, (lr.w - 1.2) / Math.max(1, units.length) - 0.3);
      const cooling: CoolingL[] = units.map((u, i) => ({ unit: u, w: cw, x: -lr.w / 2 + 0.6 + (lr.w - 1.2) * ((i + 0.5) / Math.max(1, units.length)), z: -lr.d / 2 + 0.55 }));
      /* racks are centred in the room minus the back wall strip */
      const zShift = WALL / 2;
      const racks = lr.racks.map(r => ({ ...r, z: r.z + zShift }));
      const aisles = lr.aisles.map(a => ({ ...a, z: a.z + zShift }));
      const trays = lr.trays.map(t => ({ ...t, z: t.z + zShift }));
      const pipes: RoomL['pipes'] = [{ x1: -lr.w / 2 + 0.3, z1: -lr.d / 2 + 0.25, x2: lr.w / 2 - 0.3, z2: -lr.d / 2 + 0.25 }, ...cooling.map(c => ({ x1: c.x, z1: -lr.d / 2 + 0.25, x2: c.x, z2: c.z }))];
      fr.push({ id: zoneKey, floorIdx: fi, floorName: f.name, name: rn, kind: 'it', x: 0, z: 0, w: lr.w, d: lr.d, racks, cooling, aisles, trays, pipes, sensor: dc.cooling.sensors.find(s => s.zone === zoneKey), power: [] });
    });
    if (fi === 0) {
      /* plant room: UPS modules, rectifier and battery bank live on the ground floor */
      const ups = dc.power.ups;
      /* UPS cabinets along the back wall, rectifier + battery rack along the front; real-ish cabinet sizes */
      const uw = 0.8, gap = 0.3;
      const rowW = ups.length * uw + (ups.length - 1) * gap;
      const w = Math.max(6.4, rowW + 2.4, 1.2 + 1.6 + 0.5 + 2.4);
      const d = 5.2;
      const power: PowerL[] = ups.map((u, i) => ({ kind: 'ups', label: u.name, x: -rowW / 2 + uw / 2 + i * (uw + gap), z: -d / 2 + 1.0, w: uw, d: 0.85, h: 2.0, ups: u, state: u.state === 'Online' ? 'ok' : u.state === 'Bypass' ? 'warn' : 'bad' }));
      power.push({ kind: 'rectifier', label: 'Rectifier RECT-01', x: -w / 2 + 1.5, z: d / 2 - 1.1, w: 1.4, d: 0.8, h: 2.0, state: dc.power.feeds.some(f => f.status === 'Alarm') ? 'warn' : 'ok' });
      power.push({ kind: 'battery', label: `Battery bank ${dc.power.battery.ah} Ah`, x: w / 2 - 1.9, z: d / 2 - 1.1, w: 2.4, d: 0.8, h: 1.4, state: dc.power.battery.runtimeH < 3 ? 'warn' : 'ok' });
      fr.push({ id: `${f.name} · Plant room`, floorIdx: fi, floorName: f.name, name: 'Plant room', kind: 'power', x: 0, z: 0, w, d, racks: [], cooling: [], aisles: [], trays: [], pipes: [], power });
    }
    /* rooms side by side along x */
    const totalW = fr.reduce((a, r) => a + r.w, 0) + (fr.length - 1) * CORRIDOR;
    let cx = -totalW / 2;
    fr.forEach(r => { r.x = cx + r.w / 2; cx += r.w + CORRIDOR; });
    const d = Math.max(...fr.map(r => r.d));
    const fl: FloorL = { idx: fi, name: f.name, y: fi * FLOOR_H, w: totalW + 2, d: d + 2, rooms: fr };
    floors.push(fl); rooms.push(...fr);
  });
  const bw = Math.max(...floors.map(f => f.w)) + 1.2, bd = Math.max(...floors.map(f => f.d)) + 1.2;
  const dg = dc.status === 'planned' ? null : { x: bw / 2 + 2.6, z: -bd / 4, w: 3.2, d: 1.6, h: 1.9 };
  return { floors, rooms, racks: rooms.flatMap(r => r.racks), building: { w: bw, d: bd, h: floors.length * FLOOR_H }, dg };
}

/* world position of a rack (room offset + floor elevation) */
export const rackWorld = (L: TwinLayout, rk: RackL) => {
  const room = L.rooms.find(r => r.racks.includes(rk))!;
  const floor = L.floors[room.floorIdx];
  return { x: room.x + rk.x, y: floor.y + PLATE_T, z: room.z + rk.z, room, floor };
};

export type Level = 'building' | 'floor' | 'room' | 'rack' | 'equipment';
export interface Sel { floor: number | null; room: string | null; rack: string | null; ne: string | null }

/* camera pose for the current level: [eye, target] */
export function cameraPose(L: TwinLayout, sel: Sel): [number[], number[]] {
  const { w, d, h } = L.building;
  if (sel.rack) {
    const rk = L.racks.find(r => r.rack.id === sel.rack);
    if (rk) {
      const p = rackWorld(L, rk);
      const dir = rk.rot === 0 ? 1 : -1;
      const ne = sel.ne ? rk.nes.find(n => n.id === sel.ne) : null;
      if (ne) {
        /* front-on at shelf height, 2.2 m back, slight downward tilt — never inside the cabinet */
        const ty = p.y + (ne.u - 1 + ne.uSize / 2) * U_H + 0.04;
        return [[p.x + dir * 0.3, ty + 0.45, p.z + dir * 2.6], [p.x, ty - 0.02, p.z]];
      }
      const ty = p.y + rk.h / 2;
      return [[p.x + dir * 1.2, ty + 0.5, p.z + dir * 3.9], [p.x, ty, p.z]];
    }
  }
  if (sel.room !== null) {
    const room = L.rooms.find(r => r.id === sel.room);
    if (room) {
      const fy = L.floors[room.floorIdx].y;
      const span = Math.max(room.w, room.d);
      if (room.kind === 'power') return [[room.x + room.w * 0.05, fy + 3.4 + span * 0.45, room.z + room.d * 0.5 + span * 0.85], [room.x, fy + 0.7, room.z]];
      return [[room.x + room.w * 0.12, fy + 3.2 + span * 0.2, room.z + room.d * 0.6 + span * 0.35], [room.x, fy + 0.9, room.z]];
    }
  }
  if (sel.floor !== null) {
    const f = L.floors[sel.floor];
    if (f) return [[f.w * 0.35, f.y + 7.5 + f.d * 0.3, f.d * 0.85 + 4], [0, f.y + 0.5, 0]];
  }
  return [[w * 0.95, h * 1.1 + 6, d * 1.05 + 6], [0, h * 0.42, 0]];
}
