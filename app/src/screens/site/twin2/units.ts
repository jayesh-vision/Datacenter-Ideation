/* Facility plant in the realistic twin (user, 12-Oct-2026): cooling units, UPS, rectifier, battery bank
   and the DG are selectable. A selection is a key kept beside the shared `Sel` (the schematic twin's
   types stay frozen); it flies the camera to the unit and opens a details card. */
import type { TwinData } from '../../../api/ext-twin';
import { PLATE_T, RACK_D, RACK_W, type TwinLayout } from '../twin/layout';
import type { Pick } from '../twin/Scene';

export type UnitKind = 'cooling' | 'ups' | 'rectifier' | 'battery' | 'dg';
export type UnitState = 'ok' | 'warn' | 'bad';
export interface PlantUnit {
  key: string; kind: UnitKind; title: string; type: string; state: UnitState; status: string;
  floorIdx: number; roomId: string | null; world: [number, number, number]; w: number; d: number; h: number;
  facts: [string, string][]; tab: 'power' | 'cooling';
}
/* a pick that may also name a plant unit */
export type Pick2 = Pick & { unit?: string };

export const coolKey = (id: string) => `c:${id}`;
export const powerKey = (roomId: string, label: string) => `p:${roomId}:${label}`;
export const DG_KEY = 'dg';

export function plantUnits(L: TwinLayout, data: TwinData): PlantUnit[] {
  const out: PlantUnit[] = [];
  const pw = data.dc.power;
  for (const room of L.rooms) {
    const y = L.floors[room.floorIdx].y + PLATE_T;
    for (const c of room.cooling) {
      const u = c.unit;
      out.push({
        key: coolKey(u.id), kind: 'cooling', title: u.name, type: u.type === 'CDU' ? 'Coolant distribution unit' : u.type === 'CRAC' ? 'Computer-room air conditioner' : 'Computer-room air handler',
        state: u.status === 'Failed' ? 'bad' : u.status === 'Maintenance' ? 'warn' : 'ok', status: u.status, floorIdx: room.floorIdx, roomId: room.id,
        world: [room.x + c.x, y, room.z + c.z], w: c.w, d: 0.8, h: 2.0, tab: 'cooling',
        facts: [['Load', `${u.loadPct}% of ${u.capacityKw} kW`], ['Supply / return', `${u.supplyC}°C / ${u.returnC}°C`], ['Zone', u.zone]]
      });
    }
    for (const p of room.power) {
      const base = { key: powerKey(room.id, p.label), title: p.label, state: p.state, floorIdx: room.floorIdx, roomId: room.id, world: [room.x + p.x, y, room.z + p.z] as [number, number, number], w: p.w, d: p.d, h: p.h, tab: 'power' as const };
      if (p.ups) out.push({ ...base, kind: 'ups', type: 'UPS', status: p.ups.state, facts: [['Load', `${p.ups.loadPct}% of ${p.ups.capacityKw} kW`], ['Redundancy', p.ups.redundancy], ['Battery autonomy', `${p.ups.batteryMin} min`]] });
      else if (p.kind === 'rectifier') {
        const alarm = pw.feeds.filter(f => f.status === 'Alarm');
        out.push({ ...base, kind: 'rectifier', type: 'AC → 48 V DC rectifier', status: alarm.length ? 'Feed alarm' : 'Normal', facts: [['DC output', pw.feeds.find(f => f.type === 'DC')?.rating ?? '—'], ['DC load', `${pw.dcKw} kW`], ...(alarm.length ? [['Feeds in alarm', alarm.map(f => f.source).join(', ')] as [string, string]] : [])] });
      } else out.push({ ...base, kind: 'battery', type: 'DC plant battery bank', status: p.state === 'ok' ? 'Normal' : 'Low autonomy', facts: [['Capacity', `${pw.battery.ah} Ah at ${pw.battery.volts} V`], ['Autonomy', `${pw.battery.runtimeH} h${p.state === 'ok' ? '' : ' (below 3 h)'}`]] });
    }
  }
  if (L.dg) out.push({
    key: DG_KEY, kind: 'dg', title: `DG set ${pw.dg.kva} kVA`, type: 'Diesel generator', state: pw.dg.result === 'Pass' ? 'ok' : 'bad', status: pw.dg.result === 'Pass' ? 'Ready' : 'Last test failed',
    floorIdx: 0, roomId: null, world: [L.dg.x, 0.16, L.dg.z], w: L.dg.w, d: L.dg.d, h: L.dg.h, tab: 'power',
    facts: [['Fuel', `${pw.dg.fuelPct}%`], ['Runtime', `${pw.dg.runtimeH} h`], ['Last test', pw.dg.result]]
  });
  return out;
}

