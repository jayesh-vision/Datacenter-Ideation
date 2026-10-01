import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, ContactShadows, Edges, Line, Text } from '@react-three/drei';
import { CanvasTexture, RepeatWrapping, Vector3 } from 'three';
import type CameraControlsImpl from 'camera-controls';
import type { TwinData, TwinNe } from '../../../api/ext-twin';
import { PLATE_T, RACK_D, RACK_W, U_H, cameraPose, type FloorL, type Level, type PowerL, type RackL, type RoomL, type Sel, type TwinLayout } from './layout';
import { LIFT, type Anchor } from './anchors';

export type Layer = 'health' | 'power' | 'thermal' | 'connectivity';
export interface Hover { kind: 'floor' | 'room' | 'rack' | 'ne' | 'cooling' | 'power' | 'dg'; title: string; sub: string }
export interface Pick { floor?: number; room?: string; rack?: string; ne?: string }
export type PosMap = Map<string, [number, number, boolean]>;

/* Restrained palette: slate shell, graphite cabinets, brand blue accent; red/amber only for faults. */
const P = { plate: '#F1F5F9', slab: '#E9EEF4', wall: '#CBD5E1', body: '#334155', frame: '#475569', interior: '#1E293B', face: '#1F2937', rail: '#0F172A', accent: '#1C81EF', bad: '#EF4444', warn: '#F59E0B', ok: '#22C55E', cold: '#DBEAFE', hot: '#FEE2E2', tray: '#94A3B8', pipe: '#60A5FA', ghost: '#CBD5E1', crah: '#E2E8F0', plant: '#E2E8F0' };
const ROLE: Record<string, string> = { Router: '#3B82F6', Switch: '#2DD4BF', DWDM: '#94A3B8', Firewall: '#A78BFA', Access: '#60A5FA' };
const SEV_C: Record<string, string> = { critical: P.bad, major: P.warn, minor: '#FCD34D', warning: '#FDE68A' };
const DIM = 0.07;
const SEV_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2, warning: 3 };
const tempTone = (t: number) => (t > 27 ? P.bad : t > 25 ? P.warn : '#60A5FA');

/* status band colour per layer; null = no issue (band stays slate) */
export function bandTone(rk: RackL, layer: Layer): string | null {
  if (layer === 'power') { const r = rk.rack.budgetKw ? rk.rack.drawKw / rk.rack.budgetKw : 0; return r >= 0.85 ? P.bad : r >= 0.75 ? P.warn : P.accent; }
  if (layer === 'thermal') return tempTone(rk.rack.tempC);
  if (layer === 'connectivity') return rk.nes.some(n => n.linksDown) ? P.bad : rk.nes.some(n => n.edge) ? P.accent : '#94A3B8';
  const sev = rk.nes.reduce<number>((w, n) => Math.min(w, n.worst ? SEV_RANK[n.worst] : 9), 9);
  return sev === 0 ? P.bad : sev === 1 ? P.warn : sev < 9 ? '#FCD34D' : null;
}
const slabTone = (room: RoomL, layer: Layer) => (layer === 'thermal' && room.sensor ? (room.sensor.tempC > 27 ? '#FCA5A5' : room.sensor.tempC > 25 ? '#FDE68A' : '#BFDBFE') : room.kind === 'power' ? P.plant : P.slab);

const Std = ({ color, dim, rough = 0.85, metal = 0.05, opacity = 1, emissive, ei = 0.7 }: { color: string; dim: boolean; rough?: number; metal?: number; opacity?: number; emissive?: string; ei?: number }) => (
  <meshStandardMaterial color={color} roughness={rough} metalness={metal} transparent opacity={dim ? DIM : opacity} depthWrite={!dim && opacity > 0.5} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? ei : 0} />
);

interface Ctx { L: TwinLayout; data: TwinData; layer: Layer; sel: Sel; level: Level; onPick: (p: Pick) => void; setHover: (h: Hover | null) => void }
type Ev = { stopPropagation: () => void };

