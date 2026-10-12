/* DOM labels for the realistic twin: pinned to world points that the scene projects every
   frame (same approach as the schematic twin — no per-label React roots in the canvas).
   Every label is derived from the layout, the selection and the attention roll-up. */
import type { TwinData } from '../../../api/ext-twin';
import { PLATE_T, RACK_D, RACK_W, U_H, type Level, type RackL, type Sel, type TwinLayout } from '../twin/layout';
import type { Layer } from '../twin/Scene';
import type { Attention } from '../twin/attention';
import { DG_KEY, coolKey, powerKey, type Pick2 } from './units';

export interface Anchor2 { id: string; world: [number, number, number]; cls: string; text: string; sub?: string; pick?: Pick2; dot?: string; title?: string }

const LED: Record<string, string> = { critical: '#FF4D4F', major: '#FF8A3D', minor: '#F5B82E' };
const OK = '#3FDC74';
const SEV_WORD: Record<string, string> = { critical: 'Critical', major: 'Major', minor: 'Minor' };
const rackSev = (rk: RackL, att?: Attention) => att?.rack.get(rk.rack.id) ?? (rk.nes.some(n => n.worst) ? 'minor' : null);
function reading(rk: RackL, layer: Layer) {
  if (layer === 'thermal') return `${rk.rack.tempC} °C`;
  if (layer === 'power') return `${rk.rack.drawKw} / ${rk.rack.budgetKw} kW`;
  if (layer === 'connectivity') { const d = rk.nes.reduce((a, n) => a + n.linksDown, 0); return d ? `${d} link${d > 1 ? 's' : ''} down` : rk.nes.some(n => n.edge) ? 'edge link' : 'internal'; }
  const n = rk.nes.reduce((a, x) => a + x.alarms, 0);
  return n ? `${n} alarm${n === 1 ? '' : 's'}` : 'healthy';
}

