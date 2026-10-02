/* What needs attention in the building, rolled up rack → room → floor, so the
   default (building) view can point at it without the operator drilling in.
   Sources: device alarms (critical / major), rack-level faults (PDU, cabinet
   power or temperature), racks over budget or too hot, failed cooling units,
   hot zones and UPS not online. */
import type { TwinData } from '../../../api/ext-twin';
import type { Severity } from '../../../api/types';
import type { TwinLayout } from './layout';
import type { Pick } from './Scene';

export type AttSev = 'critical' | 'major';
export interface AttItem { id: string; sev: AttSev; title: string; where: string; pick: Pick; floorIdx: number; roomId: string; rackId?: string; count: number }
export interface Attention {
  items: AttItem[];
  rack: Map<string, AttSev>; room: Map<string, AttSev>; floor: Map<number, { sev: AttSev; n: number }>;
}

const rankOf = (s: AttSev) => (s === 'critical' ? 0 : 1);
const worse = (a: AttSev | undefined, b: AttSev): AttSev => (!a || rankOf(b) < rankOf(a) ? b : a);
const asAtt = (s: Severity | null | undefined): AttSev | null => (s === 'critical' ? 'critical' : s === 'major' ? 'major' : null);

export function buildAttention(L: TwinLayout, data: TwinData): Attention {
  const items: AttItem[] = [];
  const rack = new Map<string, AttSev>(), room = new Map<string, AttSev>(), floor = new Map<number, { sev: AttSev; n: number }>();
  const dcId = data.dc.id;
  const short = (id: string) => id.replace(`${dcId}-`, '');
  const rackAlerts = new Map<string, typeof data.alerts>();
  data.alerts.forEach(a => { if (a.rackId) rackAlerts.set(a.rackId, [...(rackAlerts.get(a.rackId) ?? []), a]); });

  for (const r of L.rooms) {
    const fl = L.floors[r.floorIdx];
    for (const rk of r.racks) {
      const bad = rk.nes.filter(n => asAtt(n.worst)).sort((a, b) => rankOf(asAtt(a.worst)!) - rankOf(asAtt(b.worst)!));
      const ra = (rackAlerts.get(rk.rack.id) ?? []).filter(a => asAtt(a.severity));
      const hot = rk.rack.tempC > 27, over = rk.rack.budgetKw > 0 && rk.rack.drawKw / rk.rack.budgetKw >= 0.9;
      let sev: AttSev | undefined; let title = ''; const n = bad.length + ra.length + (hot ? 1 : 0) + (over ? 1 : 0);
      if (!n) continue;
      if (ra.length) { sev = worse(sev, asAtt(ra[0].severity)!); title = ra[0].title; }
      if (bad.length) { const s = asAtt(bad[0].worst)!; if (!sev || rankOf(s) < rankOf(sev)) { const al = data.alerts.find(a => a.neId === bad[0].id && a.severity === bad[0].worst); title = `${short(bad[0].id)} · ${al?.title ?? 'device alarm'}`; } sev = worse(sev, s); }
      if (hot) { sev = worse(sev, 'major'); title ||= `Inlet ${rk.rack.tempC}°C`; }
      if (over) { sev = worse(sev, 'major'); title ||= `Drawing ${rk.rack.drawKw} of ${rk.rack.budgetKw} kW`; }
      const extra = bad.length > 1 ? ` +${bad.length - 1} device${bad.length > 2 ? 's' : ''}` : '';
      items.push({ id: rk.rack.id, sev: sev!, title: title + extra, where: `${fl.name} › ${r.name} › ${rk.rack.name}`, pick: { floor: r.floorIdx, room: r.id, rack: rk.rack.id, ...(bad.length === 1 && !ra.length ? { ne: bad[0].id } : {}) }, floorIdx: r.floorIdx, roomId: r.id, rackId: rk.rack.id, count: n });
      rack.set(rk.rack.id, sev!);
    }
    /* room-level: cooling and environment, UPS in the plant room */
    const failed = r.cooling.filter(c => c.unit.status === 'Failed');
    if (failed.length) items.push({ id: `${r.id}-cool`, sev: 'critical', title: `${failed.map(c => c.unit.name).join(', ')} failed`, where: `${fl.name} › ${r.name}`, pick: { floor: r.floorIdx, room: r.id }, floorIdx: r.floorIdx, roomId: r.id, count: failed.length });
    if (r.sensor && r.sensor.tempC > 27) items.push({ id: `${r.id}-hot`, sev: 'major', title: `Zone at ${r.sensor.tempC}°C`, where: `${fl.name} › ${r.name}`, pick: { floor: r.floorIdx, room: r.id }, floorIdx: r.floorIdx, roomId: r.id, count: 1 });
    const ups = r.power.filter(p => p.ups && p.state !== 'ok');
    if (ups.length) items.push({ id: `${r.id}-ups`, sev: ups.some(p => p.state === 'bad') ? 'critical' : 'major', title: ups.map(p => `${p.label} ${p.ups!.state.toLowerCase()}`).join(', '), where: `${fl.name} › ${r.name}`, pick: { floor: r.floorIdx, room: r.id }, floorIdx: r.floorIdx, roomId: r.id, count: ups.length });
  }
  for (const it of items) {
    room.set(it.roomId, worse(room.get(it.roomId), it.sev));
    const f = floor.get(it.floorIdx);
    floor.set(it.floorIdx, { sev: worse(f?.sev, it.sev), n: (f?.n ?? 0) + 1 });
  }
  items.sort((a, b) => rankOf(a.sev) - rankOf(b.sev) || b.count - a.count || a.floorIdx - b.floorIdx);
  return { items, rack, room, floor };
}