/* faceplate texture: rows of small port rectangles + two handles, drawn once */
let faceTex: CanvasTexture | null = null;
function getFaceTex() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1F2937'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#0F172A';
  for (let x = 70; x < 440; x += 14) for (const y of [18, 38]) g.fillRect(x, y, 9, 8);
  g.fillStyle = '#334155'; g.fillRect(22, 22, 10, 20); g.fillRect(480, 22, 10, 20);
  faceTex = new CanvasTexture(c); faceTex.wrapS = faceTex.wrapT = RepeatWrapping; faceTex.anisotropy = 4;
  return faceTex;
}
let railTex: CanvasTexture | null = null;
function getRailTex() {
  if (railTex) return railTex;
  const c = document.createElement('canvas'); c.width = 16; c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0F172A'; g.fillRect(0, 0, 16, 48);
  g.fillStyle = '#475569'; for (const y of [6, 22, 38]) g.fillRect(5, y, 6, 5);
  railTex = new CanvasTexture(c); railTex.wrapS = railTex.wrapT = RepeatWrapping;
  return railTex;
}

function Equipment({ ne, rk, ctx, detail, dim }: { ne: TwinNe; rk: RackL; ctx: Ctx; detail: boolean; dim: boolean }) {
  const h = ne.uSize * U_H - 0.006, y = (ne.u - 1) * U_H + h / 2 + 0.04;
  const ghost = ne.discovery === 'not-discovered';
  const selected = ctx.sel.ne === ne.id;
  const otherSel = ctx.level === 'equipment' && !selected;
  const psuBad = ne.modules.some(m => /PSU|PEM/.test(m.slot) && m.state === 'Fault');
  const led = ne.worst ? SEV_C[ne.worst] : P.ok;
  const zf = RACK_D / 2 - 0.08;
  const strip = ROLE[ne.role] ?? P.frame;
  const tex = useMemo(() => (detail && !ghost ? getFaceTex() : null), [detail, ghost]);
  const op = ghost ? 0.3 : otherSel ? 0.35 : 1;
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow onClick={(e: Ev) => { e.stopPropagation(); ctx.onPick({ rack: rk.rack.id, ne: ne.id }); }}
        onPointerOver={(e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'ne', title: ne.name, sub: `${ne.role} · ${ne.vendor} ${ne.model} · U${ne.u}${ne.uSize > 1 ? `–${ne.u + ne.uSize - 1}` : ''}${ghost ? ' · not discovered' : ne.alarms ? ` · ${ne.alarms} alarm${ne.alarms > 1 ? 's' : ''}` : ' · healthy'}` }); }}
        onPointerOut={() => ctx.setHover(null)}>
        <boxGeometry args={[RACK_W - 0.07, h, RACK_D - 0.16]} />
        <Std color={ghost ? P.ghost : P.face} dim={dim} opacity={op} rough={0.6} metal={0.3} />
        {selected && <Edges color={P.accent} lineWidth={2.5} />}
      </mesh>
      {/* faceplate with port texture */}
      {tex && !dim && <mesh position={[0, 0, zf + 0.001]}><planeGeometry args={[RACK_W - 0.08, h - 0.004]} /><meshStandardMaterial map={tex} roughness={0.7} metalness={0.2} transparent opacity={op} /></mesh>}
      {/* role strip on the left edge of the faceplate */}
      {!dim && !ghost && <mesh position={[-RACK_W / 2 + 0.05, 0, zf + 0.002]}><planeGeometry args={[0.012, h - 0.008]} /><meshStandardMaterial color={strip} emissive={strip} emissiveIntensity={0.35} transparent opacity={op} /></mesh>}
      {detail && !ghost && (
        <>
          <mesh position={[-RACK_W / 2 + 0.085, h / 2 - 0.012, zf + 0.003]}><sphereGeometry args={[0.006, 10, 10]} /><meshStandardMaterial color={led} emissive={led} emissiveIntensity={1.6} transparent opacity={op} /></mesh>
          <mesh position={[RACK_W / 2 - 0.085, -h / 2 + 0.012, zf + 0.003]}><boxGeometry args={[0.012, 0.006, 0.003]} /><meshStandardMaterial color={P.ok} emissive={P.ok} emissiveIntensity={0.9} transparent opacity={op} /></mesh>
          <mesh position={[RACK_W / 2 - 0.06, -h / 2 + 0.012, zf + 0.003]}><boxGeometry args={[0.012, 0.006, 0.003]} /><meshStandardMaterial color={psuBad ? P.bad : P.ok} emissive={psuBad ? P.bad : P.ok} emissiveIntensity={0.9} transparent opacity={op} /></mesh>
          <Line points={[[RACK_W / 2 - 0.02, 0, zf - 0.02], [RACK_W / 2 - 0.02, rk.h - y + 0.02, zf - 0.02]]} color="#64748B" lineWidth={1} transparent opacity={0.6 * op} />
        </>
      )}
    </group>
  );
}