export function buildAnchors2(L: TwinLayout, data: TwinData, sel: Sel, level: Level, layer: Layer, att?: Attention, unit: string | null = null): Anchor2[] {
  const out: Anchor2[] = [];
  const dcId = data.dc.id;
  const short = (s: string) => s.replace(`${dcId}-`, '');
  if (level === 'building') {
    L.floors.forEach(f => {
      const a = att?.floor.get(f.idx);
      out.push({ id: `f${f.idx}`, world: [-f.w / 2 - 0.9, f.y + PLATE_T + 0.35, f.d / 2 + 0.6], cls: `t2-floor${a ? ` is-${a.sev}` : ''}`, text: f.name, sub: a ? `${a.n} issue${a.n > 1 ? 's' : ''}` : `${f.rooms.length} room${f.rooms.length > 1 ? 's' : ''}`, pick: { floor: f.idx }, dot: a ? LED[a.sev] : OK });
    });
    /* critical callouts: one per room, three at most — the panel lists everything */
    const seen = new Set<string>();
    (att?.items ?? []).filter(i => i.rackId && i.sev === 'critical' && !seen.has(i.roomId) && seen.add(i.roomId)).slice(0, 3).forEach(i => {
      const room = L.rooms.find(r => r.id === i.roomId); const rk = room?.racks.find(k => k.rack.id === i.rackId); if (!room || !rk) return;
      out.push({ id: `att${i.id}`, world: [room.x + rk.x, L.floors[room.floorIdx].y + PLATE_T + rk.h + 2.4, room.z + rk.z], cls: 't2-att is-critical', text: short(rk.rack.name), sub: i.title, pick: i.pick, dot: LED.critical });
    });
    if (L.dg) out.push({ id: 'dg', world: [L.dg.x, L.dg.h + 1.5, L.dg.z], cls: 't2-static t2-unit', pick: { unit: DG_KEY }, text: `DG · ${data.dc.power.dg.kva} kVA`, sub: `fuel ${data.dc.power.dg.fuelPct}%${data.dc.power.dg.result === 'Fail' ? ' · last test failed' : ''}`, dot: data.dc.power.dg.result === 'Pass' ? OK : LED.critical });
    return out;
  }
  const fi = sel.floor ?? 0; const floor = L.floors[fi]; const by = floor.y + PLATE_T;
  const focus = !!sel.rack || !!unit;
  for (const room of floor.rooms) {
    const open = sel.room === room.id && !focus;
    const rAtt = att?.room.get(room.id);
    if (!focus) out.push({ id: `r${room.id}`, world: [room.x - room.w / 2 + 0.7, by + 0.1, room.z + room.d / 2 - 0.55], cls: `t2-room${rAtt ? ` is-${rAtt}` : ''}${sel.room === room.id ? ' is-sel' : ''}`, text: room.name, sub: room.kind === 'power' ? `${room.power.length} plant units` : `${room.racks.length} racks${room.sensor ? ` · ${room.sensor.tempC}°C` : ''}`, pick: { floor: fi, room: room.id }, dot: rAtt ? LED[rAtt] : OK });
    /* inside an open room every rack is named with its status (as in the schematic twin); the label
       overlay steps overlapping names apart */
    for (const rk of room.racks) {
      const sev = rackSev(rk, att);
      const selected = sel.rack === rk.rack.id;
      if (!(selected || open || (!focus && sel.room === null && sev === 'critical'))) continue;
      const beacon = !!att?.rack.get(rk.rack.id) && !selected;
      const status = sev ? SEV_WORD[sev] : 'Healthy';
      out.push({ id: `k${rk.rack.id}`, world: [room.x + rk.x, by + rk.h + (beacon ? 1.05 : 0.5), room.z + rk.z], cls: `t2-rack${open && !selected ? ' is-compact' : ''}${sev ? ` is-${sev}` : ' is-ok'}${selected ? ' is-sel' : ''}`, text: short(rk.rack.name), sub: open && !selected ? undefined : reading(rk, layer), pick: { rack: rk.rack.id }, dot: sev ? LED[sev] : OK, title: `${rk.rack.name} · ${status} · ${reading(rk, layer)} · click to open the rack` });
      if (selected && sel.ne) {
        const ne = rk.nes.find(n => n.id === sel.ne);
        if (ne) {
          const centre = (ne.u - 1) * U_H + (ne.uSize * U_H) / 2 + 0.04;
          const lx = RACK_W / 2 + 0.08, lz = RACK_D / 2 + 0.05;
          out.push({ id: `e${ne.id}`, world: [room.x + rk.x + lx * Math.cos(rk.rot) + lz * Math.sin(rk.rot), by + centre, room.z + rk.z - lx * Math.sin(rk.rot) + lz * Math.cos(rk.rot)], cls: 't2-eq is-sel', text: short(ne.name), sub: `${ne.role} · U${ne.u}${ne.uSize > 1 ? `–${ne.u + ne.uSize - 1}` : ''}${ne.alarms ? ` · ${ne.alarms} alarm${ne.alarms > 1 ? 's' : ''}` : ''}`, pick: { rack: rk.rack.id, ne: ne.id } });
        }
      }
    }
    /* plant: units with a fault on the whole floor, every unit inside an open room, only the chosen one when focused */
    room.cooling.forEach(c => {
      const key = coolKey(c.unit.id); const bad = c.unit.status !== 'Operational';
      if (!(unit === key || (!focus && (bad || open)))) return;
      const cls = c.unit.status === 'Failed' ? ' is-critical' : bad ? ' is-major' : ' is-ok';
      out.push({ id: `c${c.unit.id}`, world: [room.x + c.x, by + (bad ? 2.9 : 2.35), room.z + c.z], cls: `t2-unit${cls}${unit === key ? ' is-sel' : ''}`, text: c.unit.name, sub: c.unit.status, dot: c.unit.status === 'Failed' ? LED.critical : bad ? LED.major : OK, pick: { unit: key }, title: `${c.unit.name} · ${c.unit.status} · click to zoom to it` });
    });
    room.power.forEach(p => {
      const key = powerKey(room.id, p.label);
      if (!(unit === key || (!focus && (p.state !== 'ok' || open)))) return;
      const word = p.ups ? p.ups.state : p.state === 'ok' ? 'Normal' : 'check';
      out.push({ id: `p${room.id}${p.label}`, world: [room.x + p.x, by + p.h + (p.state !== 'ok' ? 1.0 : 0.35), room.z + p.z], cls: `t2-unit is-${p.state === 'bad' ? 'critical' : p.state === 'warn' ? 'major' : 'ok'}${unit === key ? ' is-sel' : ''}`, text: p.label, sub: word, dot: p.state === 'bad' ? LED.critical : p.state === 'warn' ? LED.major : OK, pick: { unit: key }, title: `${p.label} · ${word} · click to zoom to it` });
    });
    if (layer === 'connectivity') room.racks.filter(r => r.nes.some(n => n.edge)).forEach(rk => {
      const far = rk.nes.find(n => n.edge); const down = rk.nes.some(n => n.linksDown);
      out.push({ id: `x${rk.rack.id}`, world: [room.x + room.w / 2 + 1.7, by + rk.h + 0.4, room.z + rk.z], cls: `t2-static${down ? ' is-critical' : ' is-edge'}`, text: `to ${far?.edgeTo ?? 'edge'}`, sub: down ? 'link down' : undefined, dot: down ? LED.critical : '#1C81EF' });
    });
  }
  if (fi === 0 && L.dg && (!focus || unit === DG_KEY)) out.push({ id: 'dg', world: [L.dg.x, floor.y + L.dg.h + 1.5, L.dg.z], cls: `t2-static t2-unit${unit === DG_KEY ? ' is-sel' : ''}`, pick: { unit: DG_KEY }, text: `DG · ${data.dc.power.dg.kva} kVA`, sub: `fuel ${data.dc.power.dg.fuelPct}%`, dot: data.dc.power.dg.result === 'Pass' ? OK : LED.critical });
  return out;
}