/* camera for one unit: in front of it (the face pointing into the room / away from the building), slightly above */
export function unitPose(u: PlantUnit, L: TwinLayout): [number[], number[]] {
  const [x, y, z] = u.world;
  const dir = unitFront(u, L);
  const want = 2.4 + Math.max(u.w, u.h) * 0.6;
  /* stay inside the room: if the far wall is closer, stand at it and look down a little more */
  const room = u.roomId ? L.rooms.find(r => r.id === u.roomId) : undefined;
  const space = room ? Math.abs(room.z + dir * (room.d / 2) - (z + dir * (u.d / 2))) - 0.35 : want;
  const dist = Math.max(1.2, Math.min(want, space));
  const ty = y + u.h * 0.5;
  return [[x + 0.7, ty + 0.9 + (want - dist) * 0.55, z + dir * (u.d / 2 + dist)], [x, ty, z]];
}

/* which side of a unit faces into its room (or, for the DG, away from the building): +1 = +z, -1 = -z */
export function unitFront(u: PlantUnit, L: TwinLayout) {
  const room = u.roomId ? L.rooms.find(r => r.id === u.roomId) : undefined;
  return room ? (u.world[2] - room.z > 0 ? -1 : 1) : (u.world[2] >= 0 ? 1 : -1);
}

/* racks standing between the camera and a chosen unit (e.g. a CRAH behind a rack row): left out of the scene */
export function unitOccluders(u: PlantUnit, L: TwinLayout, eye: number[]): Set<string> {
  const out = new Set<string>();
  const room = u.roomId ? L.rooms.find(r => r.id === u.roomId) : undefined; if (!room) return out;
  const [ux, , uz] = u.world; const ex = eye[0], ez = eye[2];
  for (const rk of room.racks) {
    const x = room.x + rk.x, z = room.z + rk.z;
    /* distance from the rack centre to the sight line, in plan */
    const dx = ex - ux, dz = ez - uz, len2 = dx * dx + dz * dz || 1;
    const t = ((x - ux) * dx + (z - uz) * dz) / len2;
    if (t <= 0 || t >= 1) continue;
    const px = ux + t * dx, pz = uz + t * dz;
    if (Math.hypot(x - px, z - pz) < Math.max(RACK_W, RACK_D) / 2 + u.w / 2 + 0.2) out.add(rk.rack.id);
  }
  /* other plant cabinets in the way (e.g. the UPS row in front of the battery bank) */
  const near = (cx: number, cz: number, r: number) => {
    const dx = ex - ux, dz = ez - uz, len2 = dx * dx + dz * dz || 1;
    const t = ((cx - ux) * dx + (cz - uz) * dz) / len2;
    return t > 0.05 && t < 1.05 && Math.hypot(cx - (ux + t * dx), cz - (uz + t * dz)) < r;
  };
  for (const c of room.cooling) if (coolKey(c.unit.id) !== u.key && near(room.x + c.x, room.z + c.z, c.w / 2 + 0.6)) out.add(coolKey(c.unit.id));
  for (const p of room.power) if (powerKey(room.id, p.label) !== u.key && near(room.x + p.x, room.z + p.z, Math.max(p.w, p.d) / 2 + 0.6)) out.add(powerKey(room.id, p.label));
  return out;
}