function Rack3D({ rk, room, floor, ctx }: { rk: RackL; room: RoomL; floor: FloorL; ctx: Ctx }) {
  const { sel, level, layer } = ctx;
  const inRoom = sel.room === room.id;
  const selected = sel.rack === rk.rack.id;
  const dim = (level === 'floor' && sel.floor !== floor.idx) || ((level === 'room' || level === 'rack' || level === 'equipment') && !inRoom) || ((level === 'rack' || level === 'equipment') && !selected);
  const showEq = level !== 'building' && (level === 'floor' ? sel.floor === floor.idx : inRoom);
  const detail = selected && (level === 'rack' || level === 'equipment');
  const ghostRack = ctx.data.dc.status === 'planned' || (rk.nes.length > 0 && rk.nes.every(n => n.discovery === 'not-discovered'));
  const band = bandTone(rk, layer);
  const critical = layer === 'health' && band === P.bad;
  const bodyC = ghostRack ? P.ghost : P.body, frameC = ghostRack ? P.ghost : P.frame;
  const bodyOp = ghostRack ? 0.35 : 1;
  const h = rk.h, t = 0.025;
  const odf = rk.rack.role === 'ODF / patching';
  const rail = useMemo(() => (showEq && !dim ? getRailTex() : null), [showEq, dim]);
  const pick = (e: Ev) => { e.stopPropagation(); ctx.onPick({ rack: rk.rack.id }); };
  const over = (e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'rack', title: rk.rack.name, sub: `${rk.rack.role} · ${rk.rack.usedU}/${rk.rack.heightU} U · ${rk.rack.drawKw} / ${rk.rack.budgetKw} kW · ${rk.rack.tempC}°C inlet · ${rk.nes.length} devices` }); };
  const out = () => ctx.setHover(null);
  const ev = { onClick: pick, onPointerOver: over, onPointerOut: out };
  const metal = { rough: 0.45, metal: 0.35 };
  return (
    <group position={[rk.x, 0, rk.z]} rotation={[0, rk.rot, 0]}>
      {/* graphite frame: sides, top, bottom, back; open front */}
      <mesh position={[-RACK_W / 2 + t / 2, h / 2, 0]} castShadow {...ev}><boxGeometry args={[t, h, RACK_D]} /><Std color={frameC} dim={dim} opacity={bodyOp} {...metal} /></mesh>
      <mesh position={[RACK_W / 2 - t / 2, h / 2, 0]} castShadow {...ev}><boxGeometry args={[t, h, RACK_D]} /><Std color={frameC} dim={dim} opacity={bodyOp} {...metal} /></mesh>
      <mesh position={[0, h - t / 2, 0]} castShadow {...ev}><boxGeometry args={[RACK_W, t, RACK_D]} /><Std color={frameC} dim={dim} opacity={bodyOp} {...metal} /></mesh>
      <mesh position={[0, t / 2, 0]}><boxGeometry args={[RACK_W, t, RACK_D]} /><Std color={P.rail} dim={dim} opacity={bodyOp} /></mesh>
      <mesh position={[0, h / 2, -RACK_D / 2 + t / 2]} {...ev}><boxGeometry args={[RACK_W, h, t]} /><Std color={bodyC} dim={dim} opacity={bodyOp} rough={0.7} metal={0.2} /></mesh>
      {/* dark interior with rail holes, visible wherever no equipment sits */}
      {showEq && <mesh position={[0, h / 2, -RACK_D / 2 + t + 0.002]}><planeGeometry args={[RACK_W - 2 * t, h - 2 * t]} />{rail ? <meshStandardMaterial color={P.interior} map={rail} map-repeat={[1, rk.rack.heightU]} roughness={0.95} transparent opacity={dim ? DIM : bodyOp} depthWrite={!dim} /> : <Std color={P.interior} dim={dim} opacity={bodyOp} rough={0.95} />}</mesh>}
      {showEq && !dim && <mesh position={[-RACK_W / 2 + t + 0.012, h / 2, RACK_D / 2 - 0.05]}><planeGeometry args={[0.022, h - 2 * t]} /><meshStandardMaterial color={P.rail} map={rail ?? undefined} map-repeat={[1, rk.rack.heightU]} roughness={0.9} /></mesh>}
      {showEq && !dim && <mesh position={[RACK_W / 2 - t - 0.012, h / 2, RACK_D / 2 - 0.05]}><planeGeometry args={[0.022, h - 2 * t]} /><meshStandardMaterial color={P.rail} map={rail ?? undefined} map-repeat={[1, rk.rack.heightU]} roughness={0.9} /></mesh>}
      {/* closed cabinet door at building level */}
      {!showEq && <mesh position={[0, h / 2, 0]} castShadow {...ev}><boxGeometry args={[RACK_W - 0.04, h - 0.04, RACK_D - 0.04]} /><Std color={bodyC} dim={dim} opacity={bodyOp} rough={0.5} metal={0.25} /></mesh>}
      {!showEq && !dim && !ghostRack && <mesh position={[0, h * 0.5, RACK_D / 2 - 0.015]}><planeGeometry args={[RACK_W - 0.12, h - 0.3]} /><meshStandardMaterial color="#1E293B" roughness={0.8} metalness={0.1} /></mesh>}
      {/* status band: top edge + front header */}
      <mesh position={[0, h + 0.012, 0]}><boxGeometry args={[RACK_W + 0.01, 0.024, RACK_D + 0.01]} /><Std color={band ?? '#64748B'} dim={dim} opacity={bodyOp} emissive={band ?? undefined} ei={critical ? 1.1 : 0.55} rough={0.4} /></mesh>
      <mesh position={[0, h - 0.07, RACK_D / 2 + 0.004]}><planeGeometry args={[RACK_W - 0.04, 0.05]} /><Std color={band ?? '#64748B'} dim={dim} opacity={bodyOp} emissive={band ?? undefined} ei={critical ? 1.1 : 0.5} rough={0.4} /></mesh>
      {critical && !dim && <mesh position={[0, h / 2, 0]}><boxGeometry args={[RACK_W + 0.03, h + 0.03, RACK_D + 0.03]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color={P.bad} lineWidth={1.5} transparent opacity={0.8} /></mesh>}
      {showEq && rk.nes.map(n => <Equipment key={n.id} ne={n} rk={rk} ctx={ctx} detail={detail} dim={dim} />)}
      {showEq && odf && <mesh position={[0, (rk.rack.usedU - 9) * U_H + 0.04, 0]}><boxGeometry args={[RACK_W - 0.07, 18 * U_H - 0.01, RACK_D - 0.2]} /><Std color="#64748B" dim={dim} rough={0.9} /></mesh>}
      {detail && <Line points={[[RACK_W / 2 - 0.02, h + 0.03, RACK_D / 2 - 0.1], [RACK_W / 2 - 0.02, h + 0.45, RACK_D / 2 - 0.1], [RACK_W / 2 - 0.02, h + 0.45, 0]]} color="#475569" lineWidth={2} />}
      {selected && <mesh position={[0, h / 2, 0]}><boxGeometry args={[RACK_W + 0.02, h + 0.04, RACK_D + 0.02]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color={P.accent} lineWidth={2} /></mesh>}
    </group>
  );
}

function Cooling({ c, dim, ctx }: { c: RoomL['cooling'][number]; dim: boolean; ctx: Ctx }) {
  const u = c.unit; const bad = u.status === 'Failed', maint = u.status === 'Maintenance';
  const led = bad ? P.bad : maint ? P.warn : P.accent;
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position={[0, 1.0, 0]} castShadow onPointerOver={(e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'cooling', title: u.name, sub: `${u.type} · ${u.status} · ${u.loadPct}% of ${u.capacityKw} kW · supply ${u.supplyC}°C / return ${u.returnC}°C` }); }} onPointerOut={() => ctx.setHover(null)}>
        <boxGeometry args={[c.w, 2.0, 0.8]} /><Std color={P.crah} dim={dim} rough={0.4} metal={0.15} />{!dim && <Edges color="#94A3B8" />}
      </mesh>
      <mesh position={[0, 1.35, 0.405]}><planeGeometry args={[c.w - 0.2, 0.9]} /><Std color="#64748B" dim={dim} rough={0.9} /></mesh>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[0, 0.98 + i * 0.15, 0.408]}><planeGeometry args={[c.w - 0.26, 0.02]} /><Std color="#334155" dim={dim} /></mesh>)}
      <mesh position={[0, 0.25, 0.405]}><planeGeometry args={[c.w - 0.2, 0.05]} /><Std color={led} dim={dim} emissive={led} /></mesh>
    </group>
  );
}

function Plant({ p, dim, ctx }: { p: PowerL; dim: boolean; ctx: Ctx }) {
  const c = p.state === 'bad' ? P.bad : p.state === 'warn' ? P.warn : P.ok;
  const sub = p.ups ? `${p.ups.state} · ${p.ups.loadPct}% of ${p.ups.capacityKw} kW · ${p.ups.redundancy} · ${p.ups.batteryMin} min autonomy` : p.kind === 'battery' ? 'DC plant battery bank' : 'AC → 48 V DC rectifier';
  const over = (e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'power', title: p.label, sub }); };
  const out = () => ctx.setHover(null);
  const zf = p.d / 2 + 0.003;
  if (p.kind === 'battery') {
    const cols = Math.max(4, Math.round(p.w / 0.26)), rows = 4;
    return (
      <group position={[p.x, 0, p.z]}>
        <mesh position={[0, p.h / 2, 0]} castShadow onPointerOver={over} onPointerOut={out}><boxGeometry args={[p.w, p.h, p.d]} /><Std color={P.frame} dim={dim} rough={0.5} metal={0.3} opacity={0.35} /><Edges color="#64748B" /></mesh>
        {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, k) => (
          <mesh key={`${r}-${k}`} position={[-p.w / 2 + 0.14 + k * (p.w - 0.28) / (cols - 1), 0.16 + r * (p.h - 0.3) / (rows - 1) + 0.04, 0.04]} castShadow><boxGeometry args={[0.2, 0.24, p.d - 0.3]} /><Std color="#1E293B" dim={dim} rough={0.6} metal={0.2} /></mesh>
        )))}
        <mesh position={[0, p.h - 0.05, zf]}><planeGeometry args={[p.w - 0.3, 0.04]} /><Std color={c} dim={dim} emissive={c} /></mesh>
      </group>
    );
  }
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position={[0, p.h / 2, 0]} castShadow onPointerOver={over} onPointerOut={out}><boxGeometry args={[p.w, p.h, p.d]} /><Std color={p.kind === 'ups' ? '#CBD5E1' : '#D6DEE8'} dim={dim} rough={0.45} metal={0.3} />{!dim && <Edges color="#64748B" />}</mesh>
      {/* front door panel, display, LED strip */}
      <mesh position={[0, p.h / 2, zf]}><planeGeometry args={[p.w - 0.16, p.h - 0.2]} /><Std color="#94A3B8" dim={dim} rough={0.5} metal={0.2} /></mesh>
      <mesh position={[0, p.h - 0.42, zf + 0.002]}><planeGeometry args={[p.w - 0.4, 0.22]} /><Std color="#0F172A" dim={dim} rough={0.3} /></mesh>
      {p.kind === 'ups' && <mesh position={[-p.w / 2 + 0.22, p.h - 0.42, zf + 0.004]}><planeGeometry args={[0.14, 0.1]} /><Std color={P.accent} dim={dim} emissive={P.accent} ei={0.5} /></mesh>}
      {p.kind === 'rectifier' && Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[0, 0.35 + i * 0.18, zf + 0.002]}><planeGeometry args={[p.w - 0.4, 0.1]} /><Std color="#64748B" dim={dim} rough={0.6} /></mesh>)}
      <mesh position={[0, p.h - 0.16, zf + 0.002]}><planeGeometry args={[p.w - 0.3, 0.04]} /><Std color={c} dim={dim} emissive={c} /></mesh>
    </group>
  );
}

/* text painted on the slab: room name, racks, temperature */
function SlabLabel({ room, y, dim }: { room: RoomL; y: number; dim: boolean }) {
  const sub = room.kind === 'power' ? `${room.power.length} plant units` : `${room.racks.length} racks${room.sensor ? ` · ${room.sensor.tempC}°C` : ''}`;
  const z = room.d / 2 - 0.55;
  return (
    <group position={[-room.w / 2 + 0.3, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <Text fontSize={0.42} color={dim ? '#CBD5E1' : '#334155'} anchorX="left" anchorY="middle" font={undefined} fillOpacity={dim ? 0.4 : 0.9} outlineWidth={0.012} outlineColor="#F8FAFC">{room.name}</Text>
      <Text position={[0, -0.42, 0]} fontSize={0.24} color={dim ? '#CBD5E1' : '#64748B'} anchorX="left" anchorY="middle" fillOpacity={dim ? 0.4 : 0.9}>{sub}</Text>
    </group>
  );
}

function Room3D({ room, floor, ctx }: { room: RoomL; floor: FloorL; ctx: Ctx }) {
  const { sel, level, layer } = ctx;
  const dim = (level === 'floor' && sel.floor !== floor.idx) || (level !== 'building' && level !== 'floor' && sel.room !== room.id);
  const zoomed = level !== 'building' && level !== 'floor' && sel.room === room.id;
  const pick = (e: Ev) => { e.stopPropagation(); ctx.onPick(level === 'building' ? { floor: floor.idx } : { floor: floor.idx, room: room.id }); };
  const over = (e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'room', title: `${room.name} · ${floor.name}`, sub: room.kind === 'power' ? `${room.power.length} plant units` : `${room.racks.length} racks · ${room.racks.reduce((a, r) => a + r.nes.length, 0)} devices · ${room.cooling.length} cooling units${room.sensor ? ` · ${room.sensor.tempC}°C / ${room.sensor.humidity}% RH` : ''}` }); };
  const out = () => ctx.setHover(null);
  const thermal = layer === 'thermal';
  const conn = layer === 'connectivity';
  const showStubs = conn && !dim && (level === 'building' || level === 'floor' || zoomed);
  const edgeRacks = showStubs ? room.racks.filter(r => r.nes.some(n => n.edge)) : [];
  const downRacks = showStubs ? room.racks.filter(r => r.nes.some(n => n.linksDown)) : [];
  const stubX = room.w / 2 + 0.9;
  return (
    <group position={[room.x, 0, room.z]}>
      <mesh position={[0, 0.03, 0]} receiveShadow onClick={pick} onPointerOver={over} onPointerOut={out}><boxGeometry args={[room.w, 0.06, room.d]} /><Std color={slabTone(room, layer)} dim={dim} rough={0.95} /><Edges color={dim ? '#E2E8F0' : '#94A3B8'} /></mesh>
      {(level === 'building' || level === 'floor') && <SlabLabel room={room} y={0.07} dim={dim} />}
      {/* glass walls with visible edges */}
      <mesh position={[0, 1.45, 0]} onClick={pick} onPointerOver={over} onPointerOut={out}><boxGeometry args={[room.w, 2.9, room.d]} /><meshPhysicalMaterial color="#DBEAFE" transparent opacity={dim ? 0.02 : zoomed ? 0.04 : 0.1} roughness={0.15} metalness={0} depthWrite={false} /><Edges color={dim ? '#EEF2F6' : '#94A3B8'} lineWidth={1} /></mesh>
      {room.aisles.map((a, i) => <mesh key={i} position={[a.x, 0.065, a.z]} receiveShadow><boxGeometry args={[a.w, 0.01, a.d]} /><Std color={a.kind === 'cold' ? (thermal ? '#93C5FD' : P.cold) : (thermal ? '#FCA5A5' : P.hot)} dim={dim} rough={1} opacity={thermal ? 1 : 0.9} /></mesh>)}
      {zoomed && room.aisles.filter(a => a.kind === 'cold').map((a, i) => <mesh key={`c${i}`} position={[a.x, 2.25, a.z]}><boxGeometry args={[a.w, 0.08, a.d]} /><meshStandardMaterial color="#93C5FD" transparent opacity={thermal ? 0.35 : 0.2} depthWrite={false} /><Edges color="#93C5FD" /></mesh>)}
      {room.racks.map(rk => <Rack3D key={rk.rack.id} rk={rk} room={room} floor={floor} ctx={ctx} />)}
      {room.cooling.map(c => <Cooling key={c.unit.id} c={c} dim={dim} ctx={ctx} />)}
      {room.power.map(p => <Plant key={p.label} p={p} dim={dim} ctx={ctx} />)}
      {level !== 'building' && room.trays.map((t, i) => <mesh key={`t${i}`} position={[(t.x1 + t.x2) / 2, t.y, t.z]}><boxGeometry args={[t.x2 - t.x1, 0.06, 0.3]} /><Std color={P.tray} dim={dim} rough={0.6} metal={0.3} /></mesh>)}
      {level !== 'building' && !dim && room.pipes.map((p, i) => <Line key={`p${i}`} points={[[p.x1, 0.22, p.z1], [p.x2, 0.22, p.z2]]} color={P.pipe} lineWidth={3} />)}
      {/* connectivity: edge links leave the rack row towards the far datacenter */}
      {edgeRacks.map(rk => { const far = rk.nes.find(n => n.edge); const down = downRacks.includes(rk); return (
        <group key={`e${rk.rack.id}`}>
          <Line points={[[rk.x, rk.h + 0.4, rk.z], [stubX, rk.h + 0.4, rk.z], [stubX + 0.6, rk.h + 0.4, rk.z]]} color={down ? P.bad : P.accent} lineWidth={down ? 3 : 2} dashed={down} dashSize={0.15} gapSize={0.08} />
          <Text position={[stubX + 0.7, rk.h + 0.4, rk.z]} fontSize={0.2} color={down ? P.bad : '#334155'} anchorX="left" anchorY="middle" outlineWidth={0.01} outlineColor="#F8FAFC">{`to ${far?.edgeTo ?? 'edge'}${down ? ' · down' : ''}`}</Text>
        </group>
      ); })}
    </group>
  );
}

function Floor3D({ floor, ctx }: { floor: FloorL; ctx: Ctx }) {
  const { sel, level } = ctx;
  const isolate = level !== 'building' && sel.floor !== null;
  const dim = isolate && sel.floor !== floor.idx;
  const lift = isolate && sel.floor !== null && floor.idx > sel.floor ? LIFT : 0;
  return (
    <group position={[0, floor.y + lift, 0]}>
      <mesh position={[0, PLATE_T / 2, 0]} receiveShadow onClick={(e: Ev) => { e.stopPropagation(); ctx.onPick({ floor: floor.idx }); }}
        onPointerOver={(e: Ev) => { e.stopPropagation(); ctx.setHover({ kind: 'floor', title: floor.name, sub: `${floor.rooms.length} rooms · ${floor.rooms.reduce((a, r) => a + r.racks.length, 0)} racks` }); }} onPointerOut={() => ctx.setHover(null)}>
        <boxGeometry args={[floor.w, PLATE_T, floor.d]} /><Std color={P.plate} dim={dim} rough={0.95} /><Edges color={dim ? '#E2E8F0' : '#64748B'} lineWidth={1.2} />
      </mesh>
      <group position={[0, PLATE_T, 0]}>{floor.rooms.map(r => <Room3D key={r.id} room={r} floor={floor} ctx={ctx} />)}</group>
    </group>
  );
}

/* grid only inside the building footprint */
function FootprintGrid({ w, d }: { w: number; d: number }) {
  const pts = useMemo(() => {
    const out: [number, number, number][][] = [];
    for (let x = -Math.floor(w / 2); x <= w / 2; x += 1) out.push([[x, 0, -d / 2], [x, 0, d / 2]]);
    for (let z = -Math.floor(d / 2); z <= d / 2; z += 1) out.push([[-w / 2, 0, z], [w / 2, 0, z]]);
    return out;
  }, [w, d]);
  return <group position={[0, 0.002, 0]}>{pts.map((p, i) => <Line key={i} points={p} color="#CBD5E1" lineWidth={0.6} transparent opacity={0.55} />)}</group>;
}

function Rig({ pose }: { pose: [number[], number[]] }) {
  const ref = useRef<CameraControlsImpl>(null);
  const key = pose.flat().map(n => n.toFixed(2)).join(',');
  const first = useRef(true);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const [e, t] = pose;
    c.setLookAt(e[0], e[1], e[2], t[0], t[1], t[2], !first.current);
    first.current = false;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <CameraControls ref={ref} makeDefault minDistance={0.6} maxDistance={90} maxPolarAngle={Math.PI / 2.05} dollyToCursor smoothTime={0.5} />;
}

function Projector({ anchors, posRef }: { anchors: Anchor[]; posRef: MutableRefObject<PosMap> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const m = posRef.current;
    for (const a of anchors) {
      v.set(a.world[0], a.world[1], a.world[2]).project(camera);
      const vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      m.set(a.id, [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, vis]);
    }
  });
  return null;
}

export function TwinScene({ L, data, layer, sel, level, onPick, setHover, anchors, posRef }: Ctx & { anchors: Anchor[]; posRef: MutableRefObject<PosMap> }) {
  const ctx: Ctx = { L, data, layer, sel, level, onPick, setHover };
  const pose = useMemo(() => cameraPose(L, sel), [L, sel]);
  const { w, d, h } = L.building;
  const shell = level === 'building';
  const dg = data.dc.power.dg;
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 36, near: 0.05, far: 300, position: pose[0] as [number, number, number] }} gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }} onPointerMissed={() => onPick({})}>
      <color attach="background" args={['#F8FAFC']} />
      <fog attach="fog" args={['#F8FAFC', 70, 150]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#ffffff', '#94A3B8', 0.6]} />
      <directionalLight position={[16, 26, 12]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-bias={-0.0004} />
      <directionalLight position={[-12, 10, -8]} intensity={0.35} />
      <mesh position={[0, -0.1, 0]} receiveShadow><boxGeometry args={[w + 8, 0.2, d + 8]} /><meshStandardMaterial color="#EEF2F6" roughness={1} /></mesh>
      <FootprintGrid w={w} d={d} />
      <ContactShadows position={[0, 0.01, 0]} scale={Math.max(w, d) + 8} blur={2.2} opacity={0.35} far={6} resolution={512} frames={1} />
      {/* building shell: faint glass with crisp edges */}
      <mesh position={[0, h / 2 + 0.3, 0]}><boxGeometry args={[w, h + 0.6, d]} /><meshPhysicalMaterial color="#DBEAFE" transparent opacity={shell ? 0.08 : 0.015} roughness={0.1} depthWrite={false} /><Edges color={shell ? '#64748B' : '#E2E8F0'} lineWidth={1.2} /></mesh>
      {L.dg && (
        <group position={[L.dg.x, 0, L.dg.z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow><boxGeometry args={[L.dg.w + 0.8, 0.2, L.dg.d + 0.8]} /><meshStandardMaterial color="#CBD5E1" roughness={1} /></mesh>
          <mesh position={[0, 0.2 + L.dg.h * 0.33, 0]} castShadow onPointerOver={(e: Ev) => { e.stopPropagation(); setHover({ kind: 'dg', title: `DG set ${dg.kva} kVA`, sub: `fuel ${dg.fuelPct}% · ${dg.runtimeH} h runtime · last test ${dg.result}` }); }} onPointerOut={() => setHover(null)}><boxGeometry args={[L.dg.w, L.dg.h * 0.66, L.dg.d]} /><meshStandardMaterial color="#475569" roughness={0.5} metalness={0.4} /><Edges color="#1E293B" /></mesh>
          <mesh position={[0, 0.2 + L.dg.h * 0.66 + L.dg.h * 0.17, 0]} castShadow><boxGeometry args={[L.dg.w + 0.3, L.dg.h * 0.34, L.dg.d + 0.3]} /><meshStandardMaterial color="#E2E8F0" roughness={0.5} metalness={0.2} /><Edges color="#94A3B8" /></mesh>
          <mesh position={[L.dg.w / 2 - 0.4, 0.2 + L.dg.h + 0.3, 0]}><cylinderGeometry args={[0.1, 0.1, 0.6, 12]} /><meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} /></mesh>
          <mesh position={[-L.dg.w / 2 + 0.5, 0.2 + L.dg.h * 0.66 + 0.02, L.dg.d / 2 + 0.01]}><planeGeometry args={[0.5, 0.05]} /><meshStandardMaterial color={dg.result === 'Pass' ? P.ok : P.bad} emissive={dg.result === 'Pass' ? P.ok : P.bad} emissiveIntensity={0.6} /></mesh>
        </group>
      )}
      {L.floors.map(f => <Floor3D key={f.idx} floor={f} ctx={ctx} />)}
      <Projector anchors={anchors} posRef={posRef} />
      <Rig pose={pose} />
    </Canvas>
  );
}
